import { Router } from 'express';
import { eq, and, desc, gt, isNull, sql, inArray, count } from 'drizzle-orm';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { codeInterpreter } from '../services/codeInterpreter.js';
import { getDb } from '../db/index.js';
import {
  sessions, messages, mistakes, artifacts, artifactVersions,
  agentRuns, usageEvents, files,
  shares, sessionTags, tags as tagsTable,
} from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { NotFound, Forbidden, BadRequest } from '../lib/errors.js';
import { sanitizeStoredHtml, sanitizePlainText } from '../lib/sanitize.js';
import { getSessionLimit } from '../lib/tiers.js';
import { isUuid } from '../lib/validate.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/socrates-uploads';

// P6.x — zod schema caps field lengths and validates types; throws
// ZodError → errorHandler returns 400 with the offending path.
const SessionPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  topic: z.string().max(10000).optional().default(''),
  title: z.string().max(500).optional(),
  domain: z.string().max(500).optional().nullable(),
  mode: z.enum(['tutor', 'chat']).optional().default('chat'),
  phase: z.enum(['topic', 'diagnostic', 'chat']).optional().default('topic'),
  /* P_exam-history — top-level session "shape". 'exam' is set by the
   * front-end when saving a finished exam; the chat service still uses
   * 'tutor' / 'chat'. Default 'chat' keeps every existing client call
   * site working unchanged. */
  kind: z.enum(['chat', 'tutor', 'exam']).optional().default('chat'),
  /* P_exam-history — full rendered exam payload: {topic, difficulty,
   * count, lang, types, questions:[...], answers:{...}, submitted, results?}.
   * Lives on the same row as the session, so a single
   * POST /api/sessions carries the exam to the server and a single
   * GET /api/sessions/:id returns it for re-rendering. */
  examData: z.any().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  messages: z.array(z.object({
    role: z.string(),
    rawText: z.string().max(200000).optional().nullable(),
    content: z.string().max(200000).optional().nullable(),
    html: z.string().max(500000).optional().nullable(),
    type: z.string().max(50).optional().nullable(),
    sources: z.array(z.any()).max(100).optional().nullable(),
    clientId: z.string().max(100).optional().nullable(),
    /* P_reasoning-persist — chain-of-thought text from reasoning
       models. Preserved so it survives session save/load. */
    reasoningContent: z.string().max(500000).optional().nullable(),
    /* P_attachments — array of {id, kind, name, mime, dataUrl?, text?,
       size, truncated?} representing user-supplied files for this
       message. Persisted so a session reload restores thumbnails
       and parsed text. dataUrl is capped at 2 MB per attachment. */
    attachments: z.array(z.object({
      id: z.string().max(100),
      kind: z.string().max(50),
      docKind: z.string().max(20).optional(),
      name: z.string().max(500),
      mime: z.string().max(200),
      dataUrl: z.string().max(2_000_000).optional(),
      text: z.string().max(500_000).optional(),
      truncated: z.boolean().optional(),
      size: z.number().int().nonnegative().max(50 * 1024 * 1024),
    })).max(20).optional(),
    /* P_tool-history — tool calls the assistant made on this turn
     * (web_search, code_interpreter, etc). Each entry is rendered as
     * a collapsible card under the message on reload so the user can
     * see what tools ran. Capped to 20 calls per message and each
     * output field is bounded so a runaway tool can't bloat the
     * session row. */
    toolCalls: z.array(z.object({
      id: z.string().max(200),
      name: z.string().max(100),
      input: z.any().optional().nullable(),
      output: z.string().max(500_000).optional().nullable(),
      isError: z.boolean().optional().nullable(),
      artifacts: z.array(z.object({
        id: z.string().max(100),
        mimeType: z.string().max(200).optional().nullable(),
        name: z.string().max(500).optional().nullable(),
      })).max(20).optional(),
      results: z.array(z.object({
        title: z.string().max(1000).optional(),
        url: z.string().max(3000).optional(),
        snippet: z.string().max(5000).optional(),
        date: z.string().max(200).optional().nullable(),
        source: z.string().max(100).optional().nullable(),
        matchedQuery: z.string().max(1000).optional().nullable(),
      }).passthrough()).max(20).optional(),
      /* P_inline-restore — character offset in the assistant's rawText
       * where this tool call split the reply, plus the native
       * visualization spec the run produced. Both are needed to
       * rebuild the inline text→row→chart layout on reload/share. */
      textOffset: z.number().int().nonnegative().max(10_000_000).optional().nullable(),
      visualization: z.any().optional().nullable(),
    })).max(20).optional(),
  })).max(1000).optional(),
  kbNodes: z.array(z.any()).max(5000).optional(),
  mistakes: z.array(z.any()).max(1000).optional(),
  pinned: z.boolean().optional(),
  totalQ: z.number().int().nonnegative().max(1000000).optional(),
  currentNode: z.number().int().nonnegative().max(1000000).optional(),
  /* AUDIT-R1 — tutor teaching-state machine (Task 2.4). Previously
     these rode in on .passthrough() with zero validation AND were
     never persisted (the route ignored them entirely), so teaching
     progress silently reset on every reload. `.catch(...)` coerces a
     malformed value back to a safe default instead of failing the
     whole save with a 400 — a corrupted stage field shouldn't cost
     the user their conversation. */
  teachingStage: z.enum(['motivate', 'define', 'develop', 'illustrate', 'exercise', 'check'])
    .optional().catch(undefined),
  currentExampleIdx: z.number().int().nonnegative().max(100000).optional().catch(undefined),
  practiceAttempts: z.number().int().nonnegative().max(1000000).optional().catch(undefined),
  practicePhase: z.string().max(50).optional().catch(undefined),
  teachingPlan: z.any().optional().nullable(),
  boundariesHistory: z.array(z.any()).max(100).optional().catch(undefined),
  mistakeFilter: z.string().max(50).optional().catch(undefined),
  branchedFrom: z.object({}).passthrough().optional().nullable().catch(null),
}).passthrough();

