import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { BadRequest, TooManyRequests } from '../lib/errors.js';

const router = Router();

/* ─── Non-streaming chat (title gen, query rewrite, short tasks) ─── */
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { messages, temperature = 0.3, max_tokens = 250 } = req.body;
    if (!messages || !Array.isArray(messages) || !messages.length) {
      throw new BadRequest('messages array is required');
    }

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }

    const result = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext,
      model: provider.model,
      messages,
      maxTokens: max_tokens,
      temperature,
    });

    return res.json({
      choices: [{ message: { role: 'assistant', content: result.content } }],
    });
  } catch (err) { next(err); }
});

/* ─── SSE streaming chat ─── */
router.post('/stream', optionalAuth, async (req, res, next) => {
  try {
    const { messages, temperature = 0.7, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages) || !messages.length) {
      throw new BadRequest('messages array is required');
    }

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Heartbeat keepalive
    const heartbeat = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch { clearInterval(heartbeat); }
    }, 10_000);

    let fullText = '';

    const abortController = new AbortController();
    req.on('close', () => {
      clearInterval(heartbeat);
      abortController.abort();
    });

    await streamChatCompletion(
      {
        apiBase: provider.url,
        apiKey: provider.keyPlaintext,
        model: provider.model,
        messages,
        maxTokens: max_tokens || 4096,
        temperature,
        signal: abortController.signal,
      },
      // onChunk
      (chunk) => {
        fullText += chunk;
        try {
          res.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(chunk)}}}]}\n\n`);
        } catch { /* client disconnected */ }
      },
      // onDone
      () => {
        clearInterval(heartbeat);
        try {
          res.write('data: [DONE]\n\n');
          res.end();
        } catch { /* ignore */ }
      },
      // onError
      (err) => {
        clearInterval(heartbeat);
        console.error('[chat/stream] LLM error:', err.message);
        try {
          res.write(`data: {"error":"${err.message}"}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } catch { /* ignore */ }
      }
    );
  } catch (err) { next(err); }
});

export default router;
