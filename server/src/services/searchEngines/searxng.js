/**
 * SearXNG search engine — self-hosted metasearch fallback.
 *
 * SearXNG aggregates results from multiple upstream engines (Bing, Sogou,
 * Baidu, GitHub, etc.) via a single JSON API. On this server it's
 * configured to use China-friendly engines: Bing (cn.bing.com), Sogou,
 * and others.
 *
 * Deployed as a Docker container on port 8888.
 * JSON endpoint: http://127.0.0.1:8888/search?q=<query>&format=json
 *
 * This is the fallback when MiniMax search returns no results.
 */

const REQUEST_TIMEOUT = 6_000;  // tight cap so a slow SearXNG can't drag the whole tool loop down
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || 'http://127.0.0.1:8888';

function unavailable(reason) {
  const result = [];
  Object.defineProperty(result, '_engineStatus', { value: reason, enumerable: false });
  return result;
}

/**
 * Extract an approximate date from a searXNG result's publishedDate field
 * or from the snippet text.
 */
function extractDate(publishedDate, snippet) {
  if (publishedDate) {
    try {
      const d = new Date(publishedDate);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    } catch { /* fall through */ }
  }
  if (!snippet) return null;
  const m = snippet.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
  return m ? m[1] : null;
}

/**
 * Search via searXNG JSON API.
 *
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<Array<{title:string, url:string, snippet:string, date:string|null, authority:string, source:'searxng'}>>}
 */
export async function searchSearxng(query, limit = 10, signal = null) {
  if (!query || !String(query).trim()) return [];

  const url = `${SEARXNG_BASE}/search?q=${encodeURIComponent(query)}&format=json&pageno=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  // Combine internal timeout with the external total-timeout signal
  const fetchSignal = signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([controller.signal, signal]) : signal)
    : controller.signal;

  try {
    const r = await fetch(url, {
      method: 'GET',
      signal: fetchSignal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!r.ok) return unavailable(`http_${r.status}`);

    const data = await r.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) return [];

    return results.slice(0, limit).map((item) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.content || '',
      date: extractDate(item.publishedDate, item.content),
      authority: item.engine === 'wikipedia' || item.engine === 'arxiv' ? 'high' : 'normal',
      source: 'searxng',
    })).filter((r) => r.url && r.title);
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      console.warn('[searchSearxng] Request timed out');
    } else {
      console.warn('[searchSearxng] Request failed:', e && e.message ? e.message : e);
    }
    return unavailable(e && e.name === 'AbortError' ? 'timeout' : 'error');
  }
}