const router = Router();

router.use(requireAuth);

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
    const rows = await db.select({
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
      const sessionIds = sessionList.map(s => s.id);
      const tagRows = await db.select({
        sessionId: sessionTags.sessionId,
        name: tagsTable.name,
      })
        .from(sessionTags)
        .innerJoin(tagsTable, eq(tagsTable.id, sessionTags.tagId))
        .where(and(
          eq(tagsTable.userId, req.userId!),
          inArray(sessionTags.sessionId, sessionIds),
        ));
      for (const r of tagRows) {
        if (!tagsBySession.has(r.sessionId)) tagsBySession.set(r.sessionId, []);
        tagsBySession.get(r.sessionId).push(r.name);
      }
    }
    const sessionListWithTags = sessionList.map(s => ({
      ...s,
      tags: tagsBySession.get(s.id) || [],
    }));

    return res.json({ sessions: sessionListWithTags, nextCursor });
  } catch (err) { next(err); }
});

/* ─── Create / upsert session ─── */
router.post('/', writeLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    // zod throws ZodError on malformed input → errorHandler returns 400.
    const { id, topic, title, domain, mode, phase, kind, examData,
            projectId,
            messages: msgs, kbNodes, mistakes, pinned, totalQ, currentNode,
            teachingStage, currentExampleIdx, practiceAttempts, practicePhase,
            teachingPlan, boundariesHistory, mistakeFilter, branchedFrom } = SessionPayloadSchema.parse(req.body);

    /* ─── Atomic transaction ───
     * Wraps the existence check + upsert in a transaction to prevent a
     * race with the DELETE handler. Without this, a DELETE transaction
     * that fires between the POST's SELECT (line ~181) and its INSERT
     * (line ~235) causes the POST to see a missing row, generate a
     * fresh UUID, and INSERT a new session — resurrecting a deleted
     * conversation with the same content under a new ID.
     *
     * Within the transaction we use FOR UPDATE on the existence check
     * so the DELETE's locking delete transaction (which awaits the
     * same row lock) serialises after our check. */
    const sessionId = await db.transaction(async (tx) => {
      let sid;

      if (isUuid(id)) {
        const [owner] = await tx.select({ userId: sessions.userId })
          .from(sessions)
          .where(eq(sessions.id, id))
          .for('update')
          .limit(1);
        if (owner && owner.userId === req.userId) {
          sid = id;
        } else {
          // No row yet for this UUID — try to find a recent sibling.
          const safeTopic = (topic || '').trim();
          const safeTitle = (title || topic || '').trim();
          if (safeTopic || safeTitle) {
            const recent = await tx.select({ id: sessions.id })
              .from(sessions)
              .where(and(
                eq(sessions.userId, req.userId!),
                eq(sessions.topic, safeTopic),
                eq(sessions.title, safeTitle),
                gt(sessions.createdAt, sql`NOW() - INTERVAL '5 seconds'`),
              ))
              .orderBy(sql`${sessions.createdAt} DESC`)
              .limit(1);
            if (recent.length > 0) {
              sid = recent[0].id;
            } else {
              sid = id;
            }
          } else {
            sid = id;
          }
        }
      } else {
        sid = randomUUID();
      }

      /* Tier-based session limit — only enforce when creating a NEW
       * session. Updates to existing sessions are always allowed. */
      const [existingSession] = await tx.select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, sid))
        .limit(1);
      if (!existingSession) {
        const tier = req.user?.tier || 'diophantus';
        const maxSessions = getSessionLimit(tier);
        if (maxSessions > 0) {
          const [sessCount] = await tx.select({ value: count() })
            .from(sessions)
            .where(eq(sessions.userId, req.userId!));
          if ((sessCount?.value || 0) >= maxSessions) {
            throw new Forbidden('FORBIDDEN', `Session limit reached for ${tier} plan (${maxSessions} sessions). Upgrade your plan to create more.`);
          }
        }
      }

      // Upsert session
      await tx.insert(sessions).values({
        id: sid,
        userId: req.userId!,
        topic: topic || '',
        title: title || topic || null,
        domain: domain || null,
        mode: mode || 'chat',
        phase: phase || 'topic',
        kind: kind || 'chat',
        examData: examData || null,
        projectId: projectId || null,
        pinned: !!pinned,
        kbNodes: kbNodes || [],
        mistakes: mistakes || [],
        totalQ: totalQ || 0,
        currentNode: currentNode || 0,
        /* AUDIT-R1 — persist the teaching-state machine so a reloaded
         * tutor session resumes at the right stage instead of
         * restarting at motivate/0. */
        teachingStage: teachingStage || null,
        currentExampleIdx: currentExampleIdx ?? null,
        practiceAttempts: practiceAttempts ?? null,
        practicePhase: practicePhase || null,
        teachingPlan: teachingPlan || null,
        boundariesHistory: boundariesHistory || null,
        mistakeFilter: mistakeFilter || null,
        branchedFrom: branchedFrom || null,
      }).onConflictDoUpdate({
        target: sessions.id,
        set: {
          topic: sql`EXCLUDED.topic`,
          title: sql`EXCLUDED.title`,
          domain: sql`EXCLUDED.domain`,
          mode: sql`EXCLUDED.mode`,
          phase: sql`EXCLUDED.phase`,
          kind: sql`EXCLUDED.kind`,
          examData: sql`EXCLUDED.exam_data`,
          projectId: sql`EXCLUDED.project_id`,
          pinned: sql`EXCLUDED.pinned`,
          kbNodes: sql`EXCLUDED.kb_nodes`,
          mistakes: sql`EXCLUDED.mistakes`,
          totalQ: sql`EXCLUDED.total_q`,
          currentNode: sql`EXCLUDED.current_node`,
          teachingStage: sql`EXCLUDED.teaching_stage`,
          currentExampleIdx: sql`EXCLUDED.current_example_idx`,
          practiceAttempts: sql`EXCLUDED.practice_attempts`,
          practicePhase: sql`EXCLUDED.practice_phase`,
          teachingPlan: sql`EXCLUDED.teaching_plan`,
          boundariesHistory: sql`EXCLUDED.boundaries_history`,
          mistakeFilter: sql`EXCLUDED.mistake_filter`,
          branchedFrom: sql`EXCLUDED.branched_from`,
          updatedAt: sql`NOW()`,
        },
      });

      // P_message-dedup — atomic upsert using the (sessionId, clientId)
      // unique constraint.
      if (Array.isArray(msgs) && msgs.length) {
        const _insertBase = Date.now();
        const rows = msgs.map((m, i) => {
          const contentRaw = m.rawText || m.content || '';
          return {
            role: m.role || 'user',
            content: sanitizeStoredHtml(m.html || contentRaw),
            rawText: sanitizePlainText(contentRaw),
            html: m.html ? sanitizeStoredHtml(m.html) : null,
            type: m.type || null,
            sources: m.sources || null,
            clientId: m.clientId || null,
            reasoningContent: m.reasoningContent || null,
            attachments: Array.isArray(m.attachments) ? m.attachments.slice(0, 20) : [],
            /* P_tool-history — persist the tool-calls log so reload
             * re-renders the cards. Normalise to plain values so the
             * jsonb payload is deterministic across clients. */
            toolCalls: Array.isArray(m.toolCalls)
              ? m.toolCalls.slice(0, 20).map(function(tc) {
                  return {
                    id: String(tc.id || ''),
                    name: String(tc.name || ''),
                    input: tc.input == null ? null : tc.input,
                    output: tc.output == null ? null : String(tc.output),
                    isError: tc.isError === true,
                    artifacts: Array.isArray(tc.artifacts)
                      ? tc.artifacts.slice(0, 20).map(function(a) {
                          return { id: String(a.id || ''), mimeType: a.mimeType || null, name: a.name || null };
                        })
                      : [],
                    /* P_inline-restore — round-trip the pieces the client
                     * needs to rebuild the inline tool layout: search
                     * results (row source lists), the rawText split
                     * offset, and the native visualization spec. */
                    results: Array.isArray(tc.results) ? tc.results.slice(0, 20) : [],
                    textOffset: typeof tc.textOffset === 'number' ? tc.textOffset : null,
                    visualization: tc.visualization == null ? null : tc.visualization,
                  };
                })
              : [],
            sessionId: sid,
            createdAt: new Date(_insertBase + i),
          };
        });
        await tx.insert(messages).values(rows).onConflictDoUpdate({
          target: [messages.sessionId, messages.clientId],
          set: {
            role: sql`EXCLUDED.role`,
            content: sql`EXCLUDED.content`,
            rawText: sql`EXCLUDED.raw_text`,
            html: sql`EXCLUDED.html`,
            type: sql`EXCLUDED.type`,
            sources: sql`EXCLUDED.sources`,
            reasoningContent: sql`EXCLUDED.reasoning_content`,
            attachments: sql`EXCLUDED.attachments`,
            toolCalls: sql`EXCLUDED.tool_calls`,
            createdAt: sql`EXCLUDED.created_at`,
          },
        });
      }

      const [session] = await tx.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      return { session, wasNew: !existingSession };
    });

    return res.status(id ? 200 : 201).json(sessionId.session);
  } catch (err) { next(err); }
});

