/*
 * P_suggestions-ai — generates the three personalised starter prompts shown
 * beneath the landing composer.
 *
 * Contract:
 *   - only the built-in Beagle provider is used;
 *   - the user must have at least one active session;
 *   - the model must return exactly three valid, distinct prompts;
 *   - any missing prerequisite or invalid output returns an empty list.
 *
 * There is deliberately no hard-coded fallback: the landing surface hides
 * the suggestion block unless the complete three-item result is available.
 */

import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { memories, messages, sessions, users } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { callChatCompletion } from '../services/llm.js';

const router = Router();

type SuggestionIcon = 'spark' | 'history' | 'target';

interface Suggestion {
  id: string;
  prompt: string;
  icon: SuggestionIcon;
}

interface SuggestionContext {
  recentSessions: Array<{ title: string | null; topic: string | null; mode: string | null }>;
  recentMessages: Array<{ role: string; content: string }>;
  customInstructions: string;
  preferences: unknown;
  memories: string[];
}

interface CachedEntry {
  suggestions: Suggestion[];
  expiresAt: number;
}

const SUGGESTION_COUNT = 3;
const ICON_ROTATION: SuggestionIcon[] = ['spark', 'history', 'target'];
const CACHE_TTL_MS = 30 * 60 * 1000;
const EMPTY_RESULT = (source: string) => ({ suggestions: [] as Suggestion[], source });

/* Per-user + locale cache. Empty results are intentionally not cached so a
   user who chats or connects Beagle after the first check can get prompts
   without waiting for a stale negative entry. */
const cache: Map<string, CachedEntry> = new Map();
const inFlight: Map<string, Promise<{ suggestions: Suggestion[]; source: string }>> = new Map();

function cacheKey(userId: string, lang: string): string {
  return `${userId}:${lang}`;
}

function getCached(userId: string, lang: string): Suggestion[] | null {
  const key = cacheKey(userId, lang);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.suggestions;
}

