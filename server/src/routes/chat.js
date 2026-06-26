import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { estimateMessageTokens, estimateTokens, recordUsage } from '../services/usageTracker.js';
import { usageEvents } from '../db/schema.js';
import { BadRequest, TooManyRequests } from '../lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEACHER_MODE_PROMPT_PATH = path.resolve(__dirname, '../../../prompts/teacher-mode.md');
const TEACHER_MODE_MARKER = '# Teacher Mode';

let teacherModeCache = null; // { mtime, content }

/* Cached loader for prompts/teacher-mode.md — re-reads only when the
   file's mtime changes, so edits are picked up without restarting and
   we don't touch disk on every request. */
export function getTeacherModePrompt() {
  try {
    const stat = statSync(TEACHER_MODE_PROMPT_PATH);
    const mtime = stat.mtimeMs;
    if (teacherModeCache && teacherModeCache.mtime === mtime) {
      return teacherModeCache.content;
    }
    const content = readFileSync(TEACHER_MODE_PROMPT_PATH, 'utf8');
    teacherModeCache = { mtime, content };
    return content;
  } catch (err) {
    console.error('[chat] Failed to load teacher-mode.md:', err.message);
    return null;
  }
}

/* Prepends the teacher-mode system prompt unless the frontend already
   sent a system message containing the teacher-mode marker (in which
   case it may have layered dynamic context on top — leave it alone). */
function prependTeacherModePrompt(messages) {
  const prompt = getTeacherModePrompt();
  if (!prompt) return messages;
  const first = messages[0];
  if (
    first &&
    first.role === 'system' &&
    typeof first.content === 'string' &&
    first.content.includes(TEACHER_MODE_MARKER)
  ) {
    return messages;
  }
  return [{ role: 'system', content: prompt }, ...messages];
}

/* Per-tier monthly Beagle token quotas. */
const BEAGLE_TIER_QUOTAS = {
  diophantus: 1_000_000,
  riemann:    100_000_000,
  descartes:  300_000_000,
  euclid:     800_000_000,
};

async function checkBeagleMonthlyLimit(userId, tier) {
  if (!userId) return null;
  const quota = BEAGLE_TIER_QUOTAS[tier] || BEAGLE_TIER_QUOTAS.diophantus;
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [row] = await db.select({
    used: sql`COALESCE(SUM(${usageEvents.totalTokens}), 0)::int`,
  }).from(usageEvents)
    .where(and(
      eq(usageEvents.userId, userId),
      gte(usageEvents.createdAt, monthStart),
    ));
  const used = row?.used || 0;
  if (used >= quota) {
    return new TooManyRequests(
      `Monthly Beagle token limit (${quota.toLocaleString()}) reached. ` +
      `You have used ${used.toLocaleString()} tokens this month. ` +
      'Add your own API key in Account → API Keys to continue, or wait until next month.'
    );
  }
  return null;
}

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
  /* P_deepseek-mode — DeepSeek and DeepSeek-compatible reasoning
     models (deepseek-v3, v3.1, v3.2, r1, etc.) carry the chain-of-
     thought as a separate `reasoning_content` field on assistant
     turns so the model can pick up its own reasoning on the next
     turn. The OpenAI spec doesn't define this field but DeepSeek-
     compatible upstreams silently ignore unknown keys, so adding
     passthrough here is safe for every other provider too. */
  reasoning_content: z.string().max(500000).optional(),
}).passthrough();

const ChatPayloadSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(32000).optional(),
  mode: z.enum(['tutor', 'chat']).optional().default('chat'),
  systemContext: z.string().max(50000).optional(),
  /* P_deepseek-mode — DeepSeek SDK flags that flip chain-of-
     thought on. The frontend sends these when the active model
     looks like a DeepSeek-family reasoning model. We forward
     them to llm.js as-is; non-DeepSeek upstreams silently ignore
     the unknown fields. */
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
  extra_body: z.record(z.any()).optional(),
}).passthrough();

