import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { BadRequest, TooManyRequests } from '../lib/errors.js';

const router = Router();

// P6.x — cap message count and per-message content (prevents a 10k-
// message payload from spiking OpenAI costs / proxy timeouts).
// Supports both plain text (string) and multimodal content parts (array)
// for vision/image attachments.
const ContentPartSchema = z.object({
  type: z.enum(['text', 'image_url']),
  text: z.string().max(200000).optional(),
  image_url: z.object({
    url: z.string().max(500000),
    detail: z.string().optional(),
  }).optional(),
}).passthrough();

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.union([
    z.string().max(200000),
    z.array(ContentPartSchema).min(1).max(50),
  ]),
});

const ChatPayloadSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(32000).optional(),
}).passthrough();

/* ─── Non-streaming chat (title gen, query rewrite, short tasks) ─── */
router.post('/', chatLimiter, optionalAuth, async (req, res, next) => {
  try {
    const { messages, temperature = 0.3, max_tokens = 250 } = ChatPayloadSchema.parse(req.body);

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
router.post('/stream', chatLimiter, optionalAuth, async (req, res, next) => {
  try {
    const { messages, temperature = 0.7, max_tokens } = ChatPayloadSchema.parse(req.body);

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
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } catch { /* ignore */ }
      }
    );
  } catch (err) { next(err); }
});

export default router;