function setCached(userId: string, lang: string, suggestions: Suggestion[]): void {
  if (suggestions.length !== SUGGESTION_COUNT) return;
  cache.set(cacheKey(userId, lang), {
    suggestions,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function truncate(value: unknown, maxLength: number): string {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildPromptMessages(context: SuggestionContext, lang: string): Array<{ role: string; content: string }> {
  const sessionLines = context.recentSessions
    .map((session) => truncate(session.title || session.topic, 160))
    .filter(Boolean)
    .map((label) => `- ${label}`);

  const messageLines = context.recentMessages
    .map((message) => {
      const role = message.role === 'assistant' ? 'assistant' : 'user';
      const content = truncate(message.content, 500);
      return content ? `- ${role}: ${content}` : '';
    })
    .filter(Boolean);

  const preferenceLines: string[] = [];
  if (context.customInstructions) {
    preferenceLines.push(`- Custom instructions: ${truncate(context.customInstructions, 1000)}`);
  }
  if (context.preferences && Object.keys(context.preferences as Record<string, unknown>).length > 0) {
    try {
      preferenceLines.push(`- Preferences: ${truncate(JSON.stringify(context.preferences), 1200)}`);
    } catch (_) { /* ignore non-serialisable preference blobs */ }
  }
  const memoryLines = context.memories
    .map((memory) => truncate(memory, 300))
    .filter(Boolean)
    .map((memory) => `- ${memory}`);

  const sections = [
    sessionLines.length ? `Recent sessions:\n${sessionLines.join('\n')}` : '',
    messageLines.length ? `Recent messages:\n${messageLines.join('\n')}` : '',
    preferenceLines.length ? `User preferences:\n${preferenceLines.join('\n')}` : '',
    memoryLines.length ? `Saved memories:\n${memoryLines.join('\n')}` : '',
  ].filter(Boolean);
  const contextText = sections.length ? sections.join('\n\n') : '(no usable context)';

  if (lang === 'zh') {
    return [
      {
        role: 'system',
        content: [
          '你是 Socrates 首页的建议生成器。',
          '根据用户真实的会话历史、近期消息、个人偏好和已保存记忆，生成恰好 3 条可以直接发送的新对话开场白。',
          '要求：每条都具体、互不重复、自然，能延续用户真正关心的话题；不要泛泛而谈，不要编造用户没有表达过的身份或经历；不要使用 emoji；不要包含 [占位符]、代码块或解释。',
          '只输出严格的 JSON 字符串数组，例如 ["...","...","..."]。如果上下文不足，输出 []。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `${contextText}\n\n请生成恰好 3 条中文建议。`,
      },
    ];
  }

  return [
    {
      role: 'system',
      content: [
        'You generate starter prompts for the Socrates landing page.',
        'Using the real session history, recent messages, preferences, and saved memories below, produce exactly three directly sendable prompts for a new conversation.',
        'Each prompt must be specific, distinct, natural, and grounded in a topic the user actually cares about. Do not invent identities or experiences, do not use emoji, and do not include placeholders, code fences, or commentary.',
        'Return only a strict JSON array of three strings, for example ["...","...","..."]. Return [] when the context is insufficient.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `${contextText}\n\nGenerate exactly ${SUGGESTION_COUNT} English starter prompts.`,
    },
  ];
}

/* Parse arrays wrapped in a JSON fence or prose. Returns null on any failure. */
function parseSuggestionsArray(content: string): unknown[] | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { /* try the bracket-balanced slice below */ }

  const open = trimmed.indexOf('[');
  const close = trimmed.lastIndexOf(']');
  if (open === -1 || close === -1 || close <= open) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(open, close + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function normalizePrompt(value: unknown, lang: string): string | null {
  if (typeof value !== 'string') return null;
  const prompt = value.replace(/\s+/g, ' ').trim();
  if (!prompt) return null;
  if (/\[[^\]]+\]|\{\{[^}]+\}\}/.test(prompt)) return null;
  if (/[\r\n]/.test(value)) return null;
  if (/```/.test(prompt)) return null;
  if (/\p{Extended_Pictographic}/u.test(prompt)) return null;
  const maxLength = lang === 'zh' ? 60 : 120;
  if (prompt.length < 6 || prompt.length > maxLength) return null;
  return prompt;
}

/* Strict shaper: exactly three valid, distinct prompts or no suggestions. */
function shapeSuggestions(rawArr: unknown, lang: string): Suggestion[] {
  if (!Array.isArray(rawArr) || rawArr.length !== SUGGESTION_COUNT) return [];

  const prompts: string[] = [];
  for (const item of rawArr) {
    const candidate = item && typeof item === 'object'
      ? (item as { prompt?: unknown; text?: unknown }).prompt ?? (item as { text?: unknown }).text
      : item;
    const prompt = normalizePrompt(candidate, lang);
    if (!prompt) return [];
    const duplicate = prompts.some((existing) => existing.toLocaleLowerCase() === prompt.toLocaleLowerCase());
    if (duplicate) return [];
    prompts.push(prompt);
  }

  return prompts.map((prompt, index) => ({
    id: `ai-${Date.now()}-${index}`,
    prompt,
    icon: ICON_ROTATION[index],
  }));
}

async function generateStarters(
  userId: string,
  lang: string,
): Promise<{ suggestions: Suggestion[]; source: string }> {
  const db = getDb();
  const recentSessions = await db.select({
    id: sessions.id,
    title: sessions.title,
    topic: sessions.topic,
    mode: sessions.mode,
  })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.archivedAt)))
    .orderBy(desc(sessions.updatedAt))
    .limit(15);

  if (recentSessions.length === 0) {
    return EMPTY_RESULT('empty-no-history');
  }

  /* Only the built-in Beagle model may generate landing suggestions. A
     user's own provider is intentionally ignored: this surface is a
     Beagle capability, not a generic LLM feature. */
  const provider = await getActiveApiKey(null).catch(() => null);
  if (!provider || !provider.isBuiltIn || !provider.keyPlaintext || !provider.url || !provider.model) {
    return EMPTY_RESULT('empty-no-beagle');
  }

  const sessionIds = recentSessions.map((session) => session.id);
  const [messageRows, profileRow, memoryRows] = await Promise.all([
    db.select({
      role: messages.role,
      content: messages.rawText,
      fallbackContent: messages.content,
    })
      .from(messages)
      .where(inArray(messages.sessionId, sessionIds))
      .orderBy(desc(messages.createdAt))
      .limit(30),
    db.select({
      customInstructions: users.customInstructions,
      preferences: users.preferences,
    })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.select({ text: memories.text })
      .from(memories)
      .where(and(eq(memories.userId, userId), eq(memories.enabled, true)))
      .orderBy(desc(memories.createdAt))
      .limit(10),
  ]);

  const context: SuggestionContext = {
    recentSessions: recentSessions.map((session) => ({
      title: session.title,
      topic: session.topic,
      mode: session.mode,
    })),
    recentMessages: messageRows
      .slice()
      .reverse()
      .map((message) => ({
        role: message.role,
        content: message.content || message.fallbackContent || '',
      }))
      .filter((message) => message.content),
    customInstructions: profileRow[0]?.customInstructions || '',
    preferences: profileRow[0]?.preferences || {},
    memories: memoryRows.map((memory) => memory.text),
  };

  try {
    const result = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext,
      model: provider.model,
      messages: buildPromptMessages(context, lang),
      maxTokens: 300,
      temperature: 0.5,
    });
    const parsed = parseSuggestionsArray(result?.content || '');
    if (!parsed) return EMPTY_RESULT('empty-bad-output');

    const shaped = shapeSuggestions(parsed, lang);
    if (shaped.length !== SUGGESTION_COUNT) return EMPTY_RESULT('empty-invalid-output');
    return { suggestions: shaped, source: 'ai' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[suggestions] Beagle generation failed:', message);
    return EMPTY_RESULT('empty-error');
  }
}

router.get('/starters', requireAuth, chatLimiter, async (req, res, next) => {
  try {
    /* Home starter prompts come from a model call, so this response can
       take as long as the model needs; opt out of the global request
       deadline (see timeoutMiddleware). */
    res.locals.timeoutMs = 0;
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const lang = req.query.lang === 'zh' || req.query.lang === 'en' ? req.query.lang : 'en';

    const cached = getCached(userId, lang);
    if (cached) return res.json({ suggestions: cached, source: 'cache' });

    const key = cacheKey(userId, lang);
    if (inFlight.has(key)) {
      const { suggestions, source } = await inFlight.get(key)!;
      return res.json({ suggestions, source });
    }

    const promise = generateStarters(userId, lang);
    inFlight.set(key, promise);
    try {
      const { suggestions, source } = await promise;
      if (suggestions.length === SUGGESTION_COUNT) setCached(userId, lang, suggestions);
      return res.json({ suggestions, source });
    } finally {
      inFlight.delete(key);
    }
  } catch (err) {
    next(err);
  }
});

/* Test-only — invalidate the per-user cache for every locale. */
router.post('/starters/invalidate', requireAuth, async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'unauthorized' });
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
  return res.json({ ok: true });
});

export const __test = {
  parseSuggestionsArray,
  shapeSuggestions,
  buildPromptMessages,
};

export default router;
