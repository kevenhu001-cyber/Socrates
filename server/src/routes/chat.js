import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../db/index.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion, callChatCompletion } from '../services/llm.js';
import { estimateMessageTokens, estimateTokens, recordUsage } from '../services/usageTracker.js';
import { usageEvents } from '../db/schema.js';
import { audit } from '../middleware/audit.js';
import { BadRequest, TooManyRequests } from '../lib/errors.js';
import { getBeagleQuota } from '../lib/tiers.js';
import { isUuid } from '../lib/validate.js';
import { buildSystemContextBlock } from '../services/productContext.js';
import { isMultimodalProvider } from '../lib/multimodal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEACHER_MODE_PROMPT_PATH = path.resolve(__dirname, '../../../prompts/teacher-mode.md');
const TEACHER_MODE_MARKER = '# Teacher Mode';

let teacherModeCache = null; // { mtime, content }

/* Cached loader for prompts/teacher-mode.md — re-reads only when the
   file's mtime changes, so edits are picked up without restarting and
   we don't touch disk on every request. Uses async fs.promises to avoid
   blocking the event loop on file I/O. */
export async function getTeacherModePrompt() {
  try {
    const stat = await fs.stat(TEACHER_MODE_PROMPT_PATH);
    const mtime = stat.mtimeMs;
    if (teacherModeCache && teacherModeCache.mtime === mtime) {
      return teacherModeCache.content;
    }
    const content = await fs.readFile(TEACHER_MODE_PROMPT_PATH, 'utf8');
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
async function prependTeacherModePrompt(messages) {
  const prompt = await getTeacherModePrompt();
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

/* ─────────────────────────────────────────────────────────────────
   P_USER_CONTEXT — inject real-time user context into the first
   system message so the LLM always knows who it's talking to, the
   current time, and the user's account details.
   ───────────────────────────────────────────────────────────────── */

/**
 * Strip control characters and collapse newlines from a string before
 * it lands in a system prompt. The user's display name / email are
 * attacker-controlled (any user can rename themselves) so they must
 * not be allowed to inject literal `\n\n` followed by "ignore all
 * previous instructions" into the system prompt and steer the LLM.
 *
 * The sanitizer:
 *   - Replaces any control character (including \n, \r, \t) with a
 *     single space — we use the value as a single line.
 *   - Truncates to 120 chars (display names cap at 80, emails are
 *     254 max, so 120 is a sane upper bound for the prompt).
 *   - Strips lone angle brackets / backticks that could be picked
 *     up by a markdown renderer later.
 */
function sanitizePromptScalar(raw, max = 120) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\x00-\x1F\x7F]/g, ' ') // control chars including \n
    .replace(/[`<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function injectUserContext(messages, user) {
  if (!user) return messages;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  let userCtx = `[System context — auto-injected]\nCurrent date: ${dateStr}\nCurrent time: ${timeStr}`;

  /* User profile — every value here is sanitised before insertion
   * because display name / email are user-controlled and could
   * otherwise smuggle prompt-injection into the system prompt. */
  if (user.displayName) userCtx += `\nUser display name: ${sanitizePromptScalar(user.displayName)}`;
  if (user.email) userCtx += `\nUser email: ${sanitizePromptScalar(user.email)}`;
  if (user.tier) userCtx += `\nUser plan tier: ${sanitizePromptScalar(user.tier, 40)}`;
  if (user.plan) userCtx += `\nUser subscription: ${sanitizePromptScalar(user.plan, 40)}`;
  if (user.isGuest) userCtx += '\nUser account type: Guest';
  if (user.createdAt) {
    try {
      const created = new Date(user.createdAt);
      userCtx += `\nUser account created: ${created.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
    } catch (_) {}
  }
  userCtx += '\n[/System context]';

  /* Find the first system message and merge context into it, or
     prepend a new system message if none exists. */
  const first = messages[0];
  if (first && first.role === 'system' && typeof first.content === 'string') {
    /* Inject after the first existing system message content — preserve
       the original system prompt but add the dynamic context. */
    const cloned = messages.slice();
    cloned[0] = { ...first, content: userCtx + '\n\n' + first.content };
    return cloned;
  }
  return [{ role: 'system', content: userCtx }, ...messages];
}

/* ─────────────────────────────────────────────────────────────────
   P_PRODUCT_CONTEXT — inject topodrive.top product knowledge as a
   system message so the model can answer company/product questions
   with accurate, sourced information.  The Markdown is pre-computed
   by the productContext service (fetched + cached server-side every
   6h) and is capped at 20k chars to protect the prompt budget.
   ───────────────────────────────────────────────────────────────── */
// We previously cached the rendered block in a module-level
// `_productContextBlock` string. That made the cache "stuck" — a
// background 6h refresh inside productContext.js never propagated
// to the chat path, and the only way to get a fresh block was to
// restart the process. The service itself already memoises the
// cache entry by fetchedAt, so calling buildSystemContextBlock on
// every chat turn is cheap: it returns the cached Markdown unless
// stale, in which case it returns the stale block AND kicks off a
// background refresh. Calling it on every turn is the right
// trade-off — staleness window stays at 6h and we never serve
// genuinely outdated data.
async function injectProductContext(messages) {
  let ctxBlock = '';
  try {
    ctxBlock = await buildSystemContextBlock({ allowStale: true });
  } catch (err) {
    console.warn('[chat] productContext build failed:', err.message);
  }
  if (!ctxBlock) return messages;

  const productMsg = { role: 'system', content: ctxBlock };
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    const cloned = messages.slice();
    cloned.splice(cloned.length - 1, 0, productMsg);
    return cloned;
  }
  return [...messages, productMsg];
}