/* ─── Get session detail ─── */
router.get('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');

    const msgs = await db.select().from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt);

    return res.json({ ...session, messages: msgs });
  } catch (err) { next(err); }
});

/* ─── Update session (partial) ─── */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [existing] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Session not found');

    const allowed = ['title', 'topic', 'mode', 'phase', 'kind', 'examData', 'domain', 'pinned', 'projectId', 'kbNodes', 'mistakes', 'totalQ', 'currentNode', 'streamingText', 'streamingReasoning', 'teachingStage', 'currentExampleIdx', 'practiceAttempts', 'practicePhase', 'teachingPlan', 'boundariesHistory', 'mistakeFilter', 'branchedFrom'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    patch.updatedAt = new Date();

    await db.update(sessions).set(patch).where(eq(sessions.id, req.params.id));
    const [updated] = await db.select().from(sessions).where(eq(sessions.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* ─── Delete / purge session ─── */
/* P_data-removal — when a session is deleted, wipe every row that
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
      /* P_serialize-delete — acquire FOR UPDATE lock on the session
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
      const [session] = await tx.select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
        .for('update')
        .limit(1);
      if (!session) throw new NotFound('Session not found');

      const sessionArtifacts = await tx.select({ id: artifacts.id })
        .from(artifacts)
        .where(eq(artifacts.sessionId, req.params.id));
      if (sessionArtifacts.length > 0) {
        const artIds = sessionArtifacts.map(a => a.id);
        await tx.delete(artifactVersions)
          .where(inArray(artifactVersions.artifactId, artIds));
      }
      await tx.delete(artifacts).where(eq(artifacts.sessionId, req.params.id));

      await tx.delete(mistakes).where(eq(mistakes.sessionId, req.params.id));
      await tx.delete(agentRuns).where(eq(agentRuns.sessionId, req.params.id));
      await tx.delete(usageEvents).where(eq(usageEvents.sessionId, req.params.id));

      const sessionFiles = await tx.select({ storagePath: files.storagePath })
        .from(files)
        .where(eq(files.sessionId, req.params.id));
      deletedFilePaths = sessionFiles.map(f => f.storagePath);
      await tx.delete(files).where(eq(files.sessionId, req.params.id));

      await tx.delete(messages).where(eq(messages.sessionId, req.params.id));
      await tx.delete(sessions)
        .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)));
    });

    for (const fp of deletedFilePaths) {
      await fs.unlink(fp).catch(() => {});
    }

    /* P_session-scoped-scratch — drop the on-disk scratch dir the
       conversation was using. Best-effort: if the worker crashed
       mid-run the dir might already be gone, and the TTL sweep
       would catch that case anyway. */
    await codeInterpreter._reapSessionScratch(req.params.id).catch(() => {});

    return res.status(204).end();
  } catch (err) { next(err); }
});

