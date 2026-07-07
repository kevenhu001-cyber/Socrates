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
import { usageEvents, executions } from '../db/schema.js';
import { audit } from '../middleware/audit.js';
import { BadRequest, TooManyRequests, NotFound } from '../lib/errors.js';
import { getBeagleQuota } from '../lib/tiers.js';
import { getExecutionsPerDay } from '../lib/tiers.js';
import { isUuid } from '../lib/validate.js';
import { codeInterpreter, CODE_INTERPRETER_TOOL, subscribeExecution, unsubscribeExecution, subscribeExecutionResult, unsubscribeExecutionResult } from '../services/codeInterpreter.js';
import { webSearch, WEB_SEARCH_TOOL } from '../services/webSearch.js';
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

/* SSE_PRIME — 32 KB comment-padding frame written immediately after the
   response headers to flush first-chunk buffers that sit between Node and
   the browser:

   • EdgeOne CDN applies a first-chunk buffer (typically ~8 KB, but
     production configurations may use larger thresholds or per-chunk
     minimum sizes). A short LLM answer fits entirely inside that buffer,
     so the CDN holds the whole response until the stream ends and then
     forwards it in one shot — the user sees a fully-formed bubble with
     no progressive streaming and no Thinking pill.
   • Safari's fetch ReadableStream coalesces the first ~1 KB of body data
     before releasing the first chunk to reader.read(), so even on a direct
     origin connection Safari paints nothing until enough bytes accumulate.

   8 bytes (the previous `: open\n\n`) is far below both thresholds, so the
   priming never actually flushed either buffer. 32 KB provides ~4× margin
   margin but might not be sufficient if EdgeOne's buffer is configured
   larger than the documented default. 32 KB provides ~4× margin over the
   assumed 8 KB threshold, covering most real-world EdgeOne configurations.

   Comment lines (leading `:`) are valid per the SSE spec and ignored by
   every parser, including ours (the frontend skips frames that contain no
   `data:` line). Split into 33 short lines so no single line exceeds ~1 KB,
   staying under any intermediary line-length limit. Precomputed once at
   module load — zero per-request cost. */
