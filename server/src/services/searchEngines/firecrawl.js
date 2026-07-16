/**
 * Firecrawl CLI search engine.
 *
 * Spawns the local `firecrawl` CLI (npm `firecrawl-cli`) to search the
 * web and normalises the response into the pipeline's standard shape:
 *   { title, url, snippet, date, authority, source: 'firecrawl' }
 *
 * Why a CLI wrapper:
 *   - firecrawl-cli is already authenticated on this machine with 1,391
 *     credits remaining (1,000 free credits/month replenished).
 *   - It provides a zero-config web search that works from China-friendly
 *     infra, as a complement to the existing mmx/minimax/bing pipeline.
 *   - Spawning a Node CLI per query costs ~100-300 ms process startup;
 *     acceptable for web-search frequency.
 *
 * The firecrawl search JSON response shape is:
 *   { "success": true,
 *     "data": { "web": [{ "title","url","description","position" }] },
 *     "id": "...", "creditsUsed": 2 }
 *
 * Default source is `web` (not `news` or `images`).
 */

import { runFirecrawl } from '../../lib/spawnFirecrawl.js';

const REQUEST_TIMEOUT = 10_000;

function unavailable(reason) {
  const result = [];
  Object.defineProperty(result, '_engineStatus', { value: reason, enumerable: false });
  return result;
}

/**
 * Search the web via the local `firecrawl` CLI.
 *
 * @param {string}  query
 * @param {number}  [limit=10]     Hard cap on returned items (max 100 for firecrawl).
 * @param {AbortSignal|null} [signal]  External timeout signal.
 * @returns {Promise<Array<{title,url,snippet,date,authority,source}>>}
 */
export async function searchFirecrawl(query, limit = 10, signal) {
  if (!query || !String(query).trim()) return [];

  const cap = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 10));

  let stdout;
  try {
    stdout = await runFirecrawl(
      ['search', String(query).trim(), '--limit', String(cap), '--json'],
      { signal, timeoutMs: REQUEST_TIMEOUT },
    );
  } catch (e) {
    console.warn('[searchFirecrawl]', e && e.message ? e.message : e);
    return unavailable(e && e.name === 'AbortError' ? 'timeout' : 'error');
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (_) {
    console.warn('[searchFirecrawl] non-JSON output (length=' + stdout.length + ')');
    return unavailable('invalid_response');
  }

  if (!parsed || parsed.success !== true) {
    console.warn('[searchFirecrawl] API returned success=false');
    return unavailable('upstream_error');
  }

  // firecrawl returns results under data.web (default source=web).
  // The response may also have data.news or data.images for other sources,
  // but we only use the default web source here.
  const items = parsed?.data?.web;
  if (!Array.isArray(items) || items.length === 0) return [];

  return items.slice(0, cap).map((item) => ({
    title: item.title || '',
    url: item.url || '',
    snippet: item.description || item.snippet || '',
    date: item.date || null,
    authority: 'normal',
    source: 'firecrawl',
  })).filter((r) => r.url && r.title);
}
