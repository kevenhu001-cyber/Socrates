import { Router } from 'express';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { estimateMessageTokens, estimateTokens, recordUsage, resolveUsage } from '../services/usageTracker.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { sanitizeExtraBody } from '../lib/sanitize.js';
import { trackSseConnection, startSseKeepalive } from '../lib/sse.js';
import { getBeagleSystemPrompt } from '../lib/prompts.js';
import { enforceServerSystemBoundary, appendAssistantInstructions, appendFinalOutputConstraints, injectUserContext, transformMessagesForModel, SSE_PRIME } from './chat/helpers.js';
import { isUuid } from '../lib/validate.js';
import { BadRequest } from '../lib/errors.js';

const router = Router();

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

    const { messages: rawMessages, model, temperature, max_tokens, stream, reasoning_effort, response_speed, extra_body, assistantId, sessionId } = req.body;
    if ((assistantId && !isUuid(assistantId)) || (sessionId && !isUuid(sessionId))) throw new BadRequest('Invalid assistant or session id');
    const responseSpeed = response_speed === 'fast' ? 'fast' : 'standard';

    /* P_beagle-system-prompt — inject the full behavior spec from
       prompts/beagle.md as the first system message. This is the
       Beagle identity (Topodrive), tool-routing guidance, and response-
       behavior rules that the built-in MiniMax-M3 base model must
       follow when called through this proxy. The full spec lives on
       disk and is loaded/cached by lib/prompts.js so editing the .md
       is picked up on the next request.

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
    /* P_proxy-user-context — mirror the /api/chat assembly: inject the
       current date, user display name/tier, and the image-description
       untrusted-data rule as the freshest data the model reads. Without
       this the built-in path silently skips the date / locale / image-
       injection rules that /api/chat enforces. */
    messages = injectUserContext(messages, req.user);
    messages = await appendAssistantInstructions(messages, assistantId, sessionId, req.userId ?? undefined);
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
    /* P_proxy-multimodal-transform — defense-in-depth for any future
       built-in model that is text-only (the current provider is marked
       multimodal, so this is currently a no-op). Mirrors /api/chat so
       non-multimodal upstreams get a coherent text placeholder instead
       of a confusing upstream 400. */
    messages = transformMessagesForModel(messages, provider);
    /* P_no-dash-final — mirror the /api/chat assembly: the no-dash hard rule
       must be the LAST text of the system prompt on the built-in Beagle path
       too, so it cannot be buried under beagle.md. Keep this after every
       other prompt-injection step. */
    messages = appendFinalOutputConstraints(messages);
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

      /* Prime the stream — see chat/helpers.js SSE_PRIME for the full
         rationale. 32 KB of `:` comment lines overflows EdgeOne's
         ~8 KB first-chunk buffer and Safari's ~1 KB fetch ReadableStream
         buffer so deltas reach the browser as soon as the upstream
         emits them, not in one coalesced blob. */
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
          response_speed: responseSpeed,
          extra_body: safeExtraBody,
          onPreferenceFallback: (detail) => {
            try {
              res.write(`event: preference_fallback\ndata: ${JSON.stringify(detail)}\n\n`);
            } catch { /* client disconnected */ }
          },
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
        ({ usage }) => {
          try {
            res.write('data: [DONE]\n\n');
            res.end();
          } catch { /* ignore */ }
          if (req.userId) {
            /* Built-in MiniMax provider: prefer its reported usage, fall
               back to the chars/4 estimate when the frame is absent. */
            const settled = resolveUsage(usage, { promptTokens, completionTokens });
            recordUsage({
              userId: req.userId,
              model: upstreamModel,
              sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : null,
              promptTokens: settled.promptTokens,
              completionTokens: settled.completionTokens,
              source: 'chat',
              usageSource: settled.usageSource,
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
      /* P_long-llm-override — same as /api/chat: the non-streaming proxy
       * waits for the upstream model however long it thinks, so it opts
       * out of the global request deadline (see timeoutMiddleware). */
      res.locals.timeoutMs = 0;
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
        response_speed: responseSpeed,
        extra_body: safeExtraBody,
      });

      res.json({
        /* P_deepseek-mode — preserve reasoning_content on the
           response so the client can persist it for the next turn. */
        choices: [{ message: { role: 'assistant', content: result.content, ...(result.reasoning_content ? { reasoning_content: result.reasoning_content } : {}) } }],
        meta: result.meta,
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