const SSE_PRIME = ': open\n' + Array.from({ length: 32 }, () => ':' + 'o'.repeat(1022)).join('\n') + '\n\n';

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
        // primitives (no further nesting — prevents smuggling
        // 'api_key' via something like
        // response_format.api_key='…').
        if (Array.isArray(v)) {
          if (v.every(x => typeof x === 'string' || typeof x === 'number')) {
            out[k] = v;
          }
          continue;
        }
        const allPrim = Object.values(v).every(x =>
          typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
        );
        if (allPrim) out[k] = v;
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
   attacker could trivially bypass it. Every chat caller must now
   hold a valid session cookie; the front-end flips the "Guest mode"
   checkbox at sign-in as a UI hint, but the underlying session is
   still a full authenticated account (just marked isGuest in DB). */
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
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    /* Prime the stream BEFORE the upstream has anything to say.

       1. `res.flushHeaders()` forces Node to write the response status
          line + headers to the socket immediately. Without this, Express
          buffers the headers until the first body byte arrives from the
          LLM, which on a fast network can be a few hundred ms — the
          browser has painted the page but shows nothing yet, making the
          request look hung.

       2. EdgeOne CDN (~8 KB) and Safari's fetch ReadableStream (~1 KB)
          both apply a first-chunk buffer: they hold the start of the
          body until enough bytes accumulate, then switch to streaming
          mode. A short LLM answer fits entirely inside that buffer, so
          the client receives the whole response in one shot at the end
          — no progressive streaming, no Thinking pill.

          SSE_PRIME (32 KB of `:` comment lines) overflows both buffers
          so subsequent writes — even one-byte deltas — flow through
          immediately. Comment lines are valid per the SSE spec and
          ignored by every parser, including ours. */
    try {
      res.flushHeaders();
      res.write(SSE_PRIME);
      try { res.flush?.(); } catch {}
    } catch { /* socket already closed — the req.on('close') guard below handles it */ }

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
      if (!abortController.signal.aborted) {
        abortController.abort('client_disconnected');
      }
    });

    const sessionIdFromQuery = typeof req.query.sessionId === 'string' && isUuid(req.query.sessionId)
      ? req.query.sessionId
      : null;

    /* ─── Tool-calling loop ─────────────────────────────────────────
     * The LLM may decide mid-stream to call the code_interpreter
     * tool. We run streamChatCompletion, and on finish_reason ===
     * 'tool_calls' we:
     *   1. Emit `event: tool_use` so the client can render a card.
     *   2. Execute each tool call sequentially.
     *   3. Emit `event: tool_result` with the outcome.
     *   4. Append the tool result as a `role:'tool'` message and
     *      stream another chat completion that wraps up the answer.
     *
     * MAX_TOOL_ITERATIONS guards against the model getting stuck in
     * a tool-call loop; on overflow we emit a structured error event
     * and end the response cleanly.
     * ───────────────────────────────────────────────────────────── */
    const MAX_TOOL_ITERATIONS = 4;
    const codeInterpreterToolDef = codeInterpreter.getToolDefinition();
    const toolDefs = [];
    if (codeInterpreterToolDef) toolDefs.push(codeInterpreterToolDef);
    toolDefs.push(WEB_SEARCH_TOOL);
    let workingMessages = finalMessages;

    const writeSse = (payload) => {
      if (abortController.signal.aborted) return;
      try { res.write(payload); try { res.flush?.(); } catch {} } catch { /* socket closed — abortController handles cleanup */ }
    };
    const safeParseJson = (s) => {
      try { return JSON.parse(s); } catch { return null; }
    };

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      let iterFinishReason = null;
      const toolCallsThisTurn = [];

      let upstreamErr = null;
      await streamChatCompletion(
        {
          apiBase: provider.url,
          apiKey: provider.keyPlaintext,
          model: provider.model,
          messages: workingMessages,
          maxTokens: max_tokens,
          temperature,
          signal: abortController.signal,
          reasoning_effort,
          extra_body: safeExtraBody,
          ...(toolDefs.length > 0 ? { tools: toolDefs, tool_choice: 'auto' } : {}),
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
        // onDone — capture finish_reason so the loop can dispatch
        ({ finishReason }) => {
          iterFinishReason = finishReason;
        },
        // onError
        (err) => {
          upstreamErr = err;
          clearInterval(heartbeat);
          console.error('[chat/stream] LLM error:', err.message);
          try {
            res.write(`event: error\ndata: ${JSON.stringify({ error: err.message, message: err.message })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } catch { /* ignore */ }
        },
        // onReasoning — emit reasoning_content as SSE delta so the
        // client renders the thinking pill.
        (reasoning) => {
          try {
            res.write(`data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(reasoning)}}}]}\n\n`);
            try { res.flush?.(); } catch {}
          } catch { /* client disconnected */ }
        },
        // onToolUse — accumulate tool calls for this iteration. Flush
        // happens after the stream ends so the client sees a complete
        // tool_use event even if multiple tool_calls arrive split.
        (tc) => {
          toolCallsThisTurn.push(tc);
        },
      );

      if (upstreamErr) {
        // Error path already wrote [DONE] and ended the response.
        if (req.userId && fullText.length > 0) {
          recordUsage({
            userId: req.userId,
            model: provider.model,
            sessionId: sessionIdFromQuery,
            promptTokens,
            completionTokens: estimateTokens(fullText),
            source: 'chat',
          });
        }
        return;
      }

      // No tool call → done. Wrap up the response.
      if (iterFinishReason !== 'tool_calls' || toolCallsThisTurn.length === 0) break;

      // Emit tool_use event for the client to render cards.
      writeSse(`event: tool_use\ndata: ${JSON.stringify(
        toolCallsThisTurn.map((t) => ({
          id: t.id,
          name: t.function && t.function.name,
          input: safeParseJson(t.function && t.function.arguments) || {},
        })),
      )}\n\n`);

      // Echo the assistant's tool_calls back as a role:'assistant'
      // message — required by the OpenAI protocol so the next hop
      // can reference the tool_call_id.
      workingMessages = workingMessages.concat([{
        role: 'assistant',
        content: null,
        tool_calls: toolCallsThisTurn.map((t) => ({
          id: t.id,
          type: 'function',
          function: t.function,
        })),
      }]);

      // Abort guard — if the client disconnected during this turn's
      // LLM streaming, skip tool execution and terminate the loop.
      if (abortController.signal.aborted) break;

      // Run each tool call. Most models emit one per turn; we keep
      // the loop sequential so backpressure on the SSE channel is
      // predictable.
      for (const tc of toolCallsThisTurn) {
        let result;
        try {
          const args = safeParseJson(tc.function && tc.function.arguments) || {};

          const toolName = tc.function && tc.function.name;
          if (toolName === 'code_interpreter') {
            const tierLimit = getExecutionsPerDay(req.user && req.user.tier);
            if (tierLimit > 0 && req.userId) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const db = getDb();
              const [countRow] = await db.select({
                count: sql`COUNT(*)::int`,
              }).from(executions)
                .where(and(
                  eq(executions.userId, req.userId),
                  gte(executions.startedAt, today),
                ));
              const usedToday = countRow?.count || 0;
              if (usedToday >= tierLimit) {
                writeSse(`event: tool_result\ndata: ${JSON.stringify({
                  id: tc.id, ok: false, status: 'failed',
                  output: '', stderr: '',
                  error: `daily_execution_limit_reached: ${tierLimit} executions per day`,
                  artifacts: [],
                  executionId: null,
                  durationMs: 0,
                })}\n\n`);
                result = { status: 'failed', error: 'daily_execution_limit_reached' };
                workingMessages = workingMessages.concat([{
                  role: 'tool',
                  tool_call_id: tc.id,
                  content: `[error] daily execution limit of ${tierLimit} reached. The user needs to wait until tomorrow or upgrade their plan.`,
                }]);
                continue;
              }
            }

            /* P_progress — onProgress emits incremental events
               back to the browser as `event: tool_progress` SSE
               frames. The frontend routes them to the matching
               .agent-tool-card so the user sees a live spinner +
               streaming stdout while the Python code is running.
               The callback MUST be safe to call from a worker
               thread (codeInterpreter wraps it in try/catch). */
            let _emittedExecStart = false;
            const onProgress = (p) => {
              try {
                if(!_emittedExecStart&&p.executionId){
                  _emittedExecStart=true;
                  writeSse(`event: execution_start\ndata: ${JSON.stringify({
                    id: tc.id,
                    executionId: p.executionId,
                  })}\n\n`);
                }
                writeSse(`event: tool_progress
