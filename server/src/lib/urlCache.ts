/**
 * In-process LRU cache for HTTP responses, keyed by URL.
 *
 * Used by fetchBatch.js to honor If-Modified-Since / If-None-Match
 * conditional GETs. Stores the raw HTML response, status, content-type,
 * and the validator headers we received. When a 304 comes back, we
 * rebuild the same payload from the cached entry — no second parse.
 *
 * Bound: capped at 50 MB of stored HTML by default. Eviction is LRU
 * on insertion order; once we exceed the byte cap we drop the oldest
 * entry until under the cap. The cap is configurable via URL_CACHE_MAX_BYTES.
 *
 * Caveats:
 *   - Stays in process; not shared across Node instances.
 *   - HTML may change without Last-Modified changing. For research-bot
 *     use cases this is acceptable — slight staleness on topic-refresh.
 *   - Doesn't track server-driven `Cache-Control: max-age` because we
 *     are a server-side bot, not a browser.
 */

const _cache = new Map();
let _totalBytes = 0;
let _hits = 0;
let _misses = 0;

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_BYTES = parseInt(process.env.URL_CACHE_MAX_BYTES ?? '', 10) || DEFAULT_MAX_BYTES;

/**
 * @typedef {Object} CacheEntry
 * @property {string}  url
 * @property {number}  status           HTTP status of the original response
 * @property {string=} etag
 * @property {string=} lastModified
 * @property {string}  contentType
 * @property {string}  html             Raw response body (truncated by fetchBatch at 200KB)
 * @property {number}  bytes            Length of `html` in chars
 * @property {number}  fetchedAt        ms-since-epoch
 * @property {boolean} truncated        Whether fetchBatch already truncated
 */
export interface CacheEntry {
  url: string;
  status: number;
  etag?: string;
  lastModified?: string;
  contentType: string;
  html: string;
  bytes: number;
  fetchedAt: number;
  truncated: boolean;
}

/**
 * Look up a cached entry. Bumps LRU position by re-inserting.
 * @param {string} url
 * @returns {CacheEntry|null}
 */
export function get(url: string) {
  if (!url) return null;
  const entry = _cache.get(url);
  if (!entry) { _misses++; return null; }
  _hits++;
  // Refresh LRU position.
  _cache.delete(url);
  _cache.set(url, entry);
  return entry;
}

/**
 * Insert or replace a cache entry. Trims oldest entries until under cap.
 * @param {string} url
 * @param {CacheEntry} entry
 */
export function set(url: string, entry: CacheEntry) {
  if (!url || !entry || typeof entry.html !== 'string') return;
  const existing = _cache.get(url);
  if (existing) {
    _totalBytes -= existing.bytes;
    _cache.delete(url);
  }
  const bytes = entry.bytes || entry.html.length;
  entry.bytes = bytes;
  entry.fetchedAt = entry.fetchedAt || Date.now();
  _cache.set(url, entry);
  _totalBytes += bytes;
  // Evict oldest entries as needed.  We collect keys to remove in a
  // single pass *before* mutating the map so we avoid repeatedly
  // creating MapIterator objects inside the while condition.
  if (_totalBytes > MAX_BYTES && _cache.size > 1) {
    const targetBytes = MAX_BYTES;
    let excess = _totalBytes - targetBytes;
    const toEvict = [];
    for (const [key, entry] of _cache) {
      if (excess <= 0) break;
      excess -= entry.bytes;
      toEvict.push(key);
    }
    for (let i = 0; i < toEvict.length; i++) {
      const k = toEvict[i];
      _totalBytes -= _cache.get(k).bytes;
      _cache.delete(k);
    }
  }
}

/**
 * Drop a single entry (e.g., when a URL is known-bad).
 * @param {string} url
 */
export function invalidate(url: string) {
  const entry = _cache.get(url);
  if (!entry) return;
  _totalBytes -= entry.bytes;
  _cache.delete(url);
}

/** Clear all entries. */
export function clear() {
  _cache.clear();
  _totalBytes = 0;
}

/**
 * @returns {{entries:number, bytes:number, hits:number, misses:number, hitRate:number}}
 */
export function stats() {
  const total = _hits + _misses;
  return {
    entries: _cache.size,
    bytes: _totalBytes,
    hits: _hits,
    misses: _misses,
    hitRate: total === 0 ? 0 : _hits / total,
  };
}

/**
 * Reset hit/miss counters (for tests). Does not clear entries.
 */
export function _resetStats() {
  _hits = 0;
  _misses = 0;
}