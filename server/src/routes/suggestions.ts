/* P_suggestions-ai — generates two starter prompts for the landing
 * composer by reading the user's recent sessions and asking the LLM
 * to propose natural follow-ups. Falls back to a hard-coded library
 * when the user has no history, when the provider is unreachable, or
 * when the upstream call fails / returns unparsable output.
 *
 * Caching:
 *   In-memory per userId, TTL 30 min. Survives only this process;
 *   cold deploys regenerate once. Fine because the per-user request
 *   rate is bounded by chatLimiter (60/hr).
 *
 * Concurrency:
 *   A single in-flight map coalesces concurrent first-load requests
 *   from the same user so two browser tabs do not double-bill the LLM.
 *
 * Output contract matches the library shape used by
 * frontend/src/ui/suggestions.js:
 *   { id, prompt, icon }
 * Icons come from the same ICON_CACHE the front-end uses, so the
 * renderer never sees an icon it cannot draw. */

import { Router } from 'express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { callChatCompletion } from '../services/llm.js';

const router = Router();

interface Suggestion {
  id: string;
  prompt: string;
  icon: string;
}

interface CachedEntry {
  suggestions: Suggestion[];
  expiresAt: number;
}

/* Allowed icon keys the renderer knows how to draw. Anything else
   collapses to `follow` server-side so a model hallucination cannot
   break the SPA icon cache. */
const ALLOWED_ICONS = new Set<string>([
  'briefing', 'inbox', 'notes', 'code', 'database', 'regex', 'teach',
  'quiz', 'compare', 'summarize', 'spark', 'pen', 'globe', 'scale',
  'follow',
]);
const ICON_ROTATION: string[] = ['spark', 'follow', 'briefing', 'teach', 'code', 'compare', 'notes', 'pen'];

/* Per-user cache. */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache: Map<string, CachedEntry> = new Map();

/* Coalesce concurrent first-load requests for the same user. */
const inFlight: Map<string, Promise<{ suggestions: Suggestion[]; source: string }>> = new Map();

function getCached(userId: string): Suggestion[] | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.suggestions;
}

function setCached(userId: string, suggestions: Suggestion[]): void {
  cache.set(userId, { suggestions, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* Hard-coded fallbacks. Picked to cover common first-run and provider-
   down cases without leaking hardcoded prompts to the live UI in the
   happy path. */
function getFallbackStarters(lang: string): Suggestion[] {
  if (lang === 'zh') {
    return [
      { id: 'fb-briefing', prompt: '给我一份晨间简报 — 列出今天最该知道的三件事', icon: 'briefing' },
      { id: 'fb-teach', prompt: '像给好奇的青少年讲一样教我一个新概念 — 先讲直觉', icon: 'teach' },
    ];
  }
  return [
    { id: 'fb-briefing', prompt: 'Give me a morning briefing — top three things I should know today', icon: 'briefing' },
    { id: 'fb-teach', prompt: 'Teach me a new concept like I am a curious teenager — start with intuition', icon: 'teach' },
  ];
}

/* Build the LLM messages. Each is short, locale-aware, and asks for a
   strict JSON array so the parser can recover even when the model
   wraps the array in a code fence. */
function buildPromptMessages(
  recentSessions: Array<{ title: string | null; topic: string | null; mode: string | null }>,
  lang: string,
): Array<{ role: string; content: string }> {
  const lines: string[] = [];
  for (const s of recentSessions) {
    const label = ((s.title || s.topic || '') as string).trim();
    if (label) lines.push(`- ${label}`);
  }

  const context = lines.length > 0 ? lines.join('\n') : '(none)';
  const count = 2;

  if (lang === 'zh') {
    return [
      {
        role: 'system',
        content: '你是 Socrates 应用的开场白生成器。根据用户最近的对话主题，生成 2 个简短的、可直接发送的中文开场白。每个不超过 30 个汉字，不要包含占位符（如 [topic]）。必须严格用 JSON 数组返回，例如 ["...","..."]。',
      },
      {
        role: 'user',
        content: `以下是用户最近的对话主题（按时间倒序，最多 15 条）：\n${context}\n\n请生成 2 条直接可用的开场白。`,
      },
    ];
  }

  return [
    {
      role: 'system',
      content: "You are the conversation starter generator for the Socrates app. Based on the user's recent chat topics, generate 2 short, directly-sendable English prompts. Each must be under 30 words, must not contain placeholders such as [topic], and must be self-contained. Always return a strict JSON array, e.g. [\"...\",\"...\"].",
    },
    {
      role: 'user',
      content: `Recent chat topics for this user (most recent first, up to 15):\n${context}\n\nGenerate ${count} starter prompts.`,
    },
  ];
}

/* Parse the model output. Accepts arrays the model wrapped in
   ```json … ``` fences, arrays with surrounding prose, or pure arrays.
   Returns null on any failure so the caller's fallback runs. */
function parseSuggestionsArray(content: string): unknown[] | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  /* 1) Direct JSON.parse on the whole response. */
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr)) return arr;
  } catch (_) { /* try fenced */ }
  /* 2) Look for the first [...] bracket-balanced substring. */
  const open = trimmed.indexOf('[');
  const close = trimmed.lastIndexOf(']');
  if (open === -1 || close === -1 || close <= open) return null;
  const candidate = trimmed.slice(open, close + 1);
  try {
    const arr = JSON.parse(candidate);
    if (Array.isArray(arr)) return arr;
  } catch (_) { /* fall through */ }
  return null;
}

