/**
 * Session HTTP surface: list, create/upsert, read, archive and delete.
 *
 * The Zod payload shape and the pre-parse sanitizer live in ./payload.ts;
 * SQL projections and pagination live in ./read.ts.
 */
import { Router } from 'express';
import { eq, and, gt, isNull, sql, inArray } from 'drizzle-orm';
import fs from 'node:fs/promises';
import { codeInterpreter } from '../../services/codeInterpreter/index.js';
import { removeSessionWorkspacesForUser } from '../../services/tools/agentRuntime.js';
import { getDb } from '../../db/index.js';
import {
  sessions,
  messages,
  mistakes,
  artifacts,
  artifactVersions,
  agentRuns,
  usageEvents,
  files,
} from '../../db/schema/index.js';
import { requireAuth } from '../../middleware/auth.js';
import { resourceScope } from '../../middleware/scopes.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { durableJsonWrite } from '../../middleware/durableIdempotency.js';
import { NotFound, BadRequest } from '../../lib/errors.js';
import { sanitizeStoredHtml } from '../../lib/sanitize.js';
import { isUuid } from '../../lib/validate.js';
import { sanitizeLogValue } from '../../lib/logRedaction.js';
import { saveSession } from './save.js';
import { requireOwnedSession } from '../../lib/sessionOwnership.js';
import {
  parseSessionListCursor,
  readSessionDetail,
  readSessionList,
  readSessionMessagePage,
  sessionReadLimit,
} from './read.js';

const router = Router();

router.use(requireAuth, resourceScope('sessions'));

router.get('/', async (req, res, next) => {
  try {
    const { limit, cursor, archived, cursorVersion } = req.query;
    return res.json(
      await readSessionList(getDb(), req.userId!, {
        limit: sessionReadLimit(limit, 50),
        archived: archived === 'true',
        cursor: parseSessionListCursor(cursor),
        versionedCursor: cursorVersion === '2',
      }),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', writeLimiter, saveSession);

router.get('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');
    const tail = req.query.tail;
    const limit = typeof tail === 'string' && tail ? sessionReadLimit(tail, 100) : null;
    return res.json(await readSessionDetail(db, session, limit));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    if (!isUuid(sessionId)) throw new NotFound('Session not found');
    const db = getDb();
    const userId = req.userId!;
    const before =
      typeof req.query.before === 'string' && req.query.before ? req.query.before : null;
    const beforeId =
      typeof req.query.beforeId === 'string' && req.query.beforeId ? req.query.beforeId : null;
    let cursorError = '';
    if (Boolean(before) !== Boolean(beforeId))
      cursorError = 'before and beforeId must be given together';
    else if (before && Number.isNaN(Date.parse(before))) cursorError = 'Invalid before timestamp';
    else if (beforeId && !isUuid(beforeId)) cursorError = 'Invalid beforeId';
    if (cursorError) {
      await requireOwnedSession(db, sessionId, userId);
      throw new BadRequest(cursorError);
    }
    const cursor = before && beforeId ? { createdAt: before, id: beforeId } : null;
    return res.json(
      await readSessionMessagePage(
        db,
        sessionId,
        userId,
        sessionReadLimit(req.query.limit, 100),
        cursor,
      ),
    );
  } catch (err) {
    next(err);
  }
});

/* ─── Update session (partial) ─── */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [existing] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Session not found');

    const allowed = [
      'title',
      'topic',
      'mode',
      'phase',
      'kind',
      'examData',
      'domain',
      'pinned',
      'projectId',
      'kbNodes',
      'mistakes',
      'totalQ',
      'currentNode',
      'streamingText',
      'streamingReasoning',
      'teachingStage',
      'currentExampleIdx',
      'practiceAttempts',
      'practicePhase',
      'teachingPlan',
      'boundariesHistory',
      'mistakeFilter',
      'branchedFrom',
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (req.body.assistantId !== undefined) {
      const assistantId = req.body.assistantId;
      if (assistantId !== null) {
        if (!isUuid(assistantId)) throw new BadRequest('Invalid assistantId');
        const [ownedAssistant] = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(
            and(
              eq(artifacts.id, assistantId),
              eq(artifacts.userId, req.userId!),
              eq(artifacts.type, 'assistant'),
            ),
          )
          .limit(1);
        if (!ownedAssistant)
          throw new BadRequest('assistantId does not reference one of your assistants');
      }
      patch.assistantId = assistantId;
    }
    patch.updatedAt = new Date();

    await db.update(sessions).set(patch).where(eq(sessions.id, req.params.id));
    const [updated] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, req.params.id))
      .limit(1);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

