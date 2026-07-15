import { BadRequest } from '../lib/errors.js';
import { detectLanguageCluster } from './scoring.js';
import * as searchResultCache from '../lib/searchResultCache.js';
import { searchMinimax } from './searchEngines/minimax.js';
import { searchMmx } from './searchEngines/mmx.js';
import { searchSearxng } from './searchEngines/searxng.js';
import { searchBing } from './searchEngines/bing.js';

export class WebSearchUnavailableError extends Error {
  constructor(diagnostics) {
    super('web_search_unavailable');
    this.name = 'WebSearchUnavailableError';
    this.code = 'web_search_unavailable';
    this.retryable = true;
    this.diagnostics = diagnostics;
  }
}

/**
 * Web search backend — MiniMax priority + searXNG fallback.
 *
 * Pipeline:
 *   0. CHECK CACHE — if (userId, query, count, locale, apiKeyHint) match
 *      a recent result, return it directly.
 *   1. Detect query language cluster (cjk | cyrillic | latin | other).
 *   2. Expand the user's query into 1–3 variants via the LLM (cached).
 *   3. Run MiniMax search first (priority). If it returns results,
 *      short-circuit immediately — no other engines, no fetchBatch
 *      content extraction.
 *   4. If MiniMax returns nothing, fall back to searXNG (self-hosted
 *      metasearch, configured with China-friendly engines).
 *   5. Cache the result for 5 minutes and return.
 *
 * Backwards compatibility:
 *   - Endpoint signature unchanged: webSearch(query, count, opts)
 *   - Each result keeps all legacy fields (title, url, snippet, date,
 *     authority, source, matchedQuery, matchedQueries).
 *   - The returned array has non-enumerable `expandedQueries` and
 *     `language` properties (same as before).
 *
 * @param {string} query       The user's search query.
 * @param {number} [count=10]  How many results to return (1–20).
 * @param {object} [opts]
 * @param {string} [opts.userId]   User ID for query expansion config.
 * @param {string} [opts.locale]   Locale hint for caching.
 * @param {string} [opts.apiKeyHint]  API key hint for cache key.
 */