/* Sanitize and shape the parsed array into the renderer contract. */
function shapeSuggestions(rawArr: unknown, lang: string): Suggestion[] {
  if (!Array.isArray(rawArr)) return [];
  const out: Suggestion[] = [];
  for (let i = 0; i < rawArr.length && out.length < 2; i++) {
    const item = rawArr[i];
    const prompt = String(item == null ? '' : item).trim();
    if (!prompt) continue;
    /* Reject placeholders — the renderer does not interpolate them
       and shipping "Teach me [topic]…" to a real user is dead UX. */
    if (/\[[^\]]+\]/.test(prompt)) continue;
    /* Length guard: keep chips short enough that mobile ellipsis never
       hides the verb. */
    const maxLen = lang === 'zh' ? 60 : 120;
    const trimmed = prompt.length > maxLen ? prompt.slice(0, maxLen - 1) + '…' : prompt;
    const icon = ICON_ROTATION[out.length % ICON_ROTATION.length];
    out.push({
      id: `ai-${Date.now()}-${out.length}`,
      prompt: trimmed,
      icon,
    });
  }
  return out;
}

async function generateStarters(
  userId: string,
  lang: string,
): Promise<{ suggestions: Suggestion[]; source: string }> {
  const db = getDb();
  const recentSessions = await db.select({
    title: sessions.title,
    topic: sessions.topic,
    mode: sessions.mode,
  })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.archivedAt)))
    .orderBy(desc(sessions.updatedAt))
    .limit(15);

  /* No history → fall back to the static library. New users get the
     same first impression regardless of provider availability. */
  if (recentSessions.length === 0) {
    return { suggestions: getFallbackStarters(lang), source: 'fallback-empty' };
  }

  const provider = await getActiveApiKey(userId).catch(() => null);
  if (!provider || !provider.keyPlaintext || !provider.url || !provider.model) {
    return { suggestions: getFallbackStarters(lang), source: 'fallback-no-provider' };
  }

  const messages = buildPromptMessages(
    recentSessions.map(s => ({ title: s.title, topic: s.topic, mode: s.mode })),
    lang,
  );

  try {
    const result = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext,
      model: provider.model,
      messages,
      maxTokens: 200,
      temperature: 0.8,
    });
    const content = (result && result.content) ? result.content : '';
    const arr = parseSuggestionsArray(content);
    if (!arr) {
      return { suggestions: getFallbackStarters(lang), source: 'fallback-bad-output' };
    }
    const shaped = shapeSuggestions(arr, lang);
    if (shaped.length === 0) {
      return { suggestions: getFallbackStarters(lang), source: 'fallback-shape-empty' };
    }
    /* Pad to two items by appending a fallback so the front-end
       always renders two chips. */
    while (shaped.length < 2) {
      const fb = getFallbackStarters(lang)[shaped.length];
      shaped.push(fb);
    }
    return { suggestions: shaped, source: 'ai' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[suggestions] LLM generation failed:', message);
    return { suggestions: getFallbackStarters(lang), source: 'fallback-error' };
  }
}

router.get('/starters', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    /* The browser always sends the user's UI locale; we use it to
       choose the system prompt language, never to gate the route. */
    const lang = (req.query.lang === 'zh' || req.query.lang === 'en')
      ? req.query.lang
      : 'en';

    const cached = getCached(userId);
    if (cached) {
      return res.json({
        suggestions: cached,
        source: 'cache',
      });
    }

    if (inFlight.has(userId)) {
      const { suggestions, source } = await inFlight.get(userId)!;
      return res.json({ suggestions, source });
    }

    const promise = generateStarters(userId, lang);
    inFlight.set(userId, promise);
    try {
      const { suggestions, source } = await promise;
      setCached(userId, suggestions);
      return res.json({ suggestions, source });
    } finally {
      inFlight.delete(userId);
    }
  } catch (err) {
    next(err);
  }
});

/* Test-only — invalidate the per-user cache. Wired in case the
   SPA exposes a "regenerate" affordance later; for now it is also
   reachable from internal tests. */
router.post('/starters/invalidate', requireAuth, async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  cache.delete(userId);
  return res.json({ ok: true });
});

/* P_suggestions-test-harness — expose the pure helpers so the unit
   test suite can exercise the parser/shaper without spinning up the
   DB or the LLM. Stripped from the production bundle by tree-shaking
   if no test import references the symbol. */
export const __test = {
  parseSuggestionsArray,
  shapeSuggestions,
  getFallbackStarters,
};

export default router;
