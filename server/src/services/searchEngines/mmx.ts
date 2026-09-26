/**
 * MiniMax CLI search engine.
 *
 * Spawns `mmx search query --q "<query>" --output json` (the official
 * MiniMax CLI from npm `mmx-cli`) and normalizes the response into
 * the same shape the rest of the pipeline expects:
 *   { title, url, snippet, date, authority, source: 'minimax-cli' }
 *
 * Why a CLI wrapper instead of the direct HTTP call
 * (searchEngines/minimax.js): the project's owner standardized on
 * `mmx` as the single auth/quota surface, so all MiniMax traffic
 * should go through it. Falling back to a separate API key in the
 * server env would split quota across two accounts.
 *
 * Caveats:
 *   - Requires `mmx` on PATH (installed via `npm install -g mmx-cli`
 *     and authenticated via `mmx auth login`). If the binary is
 *     missing or not authed, this engine returns [] so the pipeline
 *     can fall through to the next engine.
 *   - Spawning a Node CLI per query costs ~100-300 ms of process
 *     startup; acceptable for web-search frequency but not for tight
 *     loops. The 8 s REQUEST_TIMEOUT below covers typical latency.
 */

import { isMmxCliAvailable, runMmx } from '../../lib/spawnMmx.js';

const REQUEST_TIMEOUT = 8_000;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  authority: string;
  source: 'minimax-cli';
}

function unavailable(reason: string): SearchResult[] {
  const result: SearchResult[] = [];
  Object.defineProperty(result, '_engineStatus', { value: reason, enumerable: false });
  return result;
}

/**
 * Search the web via the local `mmx` CLI.
 *
 * @param {string} query
 * @param {number} [limit=10]      Hard cap on returned items.
 * @param {AbortSignal|null} [signal]  External timeout signal.
 * @returns {Promise<Array<{title,url,snippet,date,authority,source}>>}
 */
export async function searchMmx(query: string, limit = 10, signal?: AbortSignal | null): Promise<SearchResult[]> {
  if (!query || !String(query).trim()) return [];
  /* Skip the spawn entirely when the CLI is not installed — an ENOENT
     per query used to waste a child-process attempt and log a warning
     on every web_search call. */
  if (!isMmxCliAvailable()) return unavailable('cli_missing');

  let stdout;
  try {
    stdout = await runMmx(
      ['search', 'query', '--q', String(query).trim(), '--output', 'json', '--quiet'],
      { signal: signal as AbortSignal | undefined, timeoutMs: REQUEST_TIMEOUT },
    );
  } catch (e) {
    // Engine failure should not break the pipeline — fall through.
    console.warn('[searchMmx]', e && (e as Error).message ? (e as Error).message : e);
    return unavailable(e && (e as Error).name === 'AbortError' ? 'timeout' : 'error');
  }

  let data;
  try {
    data = JSON.parse(stdout);
  } catch (_) {
    console.warn('[searchMmx] non-JSON output from CLI (length=' + stdout.length + ')');
    return unavailable('invalid_response');
  }

  const baseResp = data?.base_resp || data?.baseResp;
  if (baseResp && String(baseResp.status_code) !== '0') {
    console.warn(`[searchMmx] API error (${baseResp.status_code}): ${baseResp.status_msg || 'unknown'}`);
    return unavailable('upstream_error');
  }

  const organic = Array.isArray(data?.organic)
    ? data.organic
    : (Array.isArray(data?.results) ? data.results : null);

  // Type guard — a malformed response from the CLI must not crash the
  // merge step downstream. The webSearch.js consumer flattens this
  // list directly via .map and an undefined `organic` would throw a
  // TypeError deep in the pipeline rather than here.
  if (!Array.isArray(organic)) return [];

  return organic.slice(0, Math.max(1, Math.min(10, limit))).map((item): SearchResult => ({
    title: item.title || '',
    url: item.link || item.url || '',
    snippet: item.snippet || item.summary || item.content || '',
    date: item.date || null,
    authority: 'normal',
    source: 'minimax-cli',
  })).filter((r) => r.url && r.title);
}