data: ${JSON.stringify({
                  id: tc.id,
                  phase: p.phase || null,
                  stream: p.stream || null,
                  chunk: p.chunk || '',
                  elapsedMs: p.elapsedMs || 0,
                })}

`);
              } catch (_) { /* client closed */ }
            };
            const execResult = await codeInterpreter.execute({
              userId: req.userId,
              sessionId: sessionIdFromQuery,
              language: args.language || 'python',
              code: args.code || '',
              signal: abortController.signal,
              onProgress,
            });
            result = execResult;

            writeSse(`event: tool_result\ndata: ${JSON.stringify({
              id: tc.id,
              ok: execResult.status === 'completed',
              status: execResult.status,
              output: execResult.stdout || '',
              stderr: execResult.stderr || '',
              error: execResult.status !== 'completed' ? (execResult.errorMessage || execResult.status) : null,
              artifacts: execResult.artifactFileIds || [],
              executionId: execResult.executionId,
              durationMs: execResult.durationMs,
            })}\n\n`);
          } else if (toolName === 'web_search') {
            // Execute web search as an LLM tool.
            const searchQuery = args.query || '';
            const searchCount = Math.min(args.count || 10, 12);
            let searchResults;
            try {
              searchResults = await webSearch(searchQuery, searchCount, {
                userId: req.userId,
                locale: (req.headers['accept-language'] || '').split(',')[0].trim() || null,
              });
            } catch (err) {
              searchResults = null;
              result = { status: 'failed', error: String(err && err.message || err) };
            }
            if (searchResults && searchResults.length > 0) {
              const output = searchResults.map((r) => `${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');
              result = { status: 'completed', output, results: searchResults };
              writeSse(`event: tool_result\ndata: ${JSON.stringify({
                id: tc.id, ok: true, status: 'completed',
                output,
                results: searchResults.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet, date: r.date })),
              })}\n\n`);
            } else {
              result = { status: 'completed', output: 'No search results found.', results: [] };
              writeSse(`event: tool_result\ndata: ${JSON.stringify({
                id: tc.id, ok: true, status: 'completed',
                output: 'No search results found.', results: [],
              })}\n\n`);
            }
          } else {
            // Unknown tool — tell the model so it can recover instead of looping.
            writeSse(`event: tool_result\ndata: ${JSON.stringify({
              id: tc.id, ok: false, status: 'failed',
              output: '', stderr: '', artifacts: [],
              error: 'unknown_tool',
            })}\n\n`);
            result = { status: 'failed', error: 'unknown_tool' };
          }
        } catch (err) {
          // Tool execution itself threw — never let this bubble out
          // and crash the SSE stream. Tell the model so it can pivot.
          const msg = String(err && err.message || err);
          writeSse(`event: tool_result\ndata: ${JSON.stringify({
            id: tc.id, ok: false, status: 'failed',
            output: '', stderr: '', artifacts: [],
            error: msg,
          })}\n\n`);
          result = { status: 'failed', error: msg };
        }

        // Feed the tool result back as role:'tool' so the next chat
        // completion sees it and can wrap up in prose.
        const toolContent = result.status === 'completed'
          ? (result.output || result.stdout || '(no output)')
          : `[error] ${result.error || result.status}`;
        workingMessages = workingMessages.concat([{
          role: 'tool',
          tool_call_id: tc.id,
          content: toolContent.slice(0, 60_000),  /* hard cap so a runaway tool result can't blow context */
        }]);
      }
    }

    /* Abort guard — if the client disconnected during tool execution,
     * skip the finalisation (writing [DONE] to a closed socket would
     * throw, and the recordUsage below would charge for an incomplete
     * response). The req.on('close') handler already stopped the
     * upstream LLM call; we just need to avoid touching the response
     * object. */
    if (abortController.signal.aborted) {
      clearInterval(heartbeat);
      /* Still record partial usage so the operator can see incomplete
       * responses in the heatmap and diagnose client-drop patterns. */
      if (req.userId && fullText.length > 0) {
        recordUsage({
          userId: req.userId,
          model: provider.model,
          sessionId: sessionIdFromQuery,
          promptTokens,
          completionTokens: estimateTokens(fullText),
          source: 'chat',
        });
      }
      return;
    }

    /* Done — record usage and close the stream. The onDone branch
     * inside streamChatCompletion only handles per-iteration
     * bookkeeping; the actual end-of-response ceremony happens here
     * so a final iteration that wraps up in prose still gets recorded. */
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
  } catch (err) { next(err); }
});

