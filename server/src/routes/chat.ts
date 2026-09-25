// @ts-check
/**
 * POST /api/chat — non-streaming chat completion.
 *
 * Slimmed down in July 2026. The original 1158-line file held two
 * endpoints (POST / sync, POST /stream SSE) plus nine helpers and
 * three Zod schemas. After the split:
 *   - helpers (schemas, prep, transforms) → ./chat/helpers.js
 *   - SSE /stream handler → ./chat/stream.js
 *   - this file owns only the sync handler + the router export.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resourceScope } from '../middleware/scopes.js';
import { audit } from '../middleware/audit.js';
import { callChatCompletion } from '../services/llm.js';
import { estimateMessageTokens, estimateTokens, recordUsage, resolveUsage } from '../services/usageTracker.js';

import {
  prepareChatRequest,
  chatRateLimitDispatch,
} from './chat/helpers.js';
import { registerStreamRoute } from './chat/stream.js';

const router = Router();

/* ─── Non-streaming chat (title gen, query rewrite, short tasks) ─── */
/* Audit S-H3 (P0) — switch from optionalAuth to requireAuth. The
   previous configuration let anonymous users hit the built-in
   LLM provider, opening the door to unbounded cost abuse. The
   chatLimiter (now 240/h tier-aware, with a separate 600/h tutor
   pool) is the soft control; requireAuth is the hard gate. A
   distributed attacker can no longer bypass via IP rotation because
   every chat caller must hold a valid session cookie. The front-end
   flips the "Guest mode" checkbox at sign-in as a UI hint, but the
   underlying session is still a full authenticated account (just
   marked isGuest in DB). */
router.post('/', requireAuth, resourceScope('chat'), chatRateLimitDispatch, audit('chat:sync'), async (req, res, next) => {
  try {
    /* P_long-llm-override — this non-streaming call waits for the upstream
     * model for as long as it needs to think. `timeoutMs = 0` opts out of
     * the global request deadline entirely (see timeoutMiddleware); the
     * client applies no deadline of its own either. */
    res.locals.timeoutMs = 0;
    const prep = await prepareChatRequest(req, res);
    if (!prep.ok) return;
    const { messages: finalMessages, provider, safeExtraBody, temperature, maxTokens, reasoning_effort, responseSpeed } = prep.payload;

    const promptTokens = estimateMessageTokens(finalMessages);
    const completion = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext!,
      model: provider.model,
      messages: finalMessages,
      maxTokens,
      temperature,
      reasoning_effort,
      response_speed: responseSpeed,
      extra_body: safeExtraBody,
    });

    /* Non-streaming responses always carry `usage` on OpenAI-compatible
       providers, so this path is normally exact; the chars/4 estimate is
       only reached when a gateway omits it. */
    const settled = resolveUsage(completion.usage, {
      promptTokens,
      completionTokens: estimateTokens(completion.content || ''),
    });
    if (req.userId) {
      recordUsage({
        userId: req.userId,
        model: provider.model,
        sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : null,
        promptTokens: settled.promptTokens,
        completionTokens: settled.completionTokens,
        source: 'chat',
        usageSource: settled.usageSource,
      });
    }

    const content = completion.content || '';
    /* P_chat-response-compat — /api/chat is our compact `{content}` API,
       while older auxiliary clients and title/search helpers used the
       OpenAI `choices[0].message.content` shape. Return both views during
       the migration so a stale bundle cannot silently discard a successful
       completion. */
    return res.json({
      content,
      choices: [{ message: { role: 'assistant', content } }],
      reasoning_content: completion.reasoning_content || null,
      /* Report the same numbers that were billed, plus where they came from.
         Previously this always echoed the chars/4 estimate, so a client had
         no way to know the figure was approximate. */
      usage: {
        promptTokens: settled.promptTokens,
        completionTokens: settled.completionTokens,
        totalTokens: settled.promptTokens + settled.completionTokens,
        source: settled.usageSource,
      },
      meta: completion.meta,
    });
  } catch (err) { next(err); }
});

/* SSE streaming endpoint — see ./chat/stream.js for the full handler. */
registerStreamRoute(router);

export default router;
