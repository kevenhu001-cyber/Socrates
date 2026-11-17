/**
 * Session HTTP surface: list, create/upsert, read, archive and delete.
 *
 * The Zod payload shape and the pre-parse sanitizer live in ./payload.ts;
 * the message page reader lives below with the other read routes.
 */
import { Router } from 'express';
import { eq, and, desc, gt, isNull, sql, inArray, count } from 'drizzle-orm';
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
  sessionTags,
  tags as tagsTable,
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

const router = Router();

router.use(requireAuth, resourceScope('sessions'));

/* ─── List sessions ─── */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { limit, cursor, archived } = req.query;
    const maxLimit = Math.min(parseInt((limit as string) || '50', 10), 200);
    const showArchived = archived === 'true';

    const conditions = [eq(sessions.userId, req.userId!)];
    if (!showArchived) conditions.push(isNull(sessions.archivedAt));
    if (cursor) conditions.push(sql`sessions.updated_at < ${cursor}::timestamptz`);

    /* Audit P-H2 — the list previously did SELECT * and shipped every
     * heavy JSONB column (kbNodes, mistakes, examData, teachingPlan,
     * boundariesHistory) plus streaming snapshots for up to 200 rows.
     * No list consumer reads those — loadSession() fetches the detail
     * endpoint (GET /:id) before using them — so return only the
     * lightweight columns the Recents list / Cmd-K / chips render. */
    const rows = await db
      .select({
        id: sessions.id,
        title: sessions.title,
        topic: sessions.topic,
        mode: sessions.mode,
        phase: sessions.phase,
        kind: sessions.kind,
        domain: sessions.domain,
        projectId: sessions.projectId,
        pinned: sessions.pinned,
        archivedAt: sessions.archivedAt,
        preview: sessions.preview,
        totalQ: sessions.totalQ,
        currentNode: sessions.currentNode,
        branchedFrom: sessions.branchedFrom,
        updatedAt: sessions.updatedAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.updatedAt))
      .limit(maxLimit + 1);

    const hasMore = rows.length > maxLimit;
    const sessionList = hasMore ? rows.slice(0, maxLimit) : rows;
    const nextCursor = hasMore ? sessionList[sessionList.length - 1].updatedAt.toISOString() : null;

    /* P2.2 — batch-load tag names for every returned session so the
     * SPA's tag filter / chip row works after a reload. Without this
     * join the front-end only knows about tags that were added in the
     * current tab; any persisted tag filter that matched a tag would
     * silently match nothing on next load, leaving the Recents list
     * empty while the Inbox counter still showed the session count. */
    const tagsBySession = new Map();
    if (sessionList.length > 0) {
      const sessionIds = sessionList.map((s) => s.id);
      const tagRows = await db
        .select({
          sessionId: sessionTags.sessionId,
          name: tagsTable.name,
        })
        .from(sessionTags)
        .innerJoin(tagsTable, eq(tagsTable.id, sessionTags.tagId))
        .where(and(eq(tagsTable.userId, req.userId!), inArray(sessionTags.sessionId, sessionIds)));
      for (const r of tagRows) {
        if (!tagsBySession.has(r.sessionId)) tagsBySession.set(r.sessionId, []);
        tagsBySession.get(r.sessionId).push(r.name);
      }
    }
    const sessionListWithTags = sessionList.map((s) => ({
      ...s,
      tags: tagsBySession.get(s.id) || [],
    }));

    return res.json({ sessions: sessionListWithTags, nextCursor });
  } catch (err) {
    next(err);
  }
});

/* ─── Create / upsert session ─── */
router.post('/', writeLimiter, saveSession);

/* ─── Get session detail ─── */
const messageDetailColumns = {
  id: messages.id,
  sessionId: messages.sessionId,
  role: messages.role,
  rawText: messages.rawText,
  html: messages.html,
  type: messages.type,
  sources: messages.sources,
  parentId: messages.parentId,
  model: messages.model,
  tokenCount: messages.tokenCount,
  clientId: messages.clientId,
  reasoningContent: messages.reasoningContent,
  /* the model's retrospective, so a reloaded session
     shows the same Summary sheet the live turn produced. */
  summary: messages.summary,
  turnRuntime: messages.turnRuntime,
  attachments: messages.attachments,
  toolCalls: messages.toolCalls,
  agentRunId: messages.agentRunId,
  editedAt: messages.editedAt,
  createdAt: messages.createdAt,
};

/* R7 phase 2 — one bounded, newest-last page of a session transcript.
 * `before`/`beforeId` is an exclusive (created_at, id) upper bound; pass
 * neither for the newest page. Ties on created_at are total-ordered by id via
 * a Postgres row comparison, so consecutive pages partition the transcript
 * exactly. The cursor is the page's oldest row, null once exhausted. */
