import { Router } from 'express';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';

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

    const { messages, model, temperature, max_tokens, stream } = req.body;

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
        },
        // onChunk
        (chunk) => {
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
        },
        // onError
        (err) => {
          console.error('[minimax] stream error:', err.message);
          try {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch { /* ignore */ }
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
      });

      res.json({
        choices: [{ message: { role: 'assistant', content: result.content } }],
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