/* Per-tier monthly Beagle token quotas are now in lib/tiers.js. */
async function checkBeagleMonthlyLimit(userId, tier) {
  if (!userId) return null;
  const quota = getBeagleQuota(tier);
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

/* SECURITY: extra_body is a passthrough bag the front-end fills with
 * provider-specific knobs (DeepSeek `thinking`, sampling tweaks,
 * etc). Forwarding it verbatim would let a malicious client smuggle
 * a `tools`, `response_format` schema referencing an internal URL,
 * or — worse — duplicate `api_key` / `authorization` headers into
 * the upstream call. We whitelist a small set of safe keys here
 * and drop anything else. Add to this list when a legitimate
 * provider needs a new knob.
 */
const ALLOWED_EXTRA_BODY_KEYS = new Set([
  'thinking',          // DeepSeek-style reasoning toggle
  'top_p',             // sampling — provider-native
  'top_k',             // sampling — provider-native
  'stop',              // stop sequences
  'frequency_penalty',
  'presence_penalty',
  'logit_bias',
  'seed',
  'response_format',   // { type: 'json_object' } etc — pass-through
]);
function sanitizeExtraBody(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_EXTRA_BODY_KEYS.has(k)) {
      // Reject nested objects that try to smuggle request fields
      // via string values; allow shallow values only.
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      } else if (Array.isArray(v) || (v && typeof v === 'object')) {
        // For response_format and stop we allow the object form too,
        // but only if the JSON is itself a plain object / array of
        // strings — we don't recurse further.
        out[k] = v;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/* P_attachments — model-aware content transform.
 *
 * The chat schema accepts multimodal `image_url` parts on every
 * provider, but only vision-capable models can actually consume them.
 * Before forwarding the prompt to the upstream we run every message
 * through this transform:
 *
 *   - Plain string content → unchanged.
 *   - Multimodal content on a vision-capable model → unchanged.
 *   - Multimodal content on a TEXT-ONLY model → replace each
 *     `image_url` part with a textual placeholder so the model
 *     receives a coherent "I can't view this" instruction instead of
 *     a confusing upstream 400. We drop the original dataUrl so we
 *     don't waste tokens shipping a 500 KB base64 image to a model
 *     that can never read it.
 *   - Any other part shape (text, etc.) → unchanged.
 *
 * This is a defence-in-depth fallback. The frontend is supposed to
 * pre-decide whether to send `image_url` parts based on the active
 * provider, but we don't trust the client and re-check here. */
function transformContentForModel(content, multimodal) {
  if (!Array.isArray(content)) return content;
  if (multimodal) return content;
  const out = [];
  for (const part of content) {
    if (part && part.type === 'image_url') {
      // We don't have the original filename here (it lives in the
      // attachments column), but we can hint at it via the
      // `image_url.url` itself if it was a dataUrl — fall back to
      // a generic message. The client renders "[Image: foo.png]"
      // next to the bubble so the user knows what was attached.
      out.push({
        type: 'text',
        text: '[User attached an image. Your current model cannot view images. Ask the user to describe what they want help with.]',
      });
    } else if (part && part.type === 'text' && typeof part.text === 'string') {
      out.push(part);
    } else {
      // Unknown part type — drop rather than forward unknown shapes.
      // (We could include them but OpenAI's spec is strict about
      //  only `text` / `image_url`; unknowns may get rejected.)
    }
  }
  // If we stripped everything, leave at least an empty marker so the
  // upstream doesn't see an empty content array (which some providers
  // also reject).
  if (out.length === 0) {
    out.push({ type: 'text', text: '[User attached content that cannot be processed by the current model.]' });
  }
  return out;
}

/* Apply the multimodal transform to every user/assistant turn in
 * `messages` based on the active provider's `isMultimodal` flag.
 * System messages are not multimodal in OpenAI's spec, but we
 * still walk them for safety in case a future revision allows
 * system-image parts. The provider object is the decrypted shape
 * returned by services/apiKey.js#decryptProvider; it carries the
 * user-controlled `isMultimodal` boolean. */
function transformMessagesForModel(messages, provider) {
  const multimodal = isMultimodalProvider(provider);
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    return { ...m, content: transformContentForModel(m.content, multimodal) };
  });
}

