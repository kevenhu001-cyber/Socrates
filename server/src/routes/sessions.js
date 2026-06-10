import { Router } from 'express';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }
import { getDb } from '../db/index.js';
import { sessions, messages, shares } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, Forbidden, BadRequest } from '../lib/errors.js';

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
router.post('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { id, topic, title, domain, mode, phase, projectId,
            messages: msgs, kbNodes, mistakes, pinned, totalQ, currentNode } = req.body;

    /* P0.0 — accept a client-supplied id only if it looks like a real
     * UUID. The front-end used to generate short non-UUID identifiers
     * like "mq61wc16-ayb8j6" which the database rejected, returning
     * 500 INTERNAL_ERROR on every save. We silently swap in a fresh
     * UUID when the input is missing or malformed, then return the
     * canonical id in the response so the client can update its
     * in-memory state.currentSessionId. */
    const sessionId = isUuid(id) ? id : randomUUID();

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
      for (const msg of msgs) {
        if (msg.clientId) {
          // Has a stable client-side id — skip if a row with the
          // same (sessionId, clientId) already exists. This keeps
          // the back-end-generated `id` stable across resends while
          // still allowing the front-end to attach later data.
          const [existing] = await db.select({ id: messages.id })
            .from(messages)
            .where(and(
              eq(messages.sessionId, sessionId),
              eq(messages.clientId, msg.clientId),
            ))
            .limit(1);
          if (existing) continue;
        }
        await db.insert(messages).values({
          sessionId,
          role: msg.role || 'user',
          content: msg.rawText || msg.content || '',
          rawText: msg.rawText || null,
          html: msg.html || null,
          type: msg.type || null,
          sources: msg.sources || null,
          clientId: msg.clientId || null,
        });
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
    const db = getDb();
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, req.params.id), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!session) throw new NotFound('Session not found');
    await db.delete(sessions).where(eq(sessions.id, req.params.id));
    return res.status(204).end();
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