/* ─── Execution progress SSE stream handler ───
 * Shared between the two route mounts so there is a single source
 * of truth for the execution-progress SSE protocol.
 * The execution row is looked up by ID (scoped to the current user)
 * and progress events are emitted as they arrive from the worker.
 *
 * SSE event types:
 *   event: progress — { phase, stream, chunk, elapsedMs, executionId }
 *   event: result   — { status, executionId, stdout, stderr, durationMs }
 *   event: error    — error description
 */
async function handleExecutionStream(req, res, next) {
  try {
    const executionId = req.params.id;
    if (!isUuid(executionId)) {
      return res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid execution ID format' });
    }
    const db = getDb();
    const [exec] = await db.select().from(executions)
      .where(and(eq(executions.id, executionId), eq(executions.userId, req.userId)))
      .limit(1);
    if (!exec) throw new NotFound('Execution not found');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    try { res.flushHeaders(); } catch {}

    const heartbeat = setInterval(() => {
      try { res.write(': keepalive\n\n'); try { res.flush?.(); } catch {} } catch {}
    }, 10_000);

    if (exec.status === 'completed' || exec.status === 'failed' || exec.status === 'timeout' || exec.status === 'cancelled') {
      res.write(`event: result\ndata: ${JSON.stringify({
        status: exec.status,
        executionId: exec.id,
        stdout: exec.stdout || '',
        stderr: exec.stderr || '',
        durationMs: exec.durationMs || 0,
        exitCode: exec.exitCode,
        errorMessage: exec.errorMessage || null,
      })}\n\n`);
      try { res.flush?.(); } catch {}
      clearInterval(heartbeat);
      try { res.end(); } catch {}
      return;
    }

    const onProgress = (event) => {
      try {
        res.write(`event: progress\ndata: ${JSON.stringify({
          phase: event.phase, stream: event.stream,
          chunk: event.chunk || '', executionId: event.executionId,
          elapsedMs: event.elapsedMs || 0,
        })}\n\n`);
        try { res.flush?.(); } catch {}
      } catch {}
    };
    const onResult = (event) => {
      try {
        res.write(`event: result\ndata: ${JSON.stringify(event)}\n\n`);
        try { res.flush?.(); } catch {}
      } catch {}
    };
    const onError = (event) => {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: event.errorMessage || event })}\n\n`);
        try { res.flush?.(); } catch {}
      } catch {}
    };

    subscribeExecution(executionId, onProgress);
    subscribeExecutionResult(executionId, onResult);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeExecution(executionId, onProgress);
      unsubscribeExecutionResult(executionId, onResult);
    });
  } catch (err) { next(err); }
}

/* Mount the execution SSE handler at two paths:
 *   /api/chat/executions/:id/stream — under the chat router (backward compat)
 *   /api/executions/:id/stream      — standalone mount in app.js
 */
router.get('/executions/:id/stream', requireAuth, handleExecutionStream);
router.get('/:id/stream', requireAuth, handleExecutionStream);

export default router;