/* ─── Bulk delete: clear every non-archived session for the caller ─── */
router.delete('/', async (req, res, next) => {
  try {
    const db = getDb();
    let allDeletedPaths: string[] = [];
    let allDeletedIds: string[] = [];

    const deleted = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, req.userId!), isNull(sessions.archivedAt)));
      const ids = rows.map(r => r.id);
      if (ids.length === 0) return 0;

      const bulkArtifacts = await tx.select({ id: artifacts.id })
        .from(artifacts)
        .where(inArray(artifacts.sessionId, ids));
      if (bulkArtifacts.length > 0) {
        const artIds = bulkArtifacts.map(a => a.id);
        await tx.delete(artifactVersions)
          .where(inArray(artifactVersions.artifactId, artIds));
      }
      await tx.delete(artifacts).where(inArray(artifacts.sessionId, ids));

      await tx.delete(mistakes).where(inArray(mistakes.sessionId, ids));
      await tx.delete(agentRuns).where(inArray(agentRuns.sessionId, ids));
      await tx.delete(usageEvents).where(inArray(usageEvents.sessionId, ids));

      const bulkFiles = await tx.select({ storagePath: files.storagePath })
        .from(files)
        .where(inArray(files.sessionId, ids));
      allDeletedPaths = bulkFiles.map(f => f.storagePath);
      await tx.delete(files).where(inArray(files.sessionId, ids));

      await tx.delete(messages).where(inArray(messages.sessionId, ids));
      await tx.delete(sessions)
        .where(and(eq(sessions.userId, req.userId!), isNull(sessions.archivedAt)));
      allDeletedIds = ids;
      return ids.length;
    });

    for (const fp of allDeletedPaths) {
      await fs.unlink(fp).catch(() => {});
    }

    /* P_session-scoped-scratch — reap every cleared session's
       scratch dir. Parallel: each fs.rm is independent. */
    await Promise.all(
      allDeletedIds.map(id => codeInterpreter._reapSessionScratch(id).catch(() => {}))
    );

    return res.json({ ok: true, deleted });
  } catch (err) { next(err); }
});

/* ─── Archive ─── */
router.post('/:id/archive', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');
    await db.update(sessions).set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(sessions.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Unarchive ─── */
router.delete('/:id/archive', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId!)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');
    await db.update(sessions).set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(sessions.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
