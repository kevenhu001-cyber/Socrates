import { Router } from 'express';
import { eq, and, asc, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { messages, feedback, sessions, usageEvents } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter, writeLimiter } from '../middleware/rateLimit.js';
import { NotFound, BadRequest, TooManyRequests } from '../lib/errors.js';
import { getBeagleQuota } from '../lib/tiers.js';
import { isUuid } from '../lib/validate.js';
import { sanitizeStoredHtml, sanitizePlainText } from '../lib/sanitize.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion } from '../services/llm.js';

/* P_attachments-shape — mirrors the per-message `attachments` shape
 * defined in routes/sessions.js (SessionPayloadSchema → messages[].attachments).
 * The POST/PUT session-save path was already Zod-validated upstream,
 * but the PATCH /api/messages/:id path previously trusted the client
 * blindly: any object array passed `if (Array.isArray(attachments))`
 * and was `slice(0, 20)`'d before being written to the messages.attachments
 * JSONB column. That meant a forged PATCH could persist Date objects,
 * circular refs, or arbitrary-sized strings, bloating the row and
 * breaking downstream renderers. Re-using the exact same schema here
 * keeps the two write paths in lockstep. */
const attachmentSchema = z.object({
  id: z.string().max(100),
  kind: z.enum(['image', 'text', 'pdf']),
  name: z.string().max(500),
  mime: z.string().max(200),
  dataUrl: z.string().max(2_000_000).optional(),
  text: z.string().max(500_000).optional(),
  truncated: z.boolean().optional(),
  size: z.number().int().nonnegative().max(50 * 1024 * 1024),
});
const attachmentsSchema = z.array(attachmentSchema).max(20);

async function checkBeagleLimit(userId, tier) {
  if (!userId) return null;
  const quota = getBeagleQuota(tier);
  const db = getDb();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [row] = await db.select({
    used: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
  }).from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, monthStart)));
  if ((row?.used || 0) >= quota) {
    return new TooManyRequests(`Monthly Beagle limit (${quota.toLocaleString()}) reached. Add your own API key.`);
  }
  return null;
}

/* UUID format guard — the messages.id column is a Postgres uuid type
 * which rejects any non-UUID string with `invalid input syntax for
 * type uuid`. The SPA generates client-side IDs like
 * "msg-b749937d-7ff1-4999-8752-cf043f5c3c3a" that are NOT UUIDs, so
 * when the user tries to edit / delete a message the query blew up
 * with a 500. Reject early with a clean 400 instead. Shared
 * helper from lib/validate.js. */

const router = Router();
router.use(requireAuth);

/* PATCH /api/messages/:id — edit user message (optionally regenerate)
 *
 * When `regenerate=true` the route streams a fresh assistant reply in SSE
 * format. Otherwise it just persists the edit and returns { ok: true }.
 *
 * Rate limits:
 *   - writeLimiter is applied to the whole route (covers cheap edits).
 *   - chatLimiter is applied when regenerate=true: regenerating hits
 *     the LLM and costs tokens, so it shares the same 60/hr/user
 *     budget as new chat messages. Without this, an attacker with
 *     a valid sid could cycle "regenerate" on a long conversation
 *     and burn through the operator's LLM budget.
 */
const regenerateLimiter = (req, res, next) => {
  if (req.body?.regenerate === true) return chatLimiter(req, res, next);
  return next();
};
router.patch('/:id', writeLimiter, regenerateLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const { content, regenerate, discardFollowing, attachments } = req.body;
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

    /* SECURITY: sanitise both the rendered content (HTML) and the
     * rawText (plain markdown source). The browser normally runs
     * DOMPurify before send, but defence-in-depth: a misconfigured
     * client / extension / replay tool shouldn't be able to inject
     * raw <script> / onload= handlers into a stored message that
     * another browser will then render. */
    const safeContent = sanitizeStoredHtml(content);
    const safeRaw = sanitizePlainText(content);
    /* P_attachments — when the client explicitly sends `attachments`,
     * overwrite the stored array; otherwise keep the existing one so
     * a plain text-edit doesn't drop the thumbnails. We cap to 20 and
     * require the same shape SessionPayloadSchema enforces. The empty-
     * array branch (`attachments = []`) is still an explicit "clear
     * all attachments" — safeParse accepts an empty array and writes
     * it through, so that path remains correct. */
    const updateSet = {
      content: safeContent,
      rawText: safeRaw,
      editedAt: new Date(),
    };
    if (Array.isArray(attachments)) {
      const parsed = attachmentsSchema.safeParse(attachments);
      if (!parsed.success) {
        throw new BadRequest('Invalid attachments: ' + (parsed.error.issues[0]?.message || 'validation failed'));
      }
      updateSet.attachments = parsed.data;
    }
    await db.update(messages).set(updateSet).where(eq(messages.id, req.params.id));

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
    if (provider.isBuiltIn) {
      const limitErr = await checkBeagleLimit(req.userId, req.user?.tier);
      if (limitErr) return res.status(429).json({ code: 'MONTHLY_LIMIT', message: limitErr.message });
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
        /* undefined → llm.js default (32 K) so a long regenerated
           reply isn't silently truncated by a small per-model cap. */
        maxTokens: undefined,
        signal: ac.signal,
      },
      (chunk) => {
        fullText += chunk;
        try { res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`); } catch { /* client gone */ }
      },
      async () => {
        clearInterval(hb);
        try {
          // Sanitise on write too — the LLM response can (rarely)
          // contain raw HTML or odd control chars that would
          // confuse downstream markdown rendering.
          const safeContent = sanitizeStoredHtml(fullText);
          const safeRaw = sanitizePlainText(fullText);
          const [inserted] = await db.insert(messages).values({
            sessionId: msg.sessionId,
            role: 'assistant',
            content: safeContent,
            rawText: safeRaw,
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