/* ─── Delete / purge session ─── */
/* when a session is deleted, wipe every row that
 * references its id so no conversation content lingers on the server.
 * This covers mistakes (Q&A text), artifacts (source code generated
 * in-chat), agent runs (task/plan), usage events, and file metadata
 * + physical disk files. The transaction guard prevents a concurrent
 * POST /api/sessions from resurrecting the id before the DELETE
 * completes. Messages and sessionTags/shares are cleaned by FK
 * cascade; we also delete them explicitly for clarity. */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    let deletedFilePaths: string[] = [];

    await db.transaction(async (tx) => {
      /* acquire FOR UPDATE lock on the session
       * row BEFORE attempting to delete it. This serializes with the
       * POST handler's existence check (which also uses FOR UPDATE),
       * preventing a race where a concurrent POST's SELECT ... FOR UPDATE
       * sees the row, then our DELETE completes, then the POST's
       * INSERT ... ON CONFLICT resurrects the just-deleted row.
       * Without the lock, the DELETE's no-lock SELECT would see the row
       * and proceed to delete it, but the POST's FOR-UPDATE SELECT
       * (which blocked on our row-level lock during the delete) would
       * re-check after our commit, find no row, and generate a fresh
       * UUID — creating a duplicate session. */
      const [session] = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
        .for('update')
        .limit(1);
      if (!session) throw new NotFound('Session not found');

      const sessionArtifacts = await tx
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.sessionId, req.params.id));
      if (sessionArtifacts.length > 0) {
        const artIds = sessionArtifacts.map((a) => a.id);
        await tx.delete(artifactVersions).where(inArray(artifactVersions.artifactId, artIds));
      }
      await tx.delete(artifacts).where(eq(artifacts.sessionId, req.params.id));

      await tx.delete(mistakes).where(eq(mistakes.sessionId, req.params.id));
      await tx.delete(agentRuns).where(eq(agentRuns.sessionId, req.params.id));
      await tx.delete(usageEvents).where(eq(usageEvents.sessionId, req.params.id));

      const sessionFiles = await tx
        .select({ storagePath: files.storagePath })
        .from(files)
        .where(eq(files.sessionId, req.params.id));
      deletedFilePaths = sessionFiles.map((f) => f.storagePath);
      await tx.delete(files).where(eq(files.sessionId, req.params.id));

      await tx.delete(messages).where(eq(messages.sessionId, req.params.id));
      await tx
        .delete(sessions)
        .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)));
    });

    for (const fp of deletedFilePaths) {
      await fs.unlink(fp).catch(() => {});
    }

    /* drop the on-disk scratch dir the
       conversation was using. Best-effort: if the worker crashed
       mid-run the dir might already be gone, and the TTL sweep
       would catch that case anyway. */
    await codeInterpreter.reapSessionScratch(req.params.id, req.userId!).catch(() => {});
    await removeSessionWorkspacesForUser(req.userId!, [req.params.id]).catch((err) => {
      console.warn(
        `[sessions] workspace cleanup deferred for ${sanitizeLogValue(req.params.id, 64)}: ${sanitizeLogValue((err as Error).message, 300)}`,
      );
    });

    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ─── Bulk delete: clear every non-archived session for the caller ─── */
router.delete('/', async (req, res, next) => {
  try {
    const db = getDb();
    let allDeletedPaths: string[] = [];
    let allDeletedIds: string[] = [];

    const deleted = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, req.userId!), isNull(sessions.archivedAt)));
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) return 0;

      const bulkArtifacts = await tx
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(inArray(artifacts.sessionId, ids));
      if (bulkArtifacts.length > 0) {
        const artIds = bulkArtifacts.map((a) => a.id);
        await tx.delete(artifactVersions).where(inArray(artifactVersions.artifactId, artIds));
      }
      await tx.delete(artifacts).where(inArray(artifacts.sessionId, ids));

      await tx.delete(mistakes).where(inArray(mistakes.sessionId, ids));
      await tx.delete(agentRuns).where(inArray(agentRuns.sessionId, ids));
      await tx.delete(usageEvents).where(inArray(usageEvents.sessionId, ids));

      const bulkFiles = await tx
        .select({ storagePath: files.storagePath })
        .from(files)
        .where(inArray(files.sessionId, ids));
      allDeletedPaths = bulkFiles.map((f) => f.storagePath);
      await tx.delete(files).where(inArray(files.sessionId, ids));

      await tx.delete(messages).where(inArray(messages.sessionId, ids));
      await tx
        .delete(sessions)
        .where(and(eq(sessions.userId, req.userId!), isNull(sessions.archivedAt)));
      allDeletedIds = ids;
      return ids.length;
    });

    for (const fp of allDeletedPaths) {
      await fs.unlink(fp).catch(() => {});
    }

    /* reap every cleared session's
       scratch dir. Parallel: each fs.rm is independent. */
    await Promise.all(
      allDeletedIds.map((id) =>
        codeInterpreter.reapSessionScratch(id, req.userId!).catch(() => {}),
      ),
    );
    await removeSessionWorkspacesForUser(req.userId!, allDeletedIds).catch((err) => {
      console.warn(`[sessions] bulk workspace cleanup deferred: ${(err as Error).message}`);
    });

    return res.json({ ok: true, deleted });
  } catch (err) {
    next(err);
  }
});

/* ─── Archive ─── */
router.post('/:id/archive', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    return await durableJsonWrite(
      req,
      res,
      `session.archive.v1:${req.params.id.toLowerCase()}`,
      async (tx) => {
        const [session] = await tx
          .select()
          .from(sessions)
          .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
          .for('update')
          .limit(1);
        if (!session) throw new NotFound('Session not found');
        await tx
          .update(sessions)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(sessions.id, req.params.id));
        return { status: 200, body: { ok: true } };
      },
    );
  } catch (err) {
    next(err);
  }
});

/* ─── Unarchive ─── */
router.delete('/:id/archive', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');
    await db
      .update(sessions)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(sessions.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