/* ─── Non-streaming chat (title gen, query rewrite, short tasks) ─── */
/* Audit S-H3 (P0) — switch from optionalAuth to requireAuth. The
   previous configuration let anonymous users hit the built-in
   LLM provider, opening the door to unbounded cost abuse. The
   chatLimiter (60/h by IP) was a soft control only; a distributed
   attacker could trivially bypass it. The client now creates a
   guest account via /api/auth/guest before the first chat turn,
   matching the auth model used by the rest of /api/*. */
router.post('/', chatLimiter, requireAuth, async (req, res, next) => {
  try {
    const { messages, temperature = 0.3, max_tokens, mode = 'chat', reasoning_effort, extra_body } = ChatPayloadSchema.parse(req.body);
    const finalMessages = mode === 'tutor' ? prependTeacherModePrompt(messages) : messages;

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }

    /* Beagle monthly token cap for free-tier users */
    if (provider.isBuiltIn) {
      const limitErr = await checkBeagleMonthlyLimit(req.userId, req.user?.tier);
      if (limitErr) return res.status(429).json({ code: 'MONTHLY_LIMIT', message: limitErr.message });
    }

    const result = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext,
      model: provider.model,
      messages: finalMessages,
      maxTokens: max_tokens,
      temperature,
      /* P_deepseek-mode — forward reasoning_effort + extra_body
         (e.g. {thinking:{type:"enabled"}}) so DeepSeek-family
         upstreams emit reasoning_content. */
      reasoning_effort,
      extra_body,
    });

    return res.json({
      choices: [{ message: { role: 'assistant', content: result.content } }],
    });
  } catch (err) { next(err); }
});

/* ─── SSE streaming chat ─── */
/* Audit S-H3 (P0) — same change for the streaming endpoint. See
   the comment on the non-streaming route for the rationale. */
router.post('/stream', chatLimiter, requireAuth, async (req, res, next) => {
  try {
    const { messages, temperature = 0.7, max_tokens, mode = 'chat', reasoning_effort, extra_body } = ChatPayloadSchema.parse(req.body);
    const finalMessages = mode === 'tutor' ? prependTeacherModePrompt(messages) : messages;

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }

    /* Beagle monthly token cap for free-tier users */
    if (provider.isBuiltIn) {
      const limitErr = await checkBeagleMonthlyLimit(req.userId, req.user?.tier);
      if (limitErr) return res.status(429).json({ code: 'MONTHLY_LIMIT', message: limitErr.message });
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
    /* Token accounting — compute prompt tokens once from the
       incoming messages, then increment completion tokens as
       chunks arrive. On done/error, persist a usage event into
       `usage_events` so the heatmap has data to draw. */
    const promptTokens = estimateMessageTokens(finalMessages);
    let completionTokens = 0;

    const abortController = new AbortController();
    req.on('close', () => {
      clearInterval(heartbeat);
      abortController.abort();
    });

    const sessionIdFromQuery = typeof req.query.sessionId === 'string'
      ? req.query.sessionId
      : null;

    await streamChatCompletion(
      {
        apiBase: provider.url,
        apiKey: provider.keyPlaintext,
        model: provider.model,
        messages: finalMessages,
        maxTokens: max_tokens,  /* undefined → backend passes through to model default */
        temperature,
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
        if (req.userId) {
          recordUsage({
            userId: req.userId,
            model: provider.model,
            sessionId: sessionIdFromQuery,
            promptTokens,
            completionTokens,
            source: 'chat',
          });
        }
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
        if (req.userId && fullText.length > 0) {
          /* Even on partial failure, record what we got — the
             heatmap should reflect activity regardless of outcome. */
          recordUsage({
            userId: req.userId,
            model: provider.model,
            sessionId: sessionIdFromQuery,
            promptTokens,
            completionTokens: estimateTokens(fullText),
            source: 'chat',
          });
        }
      },
      // P_deepseek-mode — emit reasoning_content as a separate SSE
      // delta field so the client can route it to the thinking pill
      // and persist it for the next turn.
      (reasoning) => {
        try {
          res.write(`data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(reasoning)}}}]}\n\n`);
        } catch { /* client disconnected */ }
      },
    );
  } catch (err) { next(err); }
});

export default router;