async function sessionMessagePage(
  db: ReturnType<typeof getDb>,
  sessionId: string,
  limit: number,
  before: string | null,
  beforeId: string | null,
) {
  const conditions = [eq(messages.sessionId, sessionId)];
  if (before && beforeId) {
    conditions.push(
      sql`(${messages.createdAt}, ${messages.id}) < (${before}::timestamptz, ${beforeId}::uuid)`,
    );
  }
  const rows = await db
    .select({
      ...messageDetailColumns,
      /* created_at keeps microseconds; a JS Date (and toISOString) keeps only
       milliseconds. A millisecond cursor would skip every older row that
       shares the oldest row's millisecond, so the cursor carries the exact
       stored instant as an ISO string with six fractional digits. */
      cursorAt: sql<string>`to_char(${messages.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).slice().reverse();
  const oldest = page.length > 0 ? page[0] : null;
  return {
    messages: page.map(({ cursorAt: _cursorAt, ...row }) => row),
    hasMore,
    cursor: hasMore && oldest ? { createdAt: oldest.cursorAt, id: oldest.id } : null,
  };
}

function clampPageLimit(raw: unknown): number {
  const parsed = parseInt(typeof raw === 'string' && raw ? raw : '100', 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 100, 1), 200);
}

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

    /* R7 phase 2 — `?tail=N` (1..200) returns only the newest N messages
     * plus `messagesPage: { hasMore, cursor, total }`, so opening a long
     * conversation pays for one screen of history instead of the whole
     * transcript. The client walks older pages through GET /:id/messages
     * with the returned cursor. Without `tail` the response is unchanged
     * (full transcript, no messagesPage) for share/export/mobile callers. */
    if (typeof req.query.tail === 'string' && req.query.tail) {
      const limit = clampPageLimit(req.query.tail);
      const [page, [total]] = await Promise.all([
        sessionMessagePage(db, session.id, limit, null, null),
        db.select({ value: count() }).from(messages).where(eq(messages.sessionId, session.id)),
      ]);
      return res.json({
        ...session,
        messages: page.messages,
        messagesPage: {
          hasMore: page.hasMore,
          cursor: page.cursor,
          total: Number(total?.value ?? page.messages.length),
        },
      });
    }

    /* P-H1 (2026-09-27 session-switch profile) — explicit column select that
     * drops `content`. On the write path (POST, sessions.ts:575-577) `content`
     * is stored as `sanitizeStoredHtml(m.html || contentRaw)` — i.e. a second
     * serialization of essentially the same bytes as `html`. The transcript
     * renderer (frontend session/loader.js) consumes `html` for paint and
     * `rawText` for canonical rebuild + LLM history, and never reads `content`;
     * carrying it doubled the detail payload for HTML-heavy sessions (~17% of
     * the response). Every other column is kept as-is so share/export/mobile
     * consumers are unaffected. Session-level heavy columns (kbNodes,
     * mistakes, teachingPlan, boundariesHistory) ARE consumed by the loader and
     * stay. */
    const msgs = await db
      .select(messageDetailColumns)
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt);

    return res.json({ ...session, messages: msgs });
  } catch (err) {
    next(err);
  }
});

/* ─── Session message page (cursor pagination) ───
 * R7 (audit R9; docs/plans/2026-11-04-sidebar-ui-consistency.md §6) —
 * GET /:id ships the whole transcript, so a 1000-row session pays the full
 * payload on every open even though the reader starts at the bottom and the
 * LLM context is rebuilt server-side from the table. This endpoint returns
 * one bounded page, newest-last:
 *
 *   ?limit=N                     page size, clamped to 1..200, default 100
 *   ?before=<ISO>&beforeId=<uuid> exclusive upper bound: everything strictly
 *                                older than the (created_at, id) pair. Omit
 *                                both for the newest page.
 *
 * Ties on created_at are total-ordered by id, matching the (created_at, id)
 * order the client uses to stitch pages. Response:
 *   { messages: [...ascending, same projection as GET /:id...],
 *     hasMore, cursor: { createdAt, id } | null }
 * `cursor` is the oldest row of the returned page and null once the
 * transcript is exhausted, so a client walks pages by feeding it back as
 * before/beforeId. */
router.get('/:id/messages', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');

    const limit = clampPageLimit(req.query.limit);
    const before =
      typeof req.query.before === 'string' && req.query.before ? req.query.before : null;
    const beforeId =
      typeof req.query.beforeId === 'string' && req.query.beforeId ? req.query.beforeId : null;
    if (Boolean(before) !== Boolean(beforeId))
      throw new BadRequest('before and beforeId must be given together');
    if (before && Number.isNaN(Date.parse(before)))
      throw new BadRequest('Invalid before timestamp');
    if (beforeId && !isUuid(beforeId)) throw new BadRequest('Invalid beforeId');

    return res.json(await sessionMessagePage(db, session.id, limit, before, beforeId));
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
