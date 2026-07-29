import { Router } from 'express';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { estimateMessageTokens, estimateTokens, recordUsage } from '../services/usageTracker.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { sanitizeExtraBody } from '../lib/sanitize.js';
import { trackSseConnection, startSseKeepalive } from '../lib/sse.js';
import { getBeagleSystemPrompt } from '../lib/prompts.js';
import { enforceServerSystemBoundary } from './chat/helpers.js';

const router = Router();

/* SSE_PRIME — 32 KB comment-padding frame that flushes EdgeOne CDN's first-
   chunk buffer (expected ~8 KB but may be configured larger) and Safari's ~1
   KB fetch ReadableStream buffer so the built-in Beagle stream also delivers
   deltas immediately. 32 KB provides ~4× margin over the assumed ~8 KB
   threshold. See chat.js for the full rationale. Comment lines (leading `:`)
   are spec-valid and ignored by the frontend parser. */
const SSE_PRIME = ': open\n' + Array.from({ length: 32 }, () => ':' + 'o'.repeat(1022)).join('\n') + '\n\n';

/**
 * Proxy for the built-in Beagle (MiniMax) provider.
 *
 * The SPA calls /api/minimax/v1/chat/completions directly instead of
 * going through /api/chat (which is reserved for user-configured providers).
 * This route reads the built-in provider key from the database so the
 * raw BEAGLE_SYSTEM_KEY never touches the browser.
 *
 * Supports both streaming (?stream=true in body → SSE) and
 * non-streaming (regular JSON) modes — same contract as the MiniMax API.
 *
 * SECURITY: previously this endpoint had no auth and no rate limit,
 * so any anonymous caller could drain the server's MiniMax budget.
 * We now require an authenticated session and apply the standard
 * chatLimiter (60/hr/user). The built-in provider cost is paid by
 * the operator, so anonymous access is abuse.
 */
