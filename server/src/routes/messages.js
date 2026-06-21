import { Router } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { messages, feedback, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion } from '../services/llm.js';

/* UUID format guard — the messages.id column is a Postgres uuid type
 * which rejects any non-UUID string with `invalid input syntax for
 * type uuid`. The SPA generates client-side IDs like
 * "msg-b749937d-7ff1-4999-8752-cf043f5c3c3a" that are NOT UUIDs, so
 * when the user tries to edit / delete a message the query blew up
 * with a 500. Reject early with a clean 400 instead. The same
 * helper is used by /api/sessions routes; copy the regex rather
 * than introduce a circular import. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s) { return typeof s === 'string' && UUID_RE.test(s); }

const router = Router();
router.use(requireAuth);

/* PATCH /api/messages/:id — edit user message (optionally regenerate)
 *
 * When `regenerate=true` the route streams a fresh assistant reply in SSE
 * format. Otherwise it just persists the edit and returns { ok: true }.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const { content, regenerate, discardFollowing } = req.body;
    if (!content) throw new BadRequest('content is required');

    /* P10.x — reject client-generated non-UUID ids with a 400 instead
       of letting Postgres throw `invalid input syntax for type uuid`
       (which becomes a 500). The SPA occasionally passes ids like
       `msg-<random>` from the front-end state. */
    if (!isUuid(req.params.id)) throw new BadRequest('Invalid message id');

    const [msg] = await db.select().from(messages).where(eq(messages.id, req.params.id)).limit(1);
    if (!msg) throw new NotFound('Message not found');

    // Verify session ownership
    const [sess] = await db.select().from(sessions)
      .where(and(eq(sessions.id, msg.sessionId), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!sess) throw new NotFound('Message not found');

    await db.update(messages).set({ content, rawText: content, editedAt: new Date() })
      .where(eq(messages.id, req.params.id));

    /* P_edit — when the client passes `discardFollowing`, drop every
     * assistant message that was authored AFTER the edited user turn
     * so the next reload does not surface a stale reply. The client
     * regenerates the new reply in-place; without this cleanup the
     * server would keep the old reply around forever. */
    if (discardFollowing) {
      const later = await db.select().from(messages)
        .where(and(
          eq(messages.sessionId, msg.sessionId),
          eq(messages.role, 'assistant'),
        ))
        .orderBy(asc(messages.createdAt));
      for (const r of later) {
        if (r.createdAt >= msg.createdAt) {
          await db.delete(messages).where(eq(messages.id, r.id));
        }
      }
    }

    if (!regenerate) {
      return res.json({ ok: true });
    }

    /* ─── Regenerate: delete the old assistant reply, then stream a new one ─── */
    const olderReplies = await db.select().from(messages)
      .where(and(
        eq(messages.sessionId, msg.sessionId),
        eq(messages.role, 'assistant'),
      ))
      .orderBy(asc(messages.createdAt));
    for (const r of olderReplies) {
      if (r.createdAt >= msg.createdAt) {
        await db.delete(messages).where(eq(messages.id, r.id));
      }
    }

    // Build the conversation context (up to the edited message)
    const history = await db.select().from(messages)
      .where(eq(messages.sessionId, msg.sessionId))
      .orderBy(asc(messages.createdAt));

    const llmMessages = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content || '' }));

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const hb = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { clearInterval(hb); } }, 10000);
    const ac = new AbortController();
    req.on('close', () => { clearInterval(hb); ac.abort(); });

    let fullText = '';
    await streamChatCompletion(
      {
        apiBase: provider.url,
        apiKey: provider.keyPlaintext,
        model: provider.model,
        messages: llmMessages,
        maxTokens: 4096,
        signal: ac.signal,
      },
      (chunk) => {
        fullText += chunk;
        try { res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`); } catch { /* client gone */ }
      },
      async () => {
        clearInterval(hb);
        try {
          const [inserted] = await db.insert(messages).values({
            sessionId: msg.sessionId,
            role: 'assistant',
            content: fullText,
            rawText: fullText,
          }).returning();
          try {
            res.write(`data: ${JSON.stringify({ done: true, messageId: inserted.id })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch { /* client gone */ }
        } catch (err) {
          try { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); } catch { /* ignore */ }
        }
      },
      (err) => {
        clearInterval(hb);
        try { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); } catch { /* ignore */ }
      },
    );
  } catch (err) { next(err); }
});

/* DELETE /api/messages/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    /* P10.x — see PATCH handler above for the rationale. */
    if (!isUuid(req.params.id)) throw new BadRequest('Invalid message id');
    const [msg] = await db.select().from(messages).where(eq(messages.id, req.params.id)).limit(1);
    if (!msg) throw new NotFound('Message not found');

    const [sess] = await db.select().from(sessions)
      .where(and(eq(sessions.id, msg.sessionId), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!sess) throw new NotFound('Message not found');

    await db.delete(messages).where(eq(messages.id, req.params.id));
    return res.status(204).end();
  } catch (err) { next(err); }
});

/* PUT /api/messages/:id/feedback */
router.put('/:id/feedback', async (req, res, next) => {
  try {
    const { rating, reason, categories } = req.body;
    if (!['up', 'down', 'none'].includes(rating)) throw new BadRequest('rating must be up/down/none');
    /* P10.x — see PATCH handler above for the rationale. */
    if (!isUuid(req.params.id)) throw new BadRequest('Invalid message id');

    const db = getDb();
    // Verify the message exists AND belongs to one of the caller's
    // sessions. Without this, any logged-in user could rate-up/down
    // any message in the database.
    const [msg] = await db.select({ id: messages.id, sessionId: messages.sessionId })
      .from(messages)
      .where(eq(messages.id, req.params.id))
      .limit(1);
    if (!msg) throw new NotFound('Message not found');
    const [sess] = await db.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.id, msg.sessionId), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!sess) throw new NotFound('Message not found');

    await db.insert(feedback).values({
      messageId: req.params.id,
      rating,
      reason: reason || null,
      categories: categories || null,
    }).onConflictDoUpdate({
      target: feedback.messageId,
      set: { rating, reason: reason || null, categories: categories || null },
    });

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