/* ─── Non-streaming chat (title gen, query rewrite, short tasks) ─── */
/* Audit S-H3 (P0) — switch from optionalAuth to requireAuth. The
   previous configuration let anonymous users hit the built-in
   LLM provider, opening the door to unbounded cost abuse. The
   chatLimiter (60/h by IP) was a soft control only; a distributed
   attacker could trivially bypass it. The client now creates a
   guest account via /api/auth/guest before the first chat turn,
   matching the auth model used by the rest of /api/*. */
router.post('/', chatLimiter, requireAuth, audit('chat:sync'), async (req, res, next) => {
  try {
    const { messages, temperature = 0.3, max_tokens, mode = 'chat', reasoning_effort, extra_body } = ChatPayloadSchema.parse(req.body);
    /* P_USER_CONTEXT — inject real-time user context (time, profile)
       first, then prepend teacher-mode prompt if applicable. */
    let finalMessages = injectUserContext(messages, req.user);
    if (mode === 'tutor') finalMessages = await prependTeacherModePrompt(finalMessages);
    finalMessages = await injectProductContext(finalMessages);

    /* Sanitise extra_body before forwarding to the upstream — see
     * ChatPayloadSchema's comment for the rationale. */
    const safeExtraBody = sanitizeExtraBody(extra_body);

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }
    if (!provider.keyPlaintext) {
      console.error('[chat] Provider key decryption failed for provider:', provider.id, provider.label);
      return res.status(503).json({
        code: 'KEY_DECRYPT_FAILED',
        message: 'API key decryption failed. Please re-enter your API key in Settings.',
      });
    }

    /* Beagle monthly token cap for free-tier users */
    if (provider.isBuiltIn) {
      const limitErr = await checkBeagleMonthlyLimit(req.userId, req.user?.tier);
      if (limitErr) return res.status(429).json({ code: 'MONTHLY_LIMIT', message: limitErr.message });
    }

    /* P_attachments — degrade multimodal content to text-only when
     * the active model isn't vision-capable. Runs after all the
     * system-prompt injection so we can compute `finalMessages` once
     * and walk it in a single pass. The provider object carries
     * the user-controlled `isMultimodal` flag (see services/apiKey.js). */
    finalMessages = transformMessagesForModel(finalMessages, provider);

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
      extra_body: safeExtraBody,
    });

    return res.json({
      choices: [{ message: { role: 'assistant', content: result.content } }],
    });
  } catch (err) {
    /* LLM upstream returned 401/403 (bad key) or 429 (quota).
       Pass 429 through as-is so the client can show a clear
       "provider quota exceeded" message instead of the misleading
       "502 Bad Gateway". 401/403 are translated to 502 to prevent
       the frontend's apiFetch from treating an LLM key error as
       the user's own auth session expiring (which also uses 401). */
    if (err.status && (err.status === 401 || err.status === 403)) {
      return res.status(502).json({
        code: 'LLM_PROVIDER_ERROR',
        message: err.message || 'LLM provider returned ' + err.status,
      });
    }
    if (err.status && err.status === 429) {
      return res.status(429).json({
        code: 'LLM_QUOTA_EXCEEDED',
        message: err.message || 'The upstream LLM provider returned a rate-limit or quota error. Check your API key billing.',
      });
    }
    next(err);
  }
});

