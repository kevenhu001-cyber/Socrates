import { apiRequest } from '../api/client';
import { getItem, setItem } from '../../platform/secureStorage';

/**
 * Client-side web research, ported from `frontend/src/chat/webSearch.js`.
 * The web does not rely on the model's own tool call: it expands the user's
 * topic into several queries, searches `/api/web-search`, reads back the top
 * pages through `/api/fetch-batch`, scores every hit for relevance to the
 * original topic, and injects the surviving ones as a `[Web research]` system
 * block. The prompt text below is kept byte-identical to the web so both
 * clients ground the model the same way.
 */

export interface WebSearchHit {
  title: string;
  url: string;
  snippet?: string;
  matchedQuery?: string;
  fullContent?: string | null;
  truncated?: boolean;
  relevance: number;
}

export interface WebSearchOutcome {
  ok: boolean;
  reason: string;
  results: number;
  context: string;
}

/** Per-turn cap on /api/web-search POSTs, mirroring `MAX_WS_CALLS`. */
const MAX_WS_CALLS = 5;
/** Re-fetch cadence: every 5 user turns, but never within 30s of a refresh. */
export const SEARCH_REFRESH_EVERY = 5;
const REFRESH_COOLDOWN_MS = 30_000;

const REWRITER_PROMPT = 'You are a precise search query generator. Given the user\'s message, generate '
  + 'search queries that will return EXACTLY the information the user is looking for. '
  + 'Accuracy is critical — prefer EXACT PHRASE matches and UNIQUE technical terms over generic keywords. Rules:\n'
  + '- Each query MUST contain the CORE named entities and key terms from the user\'s message\n'
  + '- Use exact phrase matching: put specific multi-word terms in quotes when they form a unit\n'
  + '- Queries must be 4-12 words, precise not generic\n'
  + '- Avoid filler words, pronouns, and vague terms\n'
  + '- Generate 5 queries, each targeting a slightly different facet so at least 2-3 return useful results\n'
  + 'Output ONLY a JSON array of strings, no other text. '
  + 'Example for user asking about migrating from TensorFlow to PyTorch performance:\n'
  + '["TensorFlow to PyTorch migration performance comparison", '
  + '"PyTorch vs TensorFlow benchmark 2025", '
  + '"migrate TensorFlow model PyTorch tutorial step by step", '
  + '"PyTorch performance tips production deployment", '
  + '"PyTorch vs JAX speed benchmark 2025"]';

interface SearchResponse {
  results?: Array<{ title?: string; url?: string; snippet?: string }>;
}

interface FetchBatchResponse {
  results?: Array<{ url?: string; ok?: boolean; content?: string; truncated?: boolean }>;
}

/** `rawText → queries`, memoised for the last 64 topics like the web. */
const rewriterCache = new Map<string, string[]>();

