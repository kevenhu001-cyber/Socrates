import { Router } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { messages, feedback, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion } from '../services/llm.js';

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
    const { content, regenerate } = req.body;
    if (!content) throw new BadRequest('content is required');

    const [msg] = await db.select().from(messages).where(eq(messages.id, req.params.id)).limit(1);
    if (!msg) throw new NotFound('Message not found');

    // Verify session ownership
    const [sess] = await db.select().from(sessions)
      .where(and(eq(sessions.id, msg.sessionId), eq(sessions.userId, req.userId)))
      .limit(1);
    if (!sess) throw new NotFound('Message not found');

    await db.update(messages).set({ content, rawText: content, editedAt: new Date() })
      .where(eq(messages.id, req.params.id));

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

    const db = getDb();
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
