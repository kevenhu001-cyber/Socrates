import { Router } from 'express';
import { eq, and, desc, gt, isNull, sql, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { sessions, messages, shares } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { NotFound, Forbidden, BadRequest } from '../lib/errors.js';

// P6.x — zod schema caps field lengths and validates types; throws
// ZodError → errorHandler returns 400 with the offending path.
const SessionPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  topic: z.string().max(10000).optional().default(''),
  title: z.string().max(500).optional(),
  domain: z.string().max(500).optional().nullable(),
  mode: z.enum(['tutor', 'chat']).optional().default('tutor'),
  phase: z.enum(['topic', 'diagnostic', 'chat']).optional().default('topic'),
  projectId: z.string().uuid().optional().nullable(),
  messages: z.array(z.object({
    role: z.string(),
    rawText: z.string().max(200000).optional().nullable(),
    content: z.string().max(200000).optional().nullable(),
    html: z.string().max(500000).optional().nullable(),
    type: z.string().max(50).optional().nullable(),
    sources: z.array(z.any()).max(100).optional().nullable(),
    clientId: z.string().max(100).optional().nullable(),
  })).max(1000).optional(),
  kbNodes: z.array(z.any()).max(5000).optional(),
  mistakes: z.array(z.any()).max(1000).optional(),
  pinned: z.boolean().optional(),
  totalQ: z.number().int().nonnegative().max(1000000).optional(),
  currentNode: z.number().int().nonnegative().max(1000000).optional(),
}).passthrough();

const router = Router();

router.use(requireAuth);

/* ─── List sessions ─── */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { limit, cursor, archived } = req.query;
    const maxLimit = Math.min(parseInt(limit || '50', 10), 200);
    const showArchived = archived === 'true';

    const conditions = [eq(sessions.userId, req.userId)];
    if (!showArchived) conditions.push(isNull(sessions.archivedAt));
    if (cursor) conditions.push(sql`sessions.updated_at < ${cursor}::timestamptz`);

    const rows = await db.select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.updatedAt))
      .limit(maxLimit + 1);

    const hasMore = rows.length > maxLimit;
    const sessionList = hasMore ? rows.slice(0, maxLimit) : rows;
    const nextCursor = hasMore ? sessionList[sessionList.length - 1].updatedAt.toISOString() : null;

    return res.json({ sessions: sessionList, nextCursor });
  } catch (err) { next(err); }
});

