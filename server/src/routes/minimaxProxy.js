import { Router } from 'express';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { estimateMessageTokens, estimateTokens, recordUsage } from '../services/usageTracker.js';

const router = Router();

/**
 * Proxy for the built-in Beagle (MiniMax) provider.
 *
 * The SPA calls /api/minimax/v1/chat/completions directly instead of
 * going through /api/chat (which is reserved for user-configured providers).
 * This route reads the built-in provider key from the database so the
 * raw MINIMAX_API_KEY never touches the browser.
 *
 * Supports both streaming (?stream=true in body → SSE) and
 * non-streaming (regular JSON) modes — same contract as the MiniMax API.
 */
router.post('/v1/chat/completions', async (req, res, next) => {
  try {
    const provider = await getActiveApiKey(null); // null userId → built-in
    if (!provider || !provider.keyPlaintext) {
      return res.status(503).json({
        code: 'NO_BUILT_IN_PROVIDER',
        message: 'Built-in LLM provider is not configured on this server',
      });
    }

    const { messages, model, temperature, max_tokens, stream, reasoning_effort, extra_body } = req.body;

    if (stream) {
      // ── Streaming: SSE response ──
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const abortController = new AbortController();
      req.on('close', () => abortController.abort());

      /* Token accounting for the built-in MiniMax provider. */
      const promptTokens = estimateMessageTokens(messages);
      let completionTokens = 0;
      let fullText = '';

      await streamChatCompletion(
        {
          apiBase: provider.url,
          apiKey: provider.keyPlaintext,
          model: model || provider.model,
          messages,
          /* undefined → llm.js default (32 K) so a long streamed
             answer isn't silently truncated by a small per-model cap. */
          maxTokens: max_tokens,
          temperature: temperature ?? 0.7,
          signal: abortController.signal,
          /* P_deepseek-mode — forward reasoning flags so the upstream
             emits reasoning_content chunks. */
          reasoning_effort,
          extra_body,
        },
        // onChunk
        (chunk) => {
          fullText += chunk;
          completionTokens = estimateTokens(fullText);
          try {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
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
              model: model || provider.model,
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
              model: model || provider.model,
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
          } catch { /* client disconnected */ }
        },
      );
    } else {
      // ── Non-streaming: JSON response ──
      const result = await callChatCompletion({
        apiBase: provider.url,
        apiKey: provider.keyPlaintext,
        model: model || provider.model,
        messages,
        /* undefined → llm.js default (32 K) so a long response isn't
           silently truncated by a small per-model cap. */
        maxTokens: max_tokens,
        temperature: temperature ?? 0.3,
        /* P_deepseek-mode — forward reasoning flags. */
        reasoning_effort,
        extra_body,
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