/* ─── Tool definition (sent to upstream on every chat turn) ─── */
export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the web for current information. Use for any factual question about the present-day world, ' +
      'including current events, prices, roles, policies, products, and recent news. ' +
      'Returns up to 10 results with title, URL, snippet, and date. ' +
      'Search queries should be short (1-6 words) and specific.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (1-6 words, specific and concise).',
        },
        count: {
          type: 'number',
          default: 10,
          description: 'Number of results to return (1-12).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

/* ─── Configuration ─── */

const MAX_RESULTS = 12;           // final merged count / per-source limit

/* ═══════════════════════════════════════════════════════════════════
   Web search — parallel fan-out across MiniMax, Bing, searXNG
   ═══════════════════════════════════════════════════════════════════ */

const TIMEOUT_MINIMAX_MS = 8_000;
const TIMEOUT_BING_MS    = 8_000;
const TIMEOUT_SEARXNG_MS = 6_000;

const TOTAL_SEARCH_TIMEOUT = 12_000;

function unavailableResults(reason) {
  const result = [];
  Object.defineProperty(result, '_engineStatus', { value: reason, enumerable: false });
  return result;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[webSearch] ${label} hit ${ms}ms timeout`);
        resolve(unavailableResults('timeout'));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function webSearch(query, count = 10, opts = {}) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_RESULTS, parseInt(count, 10) || 10));
  const locale = opts.locale || null;
  const langCluster = detectLanguageCluster(query);

  // 0. Cross-request result cache (per user × query × count × locale × apiKeyHint)
  const apiKeyHint = opts.apiKeyHint || 'no-key';
  const cacheHit = searchResultCache.get({
    userId: opts.userId, query, count: limit, locale, apiKeyHint,
  });
  if (cacheHit) {
    return cacheHit;
  }

  const ac = new AbortController();
  const totalTimer = setTimeout(() => ac.abort('total_timeout'), TOTAL_SEARCH_TIMEOUT);

  const hasMinimaxKey = !!(process.env.MINIMAX_SEARCH_KEY || process.env.MINIMAX_API_KEY);
  const acSignal = ac.signal;

  /* P_mmx-cli-search — per project policy (2026-07-10), web search is
     backed by the local `mmx` CLI (which authenticates from
     ~/.mmx/config.json, the same credential surface as `mmx quota`).
     The mmx engine is the PRIORITY; the direct MiniMax HTTP engine
     and Bing race as fallbacks if mmx is missing, not authed, or
     returns no results. Both engines return the same normalized
     shape so the merge step doesn't care which one won. */
  const mmxP = withTimeout(searchMmx(query, limit, acSignal), TIMEOUT_MINIMAX_MS, 'mmx-cli');
  const minimaxP = hasMinimaxKey
    ? withTimeout(searchMinimax(query, limit, acSignal), TIMEOUT_MINIMAX_MS, 'minimax')
    : Promise.resolve([]);
  const bingP = withTimeout(searchBing(query, limit, acSignal), TIMEOUT_BING_MS, 'bing');

  /* P_mmx-priority — wait for ALL engines in parallel and prefer mmx
     if it returned anything. The previous Promise.race strategy let
     Bing win on latency even when mmx had strictly-better results,
     because mmx pays a ~150-300 ms Node CLI spawn cost that Bing's
     HTTP fetch doesn't. Now: mmx is the priority; bing/searxng only
     fill in when mmx is empty or missing. */
  const settled = await Promise.allSettled([
    mmxP, minimaxP, bingP,
  ]);
  /* P_engine-result-guard — each engine promise is wrapped in
     `withTimeout` which resolves to [] on timeout. The fulfilled
     branch here covers all the happy paths. We still type-guard
     against non-array returns because a buggy / future-version
     engine could throw inside its own .map() and let `undefined`
     leak through — losing an array would crash the merge step
     below with TypeError, but more importantly silently dropping
     the priority engine's results. */
  const pickOutcome = (name, settledResult) => {
    if (settledResult.status !== 'fulfilled' || !Array.isArray(settledResult.value)) {
      return { name, results: [], status: 'error' };
    }
    const results = settledResult.value;
    return { name, results, status: results._engineStatus || 'ok' };
  };
  const outcomes = [
    pickOutcome('mmx', settled[0]),
    pickOutcome('minimax', settled[1]),
    pickOutcome('bing', settled[2]),
  ];
  const mmxResults = outcomes[0].results;
  const minimaxResults = outcomes[1].results;
  const bingResults = outcomes[2].results;

  let finalResults = [];
  const seen = new Set();
  const push = (r) => {
    if (r && r.url && !seen.has(r.url)) {
      seen.add(r.url);
      finalResults.push(r);
      return true;
    }
    return false;
  };

  // mmx first
  for (const r of mmxResults) { if (push(r)) { if (finalResults.length >= limit) break; } }
  // then direct MiniMax
  for (const r of minimaxResults) { if (finalResults.length >= limit) break; if (push(r)) {} }
  // then Bing to fill
  for (const r of bingResults) { if (finalResults.length >= limit) break; if (push(r)) {} }

  if (finalResults.length === 0) {
    const searxngResults = await withTimeout(
      searchSearxng(query, limit, acSignal),
      TIMEOUT_SEARXNG_MS,
      'searxng',
    ).catch(() => unavailableResults('error'));
    outcomes.push({
      name: 'searxng',
      results: Array.isArray(searxngResults) ? searxngResults : [],
      status: Array.isArray(searxngResults) ? (searxngResults._engineStatus || 'ok') : 'error',
    });
    if (Array.isArray(searxngResults) && searxngResults.length > 0) {
      finalResults = searxngResults;
    }
  }

  clearTimeout(totalTimer);

  // An empty list is a valid outcome only when at least one configured
  // provider completed normally.  Previously every engine failure was
  // flattened to [] and the chat UI incorrectly claimed that no sources
  // existed.  Keep diagnostics non-enumerable so the public array contract
  // remains unchanged for existing callers and caches.
  const available = outcomes.some((outcome) => outcome.status === 'ok');
  if (!finalResults.length && !available) {
    throw new WebSearchUnavailableError(outcomes.map(({ name, status }) => ({ name, status })));
  }

  for (const r of finalResults) {
    r.matchedQuery = query;
    r.matchedQueries = [query];
  }

  try {
    Object.defineProperty(finalResults, 'expandedQueries', {
      value: [query],
      enumerable: false,
      configurable: true,
      writable: false,
    });
    Object.defineProperty(finalResults, 'language', {
      value: langCluster,
      enumerable: false,
      configurable: true,
      writable: false,
    });
    Object.defineProperty(finalResults, 'diagnostics', {
      value: outcomes.map(({ name, status }) => ({ name, status })),
      enumerable: false,
      configurable: true,
      writable: false,
    });
  } catch { /* metadata is best-effort */ }

  try {
    searchResultCache.set({
      userId: opts.userId, query, count: limit, locale, apiKeyHint,
      result: finalResults,
    });
  } catch { /* cache is best-effort */ }

  return finalResults;
}

/* ═══════════════════════════════════════════════════════════════════
   Image search (unchanged — Bing Images only)
   ═══════════════════════════════════════════════════════════════════ */

const BING_HOST_INTL   = process.env.WEB_SEARCH_HOST || 'www.bing.com';
const REQUEST_TIMEOUT  = 12_000;
const MAX_NEWS_RESULTS = 15;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; }
    });
}

function parseBingImageHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();
  const cardRe = /<a[^>]*class="[^"]*iusc[^"]*"[^>]*>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const card = m[0];
    const madMatch = card.match(/mad\s*=\s*"([^"]+)"/) || card.match(/m\s*=\s*"([^"]+)"/);
    if (!madMatch) continue;
    try {
      const data = JSON.parse(decodeURIComponent(madMatch[1]));
      const imgUrl = data.imgurl || data.turl || '';
      const thumbUrl = data.thumburl || data.turl || '';
      const sourceUrl = data.purl || data.curl || '';
      const title = data.t || '';
      if (!imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);
      results.push({ title, url: imgUrl, thumbnailUrl: thumbUrl, sourceUrl });
      if (results.length >= MAX_NEWS_RESULTS) break;
    } catch (_) {}
  }
  if (!results.length) {
    const imgRe = /<img[^>]*src="(https?:\/\/[^"]+)"[^>]*alt="([^"]*)"[^>]*data-src="(https?:\/\/[^"]+)"/g;
    let im;
    while ((im = imgRe.exec(html)) !== null) {
      const thumbUrl = im[1];
      const imgUrl = im[3] || im[1];
      const title = decodeEntities(im[2].trim());
      if (!imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);
      results.push({ title, url: imgUrl, thumbnailUrl: thumbUrl, sourceUrl: '' });
      if (results.length >= MAX_NEWS_RESULTS) break;
    }
  }
  return results;
}

export async function imageSearch(query, count = 8) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_NEWS_RESULTS, parseInt(count, 10) || 8));
  const url = `https://${BING_HOST_INTL}/images/search?q=${encodeURIComponent(query)}&count=${limit + 4}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'GET', signal: controller.signal,
      headers: { 'User-Agent': randomUA(), 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const html = await r.text();
    const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
    const results = parseBingImageHtml(capped);
    return results.slice(0, limit);
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}
