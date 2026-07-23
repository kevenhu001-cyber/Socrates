/**
 * Per-user cross-request cache for completed web-search results.
 *
 * The chat app refreshes the topic research block on a schedule, which
 * means it hammers the same `(user, query, count)` triple repeatedly.
 * Caching the final result array for 5 minutes (per user) eliminates
 * the redundant Bing/Google/Baidu/Wikipedia/arxiv fetches and lets
 * topic refresh feel instant.
 *
 * Cache key includes:
 *   - userId           (per-user scoping; different users may have
 *                       different active LLM keys producing different
 *                       query expansions, so cross-user sharing is wrong)
 *   - query            (the raw user query)
 *   - count            (returned result count)
 *   - locale hint      (different hosts for CJK vs Latin)
 *   - apiKeyHint       (active LLM config hash — auto-invalidates when
 *                       the user switches providers)
 *
 * Bound: 256 entries, LRU eviction on insertion.
 */

import { createHash } from 'node:crypto';

const _cache = new Map();
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 256;
const MAX_QUERY_LEN = 500;

/**
 * Build a stable cache key.
 */
function makeKey(
  userId: string | undefined,
  query: string,
  count: number,
  locale: string | null,
  apiKeyHint: string,
) {
  const h = createHash('sha256');
  h.update(String(userId || ''));
  h.update('\x1f');
  h.update(String(query || '').slice(0, MAX_QUERY_LEN));
  h.update('\x1f');
  h.update(String(count | 0));
  h.update('\x1f');
  h.update(String(locale || '').slice(0, 32));
  h.update('\x1f');
  h.update(String(apiKeyHint || ''));
  return h.digest('hex');
}

export function get({
  userId,
  query,
  count,
  locale,
  apiKeyHint,
}: {
  userId: string | undefined;
  query: string;
  count: number;
  locale: string | null;
  apiKeyHint: string;
}): unknown | null {
  const key = makeKey(userId, query, count, locale, apiKeyHint);
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  // Refresh LRU position.
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.result;
}

export function set({
  userId,
  query,
  count,
  locale,
  apiKeyHint,
  result,
}: {
  userId: string | undefined;
  query: string;
  count: number;
  locale: string | null;
  apiKeyHint: string;
  result: unknown;
}) {
  if (!result) return;
  const key = makeKey(userId, query, count, locale, apiKeyHint);
  // Drop oldest entries when over the limit.
  while (_cache.size >= MAX_ENTRIES) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
  _cache.set(key, {
    result,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * Drop everything (e.g. on global config change).
 */
export function clear() { _cache.clear(); }

export function stats() {
  return { entries: _cache.size };
}