router.post('/v1/chat/completions', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const provider = await getActiveApiKey(null); // null userId → built-in
    if (!provider || !provider.keyPlaintext) {
      return res.status(503).json({
        code: 'NO_BUILT_IN_PROVIDER',
        message: 'Built-in LLM provider is not configured on this server',
      });
    }

    const { messages: rawMessages, model, temperature, max_tokens, stream, reasoning_effort, extra_body } = req.body;

    /* P_beagle-system-prompt — inject the full behavior spec from
       prompts/beagle.md as the first system message. This is what
       actually teaches MiniMax-M3 the Socratic-tutor role, copyright
       rules, child-safety guardrails, and tool-usage conventions. The
       frontend previously only sent a ~30-line identity+visual-routing
       suffix; the full spec lives on disk and is loaded/cached by
       lib/prompts.js so editing the .md is picked up on the next request.

       If the file can't be read for any reason, we continue without it
       rather than 500 — the upstream still works, just with weaker
       guardrails. The error is already logged by getBeagleSystemPrompt.

       Skip injection if the client already supplied a system message
       that *is* the beagle spec (identified by a stable marker the
       frontend can include to avoid double-loading). */
    const beaglePrompt = await getBeagleSystemPrompt();
    /* Apply the same immutable response/tool policy used by /api/chat.
       The built-in route used to rely on the browser-provided prompt, so
       direct clients and older app builds could silently bypass the common
       writing rules. Collapsing client system blocks first also leaves one
       canonical system message for every upstream provider. */
    let messages = enforceServerSystemBoundary(Array.isArray(rawMessages) ? rawMessages : []);
    if (beaglePrompt) {
      const BEAGLE_MARKER = '<!-- @beagle-system-prompt -->';
      const alreadyHasBeagle = messages.some(
        (m) => m && m.role === 'system' && typeof m.content === 'string' && m.content.includes(BEAGLE_MARKER)
      );
      if (!alreadyHasBeagle) {
        const taggedPrompt = `${BEAGLE_MARKER}\n${beaglePrompt}`;
        messages = messages.slice();
        messages[0] = {
          ...messages[0],
          content: `${messages[0].content}\n\n${taggedPrompt}`,
        };
      }
    }
    /* P_privacy-leak — the upstream model name is operator-configured
     * and must never be settable from the client. Even though the SPA
     * currently doesn't know the real model (we strip it from
     * /api/config), a determined user could still smuggle a guess
     * into req.body.model and the previous `model || provider.model`
     * pattern would forward it to the upstream. Pin to provider.model. */
    const upstreamModel = provider.model;
    /* P_extra-body-share — H5 audit fix. Sanitise extra_body against
     * the same whitelist chat.js uses, so a forged payload can't smuggle
     * `tools`, `api_key`, etc to the built-in upstream. */
    const safeExtraBody = sanitizeExtraBody(extra_body);
    /* OpenAI-compatible endpoints also accept ?stream=true as a
       query parameter. Honour it so the built-in proxy matches
       the spec — this matters for any client that toggles streaming
       via the URL rather than the body. */
    const wantStream = stream === true || req.query.stream === 'true' || req.query.stream === '1';

    if (wantStream) {
      // ── Streaming: SSE response ──
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      /* Prime the stream — see chat.js for the full rationale.
         SSE_PRIME (32 KB of `:` comment lines) overflows buffers
         and Safari's ~1 KB first-chunk buffers so deltas reach the browser
         as soon as the upstream emits them, not in one coalesced blob. */
      try {
        res.flushHeaders();
        res.write(SSE_PRIME);
        try { (res as { flush?: () => void }).flush?.(); } catch {}
      } catch { /* socket already closed */ }

      /* P_sse-metrics — bump the active-connection counter so the
         /api/health endpoint can report how many SSE streams are open. */
      trackSseConnection(req.app, +1);

      const abortController = new AbortController();
      /* SSE keepalive — shared helper emits one comment immediately
         and then every 10 s, and self-cleans on res close/finish/error.
         Self-cleanup means the abortController below stays focused
         on cancelling the upstream LLM fetch. */
      startSseKeepalive(res, { intervalMs: 10_000 });
      req.on('close', () => {
        trackSseConnection(req.app, -1);
        abortController.abort();
      });

      /* Token accounting for the built-in MiniMax provider. */
      const promptTokens = estimateMessageTokens(messages);
      let completionTokens = 0;
      let fullText = '';

      await streamChatCompletion(
        {
          apiBase: provider.url,
          apiKey: provider.keyPlaintext,
          model: upstreamModel,
          messages: messages,
          /* undefined → llm.js default (32 K) so a long streamed
             answer isn't silently truncated by a small per-model cap. */
          maxTokens: max_tokens,
          temperature: temperature ?? 0.7,
          signal: abortController.signal,
          /* P_deepseek-mode — forward reasoning flags so the upstream
             emits reasoning_content chunks. */
          reasoning_effort,
          extra_body: safeExtraBody,
        },
        // onChunk
        (chunk) => {
          fullText += chunk;
          completionTokens = estimateTokens(fullText);
          try {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
            try { (res as { flush?: () => void }).flush?.(); } catch {}
          } catch { /* client disconnected */ }
        },
        // onDone
        () => {
          try {
            res.write('data: [DONE]\n\n');
            res.end();
          } catch { /* ignore */ }
          if (req.userId) {
            recordUsage({
              userId: req.userId,
              model: upstreamModel,
              sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : null,
              promptTokens,
              completionTokens,
              source: 'chat',
            });
          }
        },
        // onError
        (err) => {
          console.error('[minimax] stream error:', err.message);
          try {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch { /* ignore */ }
          if (req.userId && fullText.length > 0) {
            recordUsage({
              userId: req.userId,
              model: upstreamModel,
              sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : null,
              promptTokens,
              completionTokens: estimateTokens(fullText),
              source: 'chat',
            });
          }
        },
        // P_deepseek-mode — forward reasoning_content deltas to the
        // client so it can render the thinking pill.
        (reasoning) => {
          try {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning } }] })}\n\n`);
            try { (res as { flush?: () => void }).flush?.(); } catch {}
          } catch { /* client disconnected */ }
        },
      );
    } else {
      // ── Non-streaming: JSON response ──
      const result = await callChatCompletion({
        apiBase: provider.url,
        apiKey: provider.keyPlaintext,
        model: upstreamModel,
        messages: messages,
        /* undefined → llm.js default (32 K) so a long response isn't
           silently truncated by a small per-model cap. */
        maxTokens: max_tokens,
        temperature: temperature ?? 0.3,
        /* P_deepseek-mode — forward reasoning flags. */
        reasoning_effort,
        extra_body: safeExtraBody,
      });

      res.json({
        /* P_deepseek-mode — preserve reasoning_content on the
           response so the client can persist it for the next turn. */
        choices: [{ message: { role: 'assistant', content: result.content, ...(result.reasoning_content ? { reasoning_content: result.reasoning_content } : {}) } }],
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