/* ─── SSE streaming chat ─── */
/* Audit S-H3 (P0) — same change for the streaming endpoint. See
   the comment on the non-streaming route for the rationale. */
router.post('/stream', chatLimiter, requireAuth, audit('chat:stream'), async (req, res, next) => {
  try {
    const { messages, temperature = 0.7, max_tokens, mode = 'chat', reasoning_effort, extra_body } = ChatPayloadSchema.parse(req.body);
    /* P_USER_CONTEXT — inject real-time user context (time, profile)
       first, then prepend teacher-mode prompt if applicable. */
    let finalMessages = injectUserContext(messages, req.user);
    if (mode === 'tutor') finalMessages = await prependTeacherModePrompt(finalMessages);
    finalMessages = await injectProductContext(finalMessages);

    /* Sanitise extra_body before forwarding to the upstream — see
     * ChatPayloadSchema's comment for the rationale. */
    const safeExtraBody = sanitizeExtraBody(extra_body);

    const provider = await getActiveApiKey(req.userId);
    if (!provider) {
      return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });
    }
    if (!provider.keyPlaintext) {
      console.error('[chat/stream] Provider key decryption failed for provider:', provider.id, provider.label);
      return res.status(503).json({
        code: 'KEY_DECRYPT_FAILED',
        message: 'API key decryption failed. Please re-enter your API key in Settings.',
      });
    }

    /* Beagle monthly token cap for free-tier users */
    if (provider.isBuiltIn) {
      const limitErr = await checkBeagleMonthlyLimit(req.userId, req.user?.tier);
      if (limitErr) return res.status(429).json({ code: 'MONTHLY_LIMIT', message: limitErr.message });
    }

    /* P_attachments — degrade multimodal content to text-only when
     * the active model isn't vision-capable. Must run BEFORE
     * estimateMessageTokens below so the prompt token estimate
     * doesn't count a 500 KB image_url payload. The provider object
     * carries the user-controlled `isMultimodal` flag. */
    finalMessages = transformMessagesForModel(finalMessages, provider);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Heartbeat keepalive
    const heartbeat = setInterval(() => {
      try { res.write(': keepalive\n\n'); try { res.flush?.(); } catch {} } catch { clearInterval(heartbeat); }
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

    const sessionIdFromQuery = typeof req.query.sessionId === 'string' && isUuid(req.query.sessionId)
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
        extra_body: safeExtraBody,
      },
      // onChunk
      (chunk) => {
        fullText += chunk;
        completionTokens = estimateTokens(fullText);
        try {
          res.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(chunk)}}}]}\n\n`);
          try { res.flush?.(); } catch {}
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
        /* Record usage even on error so the heatmap reflects attempts.
           The frontend surfaces the error to the user (e.g. quota). */
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
          try { res.flush?.(); } catch {}
        } catch { /* client disconnected */ }
      },
    );
  } catch (err) { next(err); }
});

export default router;