export async function rewriteQueryForSearch(rawText: string): Promise<string[] | null> {
  if (!rawText) return null;
  const cached = rewriterCache.get(rawText);
  if (cached) return cached;
  try {
    const response = await apiRequest<{ content?: string; choices?: Array<{ message?: { content?: string } }> }>('/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: REWRITER_PROMPT },
          { role: 'user', content: rawText.slice(0, 500) },
        ],
        temperature: 0.3,
        max_tokens: 250,
        mode: 'chat',
      }),
    });
    const text = typeof response?.content === 'string'
      ? response.content
      : response?.choices?.[0]?.message?.content || '';
    if (!text) return null;
    /* Tolerate stray prose around the array, exactly like the web parser. */
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return null;
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    const cleaned = parsed
      .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      .map((item) => item.trim());
    if (!cleaned.length) return null;
    if (rewriterCache.size > 64) rewriterCache.clear();
    rewriterCache.set(rawText, cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

async function searchOnce(query: string, count = 8) {
  try {
    const data = await apiRequest<SearchResponse>('/web-search', {
      method: 'POST',
      body: JSON.stringify({ query, count }),
    });
    return { ok: true as const, query, results: Array.isArray(data?.results) ? data.results : [] };
  } catch (error) {
    return {
      ok: false as const,
      query,
      results: [] as NonNullable<SearchResponse['results']>,
      reason: error instanceof Error ? error.message : 'failed',
    };
  }
}

/** Port of the web's multi-signal relevance score, normalised to 0–100. */
function scoreRelevance(topic: string, hit: Omit<WebSearchHit, 'relevance'>): number {
  const topicWords = topic.toLowerCase().split(/\W+/).filter((word) => word.length > 2);
  const bigrams: string[] = [];
  for (let i = 0; i < topicWords.length - 1; i += 1) bigrams.push(`${topicWords[i]} ${topicWords[i + 1]}`);
  const title = (hit.title || '').toLowerCase();
  const snippet = (hit.snippet || '').toLowerCase();
  const full = (hit.fullContent || '').toLowerCase();
  let score = 0;
  for (const word of topicWords) if (title.includes(word)) score += 15;
  for (const bigram of bigrams) if (title.includes(bigram)) score += 20;
  for (const word of topicWords) if (snippet.includes(word)) score += 8;
  if (full) {
    for (const word of topicWords) if (full.includes(word)) score += 5;
    for (const bigram of bigrams) if (full.includes(bigram)) score += 10;
  }
  const maxScore = topicWords.length * 28 + Math.max(0, topicWords.length - 1) * 30;
  return Math.round(Math.min(100, (score / Math.max(1, maxScore)) * 100));
}

function relevanceTag(relevance: number): string {
  if (relevance >= 70) return '[high relevance]';
  if (relevance >= 45) return '[medium relevance]';
  return '[low relevance]';
}

function buildContext(topic: string, hits: WebSearchHit[]): string {
  const lines = hits.map((hit, index) => {
    let head = `[${index + 1}] ${relevanceTag(hit.relevance)} ${hit.title}`;
    if (hit.snippet) head += ` — ${hit.snippet}`;
    head += ` ( ${hit.url} )`;
    head += `\n    Source query: "${hit.matchedQuery || topic}"`;
    if (hit.fullContent) {
      const trimmed = hit.fullContent.length > 3000 ? `${hit.fullContent.slice(0, 3000)}…` : hit.fullContent;
      head += `\n    Full text: ${trimmed}`;
    } else {
      head += '\n    (snippet only — full text unavailable)';
    }
    return head;
  });
  return '\n\n[Web research] — original query: "' + topic + '". '
    + 'Each result below was retrieved live from the web, scored for relevance, and sorted by estimated accuracy. '
    + '[high relevance] results closely match what the user is asking about. [medium relevance] are related but may be tangential. '
    + '[low relevance] results are included only as supplementary context — use them cautiously.\n\n'
    + 'Weave the facts into your reply as natural prose. Do NOT add [1]/[2] citation markers, do NOT append a "Sources:"/"References:" list, and do NOT paste result URLs into your reply (the UI already shows every source to the user). '
    + 'Do NOT invent facts not supported by the results. '
    + 'If multiple results contradict each other, prefer [high relevance] sources.\n'
    + lines.join('\n');
}

/**
 * Search + read-back + score for `topic`. `onPill` mirrors the web's
 * `setSearchPill` so the caller can surface "Searching… / n sources / failed".
 */
export async function fetchWebContext(
  topic: string,
  options: { onPill?: (kind: 'loading' | 'ok' | 'err', count: number, label?: string) => void } = {},
): Promise<WebSearchOutcome & { hits: WebSearchHit[] }> {
  const { onPill } = options;
  if (!topic) return { ok: false, reason: 'disabled', results: 0, context: '', hits: [] };
  onPill?.('loading', 0, 'Searching…');

  let queries = (await rewriteQueryForSearch(topic)) || [];
  /* The raw topic is always searched as a baseline — the rewriter regularly
   * over-engineers away the one term that mattered. */
  if (!queries.includes(topic)) queries.push(topic);
  queries = queries.slice(0, Math.min(6, MAX_WS_CALLS));

  const responses = await Promise.all(queries.map((query) => searchOnce(query)));
  const seen = new Set<string>();
  let picked: Array<{ title: string; url: string; snippet?: string; matchedQuery: string }> = [];
  for (const response of responses) {
    if (!response.ok) continue;
    for (const item of response.results) {
      if (!item?.url || seen.has(item.url)) continue;
      seen.add(item.url);
      picked.push({ title: item.title || item.url, url: item.url, snippet: item.snippet, matchedQuery: response.query });
      if (picked.length >= 25) break;
    }
    if (picked.length >= 25) break;
  }

  if (!picked.length) {
    const failed = responses.find((response) => !response.ok && response.reason);
    const reason = failed?.reason || 'no results';
    onPill?.('err', 0, `Search failed: ${reason}`);
    return { ok: false, reason, results: 0, context: '', hits: [] };
  }

  /* Read back the top pages so the model can quote the article, not just the
   * snippet. A failed batch leaves `fullContent` null and the snippet is used. */
  const topUrls = picked.slice(0, 8).map((hit) => hit.url);
  const byUrl = new Map<string, { ok?: boolean; content?: string; truncated?: boolean }>();
  if (topUrls.length) {
    try {
      const batch = await apiRequest<FetchBatchResponse>('/fetch-batch', {
        method: 'POST',
        body: JSON.stringify({ urls: topUrls }),
      });
      for (const entry of batch?.results || []) if (entry?.url) byUrl.set(entry.url, entry);
    } catch {
      /* snippet-only fallback below */
    }
  }

  let hits: WebSearchHit[] = picked.map((hit) => {
    const fetched = byUrl.get(hit.url);
    const enriched = {
      ...hit,
      fullContent: fetched?.ok ? fetched.content ?? null : null,
      truncated: Boolean(fetched?.ok && fetched.truncated),
    };
    return { ...enriched, relevance: scoreRelevance(topic, enriched) };
  });

  const kept = hits.filter((hit) => hit.relevance >= 30);
  if (kept.length) {
    hits = kept;
  } else {
    /* A gutted list is usually a scoring artefact, not a dead topic — keep the
     * best three and let the model decide. */
    hits = hits.slice(0, 3).map((hit) => ({ ...hit, relevance: Math.max(hit.relevance, 25) }));
  }
  hits.sort((a, b) => b.relevance - a.relevance);

  onPill?.('ok', hits.length);
  return { ok: true, reason: 'ok', results: hits.length, context: buildContext(topic, hits), hits };
}

/** Web rule: refresh every `SEARCH_REFRESH_EVERY` turns, outside the cooldown. */
export function shouldRefreshSearch(input: {
  enabled: boolean;
  lastAt: number;
  hasQuery: boolean;
  totalQuestions: number;
}): boolean {
  if (!input.enabled || !input.hasQuery) return false;
  if (Date.now() - input.lastAt < REFRESH_COOLDOWN_MS) return false;
  return input.totalQuestions % SEARCH_REFRESH_EVERY === 0;
}

/* The web keeps the switch in `localStorage["socrates-websearch"]` and it is
 * off by default; SecureStore holds the same preference here. */
const WEB_SEARCH_KEY = 'socrates-websearch';

export async function loadWebSearchEnabled(): Promise<boolean> {
  try {
    return (await getItem(WEB_SEARCH_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function persistWebSearchEnabled(enabled: boolean) {
  await setItem(WEB_SEARCH_KEY, enabled ? 'true' : 'false');
}