/* ─── Create / upsert session ─── */
router.post('/', writeLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    // zod throws ZodError on malformed input → errorHandler returns 400.
    const { id, topic, title, domain, mode, phase, projectId,
            messages: msgs, kbNodes, mistakes, pinned, totalQ, currentNode } = SessionPayloadSchema.parse(req.body);

    /* P0.0 — accept a client-supplied id only if it looks like a real
     * UUID. The front-end used to generate short non-UUID identifiers
     * like "mq61wc16-ayb8j6" which the database rejected, returning
     * 500 INTERNAL_ERROR on every save. We silently swap in a fresh
     * UUID when the input is missing or malformed, then return the
     * canonical id in the response so the client can update its
     * in-memory state.currentSessionId. */
    let sessionId;

    /* P10.x — defense-in-depth against resurrection of deleted
     * sessions. We will only adopt the client-supplied UUID if it
     * currently exists AND belongs to this user. Otherwise we mint a
     * fresh server-side UUID and return it (the SPA adopts it on
     * response). The previous logic accepted any UUID that didn't
     * exist — which is true both for "never existed" AND for "just
     * hard-deleted" — so a deleted conversation could silently come
     * back to life on the user's next chat turn if any code path
     * leaked the stale id into POST /api/sessions.
     *
     * P_dup-session-race — when multiple POSTs arrive in flight from
     * the same client (because the SPA calls saveCurrentSession from
     * several call sites within one chat turn), each one carries the
     * same client-side UUID. The first POST to land inserts the row
     * and returns its canonical id. Subsequent POSTs — arriving
     * before the SPA has had time to adopt that canonical id —
     * also miss the existence check (because the previous row was
     * minted under a different UUID) and each mints a fresh row.
     * The user then sees the same chat appear twice in Recents.
     *
     * Defensive fix: when the client-supplied id is a UUID that does
     * NOT exist, look up a recently-created sibling session for the
     * SAME user with the SAME topic+title (the same logical chat
     * the SPA is trying to upsert) and adopt its id instead of
     * minting yet another one. The 5-second window is wide enough
     * to absorb a racing burst but narrow enough that legitimate
     * distinct sessions for the same topic won't collide. */
    if (isUuid(id)) {
      const [owner] = await db.select({ userId: sessions.userId })
        .from(sessions)
        .where(eq(sessions.id, id))
        .limit(1);
      if (owner && owner.userId === req.userId) {
        sessionId = id;
      } else {
        // No row yet for this UUID — try to find a recent sibling.
        const safeTopic = (topic || '').trim();
        const safeTitle = (title || topic || '').trim();
        if (safeTopic || safeTitle) {
          const recent = await db.select({ id: sessions.id })
            .from(sessions)
            .where(and(
              eq(sessions.userId, req.userId),
              eq(sessions.topic, safeTopic),
              eq(sessions.title, safeTitle),
              gt(sessions.createdAt, sql`NOW() - INTERVAL '5 seconds'`),
            ))
            .orderBy(sql`${sessions.createdAt} DESC`)
            .limit(1);
          if (recent.length > 0) {
            sessionId = recent[0].id;
          } else {
            sessionId = randomUUID();
          }
        } else {
          sessionId = randomUUID();
        }
      }
    } else {
      sessionId = randomUUID();
    }

    // Upsert
    await db.insert(sessions).values({
      id: sessionId,
      userId: req.userId,
      topic: topic || '',
      title: title || topic || null,
      domain: domain || null,
      mode: mode || 'tutor',
      phase: phase || 'topic',
      projectId: projectId || null,
      pinned: !!pinned,
      kbNodes: kbNodes || [],
      mistakes: mistakes || [],
      totalQ: totalQ || 0,
      currentNode: currentNode || 0,
    }).onConflictDoUpdate({
      target: sessions.id,
      set: {
        topic: sql`EXCLUDED.topic`,
        title: sql`EXCLUDED.title`,
        domain: sql`EXCLUDED.domain`,
        mode: sql`EXCLUDED.mode`,
        phase: sql`EXCLUDED.phase`,
        projectId: sql`EXCLUDED.project_id`,
        pinned: sql`EXCLUDED.pinned`,
        kbNodes: sql`EXCLUDED.kb_nodes`,
        mistakes: sql`EXCLUDED.mistakes`,
        totalQ: sql`EXCLUDED.total_q`,
        currentNode: sql`EXCLUDED.current_node`,
        updatedAt: sql`NOW()`,
      },
    });

    // Save messages — use clientId as a soft idempotency key.
    // The front-end re-sends the full message list on every save, so
    // we need a way to avoid duplicating rows when (a) the user
    // already has the message saved, or (b) the back-end generated a
    // different UUID for the same logical message.
    if (Array.isArray(msgs) && msgs.length) {
      const clientIds = msgs.map(m => m.clientId).filter(Boolean);
      const existingClientIds = new Set();
      if (clientIds.length > 0) {
        const existing = await db.select({ clientId: messages.clientId })
          .from(messages)
          .where(and(
            eq(messages.sessionId, sessionId),
            inArray(messages.clientId, clientIds),
          ));
        for (const row of existing) existingClientIds.add(row.clientId);
      }
      const toInsert = msgs
        .filter(m => !m.clientId || !existingClientIds.has(m.clientId))
        .map(m => ({
          sessionId,
          role: m.role || 'user',
          content: m.rawText || m.content || '',
          rawText: m.rawText || null,
          html: m.html || null,
          type: m.type || null,
          sources: m.sources || null,
          clientId: m.clientId || null,
        }));
      if (toInsert.length > 0) {
        await db.insert(messages).values(toInsert);
      }
    }

    const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    return res.status(id ? 200 : 201).json(session);
  } catch (err) { next(err); }
});

/* ─── Get session detail ─── */
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
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
    const db = getDb();
    const [existing] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!existing) throw new NotFound('Session not found');

    const allowed = ['title', 'topic', 'mode', 'phase', 'domain', 'pinned', 'projectId', 'kbNodes', 'mistakes', 'totalQ', 'currentNode'];
    const patch = {};
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
router.delete('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    /* P6.x — wrap ownership check + delete in a single transaction so
     * a concurrent POST /api/sessions (the SPA's auto-save fires
     * every few seconds) can't re-INSERT a row with the deleted id
     * between our SELECT and DELETE. The DELETE also re-checks
     * userId (defense in depth — the SELECT alone is enough to
     * authorise, but the extra predicate guarantees a stolen cookie
     * can't delete via a guessed id). Messages are deleted
     * explicitly so any FK violation surfaces distinctly instead of
     * relying on the implicit cascade. */
    await db.transaction(async (tx) => {
      const [session] = await tx.select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
        .limit(1);
      if (!session) throw new NotFound('Session not found');
      await tx.delete(messages).where(eq(messages.sessionId, req.params.id));
      await tx.delete(sessions)
        .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)));
    });
    return res.status(204).end();
  } catch (err) { next(err); }
});

/* ─── Bulk delete: clear every non-archived session for the caller ─── */
/* P6.x — the SPA's Storage modal "Clear conversations" button used
 * to only wipe the localStorage cache and reload, leaving the server
 * rows in place; after a refresh /api/sessions would return them
 * again. Archived sessions are intentionally preserved so the user
 * can still recover them from the Archive / Trash UI. */
router.delete('/', async (req, res, next) => {
  try {
    const db = getDb();
    const deleted = await db.transaction(async (tx) => {
      const rows = await tx.select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.userId, req.userId), isNull(sessions.archivedAt)));
      const ids = rows.map(r => r.id);
      if (ids.length === 0) return 0;
      await tx.delete(messages).where(inArray(messages.sessionId, ids));
      await tx.delete(sessions)
        .where(and(eq(sessions.userId, req.userId), isNull(sessions.archivedAt)));
      return ids.length;
    });
    return res.json({ ok: true, deleted });
  } catch (err) { next(err); }
});

/* ─── Archive ─── */
router.post('/:id/archive', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Session not found');
    const db = getDb();
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
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
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');
    await db.update(sessions).set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(sessions.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
