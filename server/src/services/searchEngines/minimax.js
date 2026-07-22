/**
 * MiniMax Token Plan Web Search engine.
 *
 * Uses the Token Plan search endpoint behind the MiniMax MCP web_search tool:
 *   POST /v1/coding_plan/search
 *
 * This engine is used as a PRIORITY search — if it returns results,
 * the pipeline short-circuits and skips all other engines as well as
 * the fetchBatch content-extraction step.
 *
 * API docs: https://platform.minimax.io/docs/token-plan/mcp-guide
 *
 * Response shape (three possible containers):
 *   { organic: [{ title, link, snippet, ... }] }
 *   { results: [{ title, url, snippet, ... }] }
 *   { data: { organic: [...] } }
 */

const REQUEST_TIMEOUT = 10_000;

function unavailable(reason) {
  const result = [];
  Object.defineProperty(result, '_engineStatus', { value: reason, enumerable: false });
  return result;
}

/**
 * Build the search endpoint URL.
 * Prefers MINIMAX_SEARCH_BASE_URL (so the search feature can target a
 * different upstream than the LLM, e.g. Minimax Coding Plan while the
 * built-in Beagle LLM still points at SenseNova). Falls back to the
 * shared MINIMAX_BASE_URL, then to the Minimax Coding Plan default.
 *
 * Examples:
 *   MINIMAX_SEARCH_BASE_URL=https://api.minimaxi.com/v1
 *     → https://api.minimaxi.com/v1/coding_plan/search
 *   MINIMAX_BASE_URL=https://token.sensenova.cn/v1
 *     → https://token.sensenova.cn/v1/coding_plan/search
 */
function buildEndpoint() {
  const base = (process.env.MINIMAX_SEARCH_BASE_URL
             || process.env.MINIMAX_BASE_URL
             || 'https://api.minimaxi.com/v1').replace(/\/+$/, '');
  if (base.endsWith('/v1/coding_plan/search')) return base;
  if (base.endsWith('/v1/coding_plan')) return `${base}/search`;
  if (base.endsWith('/v1')) return `${base}/coding_plan/search`;
  return `${base}/v1/coding_plan/search`;
}

/**
 * Get the MiniMax search API key.
 * Uses MINIMAX_SEARCH_KEY if set (dedicated search key), otherwise
 * falls back to BEAGLE_SYSTEM_KEY (the built-in Beagle provider key).
 */
function getApiKey() {
  return process.env.MINIMAX_SEARCH_KEY || process.env.BEAGLE_SYSTEM_KEY || '';
}

/**
 * Search the web via MiniMax's Token Plan search API.
 *
 * @param {string} query  Search query
 * @param {number} [limit=10]  Max results to return (API max is 10)
 * @returns {Promise<Array<{title:string, url:string, snippet:string, date:string|null, authority:string, source:'minimax'}>>}
 */
export async function searchMinimax(query, limit = 10, signal = null) {
  if (!query || !String(query).trim()) return [];
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('[searchMinimax] No API key available — skipping');
    return unavailable('disabled');
  }

  const endpoint = buildEndpoint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  // Combine internal timeout with the external total-timeout signal
  const fetchSignal = signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([controller.signal, signal]) : signal)
    : controller.signal;

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      signal: fetchSignal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ q: String(query).trim() }),
    });
    clearTimeout(timer);

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.warn(`[searchMinimax] HTTP ${r.status}: ${errText.slice(0, 200)}`);
      return unavailable(`http_${r.status}`);
    }

    const data = await r.json();

    // The API returns base_resp with status_code: 0 on success
    const baseResp = data?.base_resp || data?.baseResp;
    if (baseResp && String(baseResp.status_code) !== '0') {
      console.warn(`[searchMinimax] API error (${baseResp.status_code}): ${baseResp.status_msg || 'unknown'}`);
      return unavailable('upstream_error');
    }

    // Extract organic results — the API may return them in any of these locations
    const organic = data?.organic || data?.results || data?.data?.organic || [];
    if (!Array.isArray(organic) || organic.length === 0) return [];

    return organic.slice(0, Math.min(limit, 10)).map((item) => ({
      title: item.title || '',
      url: item.link || item.url || '',
      snippet: item.snippet || item.summary || item.content || '',
      date: item.date || null,
      authority: 'normal',
      source: 'minimax',
    })).filter((r) => r.url && r.title);
  } catch (e) {
    clearTimeout(timer);
    // AbortError is expected on timeout — log at debug level only
    if (e && e.name === 'AbortError') {
      console.warn('[searchMinimax] Request timed out');
    } else {
      console.warn('[searchMinimax] Request failed:', e && e.message ? e.message : e);
    }
    return unavailable(e && e.name === 'AbortError' ? 'timeout' : 'error');
  }
}
