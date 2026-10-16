import {BadRequest} from '../lib/errors.js';
import {
  detectLanguageCluster,
  scoreAuthority,
  scoreCrossSource,
  scoreDateFromUrlPath,
  scoreFreshness,
  scoreKeywordSignals,
  scoreLanguageMatch,
  scoreSpamPenalty,
  tokenBigrams,
  tokenizeQuery,
} from './scoring.js';
import * as searchResultCache from '../lib/searchResultCache.js';
import {expandQuery} from './queryExpander.js';
import {searchMinimax} from './searchEngines/minimax.js';
import {searchMmx} from './searchEngines/mmx.js';
import {searchFirecrawl} from './searchEngines/firecrawl.js';
import {searchSearxng} from './searchEngines/searxng.js';
import {searchBing} from './searchEngines/bing.js';

/**
 * Aggregate result shape produced by merging the per-engine search
 * results. Each leaf engine (bing/firecrawl/minimax/mmx/searxng)
 * returns a structurally-compatible object with a narrower `source`
 * literal; this widens `source` to `string` and adds the optional
 * `matchedQuery`/`matchedQueries` fields attached during the merge.
 */
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  authority: string;
  source: string;
  matchedQuery?: string;
  matchedQueries?: string[];
}

export class WebSearchUnavailableError extends Error {
  code: string;
  retryable: boolean;
  diagnostics: unknown;
  constructor(diagnostics: unknown) {
    super('web_search_unavailable');
    this.name = 'WebSearchUnavailableError';
    this.code = 'web_search_unavailable';
    this.retryable = true;
    this.diagnostics = diagnostics;
  }
}

/**
 * Web search backend — parallel fan-out across mmx (MiniMax CLI),
 * firecrawl-cli, MiniMax HTTP, Bing, with searXNG fallback.
 *
 * Pipeline:
 *   0. CHECK CACHE — if (userId, query, count, locale, apiKeyHint) match
 *      a recent result, return it directly.
 *   1. Detect query language cluster (cjk | cyrillic | latin | other).
 *   2. Expand the user's query into 1–3 variants via the LLM (cached).
 *   3. Run ALL engines in parallel, merge by URL, and rerank by estimated
 *      relevance (see rankSearchResults). Engine priority
 *      (mmx → firecrawl → MiniMax HTTP → Bing) only breaks ties.
 *   4. If all four return nothing, fall back to searXNG (self-hosted
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

/* ─── Tool definition (sent to upstream on every chat turn) ───
 *
 * P_tool-contract — the description is a structured contract. Hard
 * rules: query must be 1-6 words, results are numbered for reference,
 * and the answer can attach structured claim citations to registered sources.
 * Cache key includes the query string, so identical queries within
 * 5 minutes return identical results without re-running engines.
 */
export const WEB_SEARCH_CITATION_GUIDANCE = 'Write factual claims in natural prose, then call cite_sources with exact quotes and the Source IDs returned by the tools. Do not invent source IDs or write numerical reference markers. The UI renders inline citations and a Sources list. If a result has no Source ID, use a Markdown link to its URL.';

export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      '## What this tool does\n' +
      'Searches the web in parallel across multiple engines (mmx, firecrawl, MiniMax HTTP, Bing) with a searxng metasearch fallback. Returns up to 12 results with title, URL, snippet, and (when available) date and source engine.\n\n' +
      '## When to call\n' +
      '- Factual questions about the present-day world: current events, prices, leaders, policies, products, recent news.\n' +
      '- Time-sensitive questions where training data may be stale.\n' +
      '- Verification of specific binary facts ("did X happen?", "who currently holds role Y?").\n' +
      '- Looking up a specific person, company, paper, or product by name.\n\n' +
      '## When NOT to call\n' +
      '- Conceptual questions, definitions, code review, anything you can answer from training.\n' +
      '- Math, arithmetic, unit conversion — use code_interpreter.\n' +
      '- Questions whose answer you already have from a previous tool call in this turn.\n' +
      '- Queries that match the system-injected [Referenced page] block — that content is already in your context.\n\n' +
      '## Query construction\n' +
      '- Keep queries 1-6 words, specific, free of conversational filler.\n' +
      '- The system expands the query into 1-3 variants internally; long natural-language questions are usually rewritten poorly.\n' +
      '- For recent events, include the year or "[current year]" if relevant (engine ranking favours fresh content).\n' +
      '- Use exact names for people / products / companies. Avoid pronouns, articles, and question marks.\n' +
      '- Bad:  "what is the latest version of python and when was it released"\n' +
      '- Good: "Python latest version release date"\n\n' +
      '## Output format\n' +
      'Results are numbered [1], [2], … and sorted by an estimated relevance score (query-term match, agreement across engines, source authority, freshness). The order is a heuristic, not ground truth — judge each result by its title, URL, and snippet before deciding what to open with web_fetch. ' + WEB_SEARCH_CITATION_GUIDANCE + '\n\n' +
      '## Caching\n' +
      'Identical queries within the same session are cached for 5 minutes. Re-running the same query does NOT re-hit the engines and will not surface fresher results — wait 5 minutes or change the query wording if you need a refresh.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (1-6 words, specific and concise). Bad: "what is the latest version of python and when was it released". Good: "Python latest version release date".',
          minLength: 1,
          maxLength: 200,
        },
        count: {
          type: 'number',
          default: 8,
          minimum: 1,
          maximum: 12,
          description: 'How many results to return. 8 is a good default; use 3-5 for a quick check, 10-12 for a thorough sweep.',
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
   Web search — parallel fan-out across mmx, firecrawl, MiniMax, Bing, searXNG
   ═══════════════════════════════════════════════════════════════════ */

const TIMEOUT_MINIMAX_MS   = 8_000;
const TIMEOUT_FIRECRAWL_MS = 10_000;
const TIMEOUT_BING_MS      = 8_000;
const TIMEOUT_SEARXNG_MS   = 6_000;

const TOTAL_SEARCH_TIMEOUT = 12_000;

function unavailableResults(reason: string): SearchResult[] {
  const result: SearchResult[] = [];
  Object.defineProperty(result, '_engineStatus', { value: reason, enumerable: false });
  return result;
}

function withTimeout(
  promise: Promise<SearchResult[]>,
  ms: number,
  label: string,
  abort?: (reason: string) => void,
): Promise<SearchResult[]> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<SearchResult[]>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[webSearch] ${label} hit ${ms}ms timeout`);
        /* Promise.race alone only returns early; the old code left the
         * outbound fetch/CLI subprocess running. Abort its shared controller
         * so a timed-out search does not keep consuming sockets or CPU. */
        abort?.(`${label}_timeout`);
        resolve(unavailableResults('timeout'));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function webSearch(query: string, count: string | number = 10, opts: { userId?: string; locale?: string; apiKeyHint?: string } = {}) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_RESULTS, parseInt(count as string, 10) || 10));
  const locale = opts.locale || null;
  const langCluster = detectLanguageCluster(query);

  // 0. Cross-request result cache (per user × query × count × locale × apiKeyHint)
  const apiKeyHint = opts.apiKeyHint || 'no-key';
  const cacheInput = { userId: opts.userId, query, count: limit, locale, apiKeyHint };
  const cacheHit = searchResultCache.get(cacheInput);
  if (cacheHit) {
    return cacheHit;
  }

  return searchResultCache.getOrCreateInFlight(
    searchResultCache.keyFor(cacheInput),
    () => runWebSearch(query, limit, locale, apiKeyHint, opts.userId, langCluster),
  );
}

async function runWebSearch(
  query: string,
  limit: number,
  locale: string | null,
  apiKeyHint: string,
  userId: string | undefined,
  langCluster: ReturnType<typeof detectLanguageCluster>,
): Promise<SearchResult[]> {

  const ac = new AbortController();
  const totalTimer = setTimeout(() => ac.abort('total_timeout'), TOTAL_SEARCH_TIMEOUT);

  const hasMinimaxKey = !!(process.env.MINIMAX_SEARCH_KEY || process.env.BEAGLE_SYSTEM_KEY);
  const acSignal = ac.signal;

  /* P_query-expansion — expand the user's query into variants via LLM
     in the background CONCURRENTLY with the primary query search.
     The primary search on the exact query begins immediately at t=0! */
  const variantsPromise = expandQuery(query, {
    userId: userId ?? null,
    signal: acSignal,
    variantCount: 2,
  }).catch(() => [query]);

  /* P_multi-variant-fan-out — search the primary query immediately across
     engines, then merge any resolved query variants concurrently without
     blocking the initial search on the LLM expansion roundtrip. */
  const searchVariants = (
    searchFn: (q: string, limit: number, signal: AbortSignal | null) => Promise<SearchResult[]>,
    label: string,
    timeoutMs: number,
  ): Promise<SearchResult[]> => {
    const engineController = new AbortController();
    const engineSignal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any([acSignal, engineController.signal])
      : (acSignal.aborted ? acSignal : engineController.signal);

    const primaryP = searchFn(query, limit, engineSignal).then((results) => {
      return Array.isArray(results) ? results : [];
    });

    const secondaryP = variantsPromise.then(async (vars) => {
      const extra = vars.filter((v) => v !== query);
      if (!extra.length) return [];
      const perVariantLimit = Math.max(1, Math.ceil(limit / vars.length));
      const subArrays = await Promise.all(
        extra.map((v) => searchFn(v, perVariantLimit, engineSignal).then((r) => (Array.isArray(r) ? r : []))),
      );
      return subArrays.flat();
    }).catch(() => []);

    return withTimeout(
      Promise.all([primaryP, secondaryP]).then(([primaryRes, secondaryRes]) => {
        const arrays = [primaryRes, secondaryRes];
        const seen = new Set<string>();
        let worstStatus = 'ok';
        for (const arr of arrays) {
          const s = (arr as SearchResult[] & { _engineStatus?: string })._engineStatus;
          if (s && s !== 'ok') worstStatus = s;
        }
        const merged = arrays.flat().filter((r): r is SearchResult => {
          if (!r || !r.url) return false;
          if (seen.has(r.url)) return false;
          seen.add(r.url);
          return true;
        });
        // If all variants failed and no results came through, propagate
        // the failure status so the pipeline's empty-result logic works.
        if (!merged.length && worstStatus !== 'ok') {
          const result: SearchResult[] = [];
          Object.defineProperty(result, '_engineStatus', { value: worstStatus, enumerable: false });
          return result;
        }
        return merged;
      }),
      timeoutMs,
      label,
      (reason) => { if (!engineController.signal.aborted) engineController.abort(reason); },
    );
  };

  const mmxP = searchVariants(searchMmx, 'mmx-cli', TIMEOUT_MINIMAX_MS);
  const firecrawlP = searchVariants(searchFirecrawl, 'firecrawl', TIMEOUT_FIRECRAWL_MS);
  const minimaxP: Promise<SearchResult[]> = hasMinimaxKey
    ? searchVariants(searchMinimax, 'minimax', TIMEOUT_MINIMAX_MS)
    : Promise.resolve([]);
  const bingP = searchVariants(searchBing, 'bing', TIMEOUT_BING_MS);

  /* P_engine-priority — wait for ALL engines in parallel.  Merge
     priority: mmx (MiniMax CLI) first, then firecrawl (free credits),
     then minimax (direct HTTP), then bing.  The first two are CLI
     spawns (~100-300 ms overhead) but are prioritised because they
     are the project's preferred providers. */
  const settled = await Promise.allSettled([
    mmxP, firecrawlP, minimaxP, bingP,
  ]);
  /* P_engine-result-guard — each engine promise is wrapped in
     `withTimeout` which resolves to [] on timeout. The fulfilled
     branch here covers all the happy paths. We still type-guard
     against non-array returns because a buggy / future-version
     engine could throw inside its own .map() and let `undefined`
     leak through — losing an array would crash the merge step
     below with TypeError, but more importantly silently dropping
     the priority engine's results. */
  const pickOutcome = (name: string, settledResult: PromiseSettledResult<SearchResult[]>) => {
    if (settledResult.status !== 'fulfilled' || !Array.isArray(settledResult.value)) {
      return { name, results: [] as SearchResult[], status: 'error' };
    }
    const results = settledResult.value;
    return { name, results, status: (results as SearchResult[] & { _engineStatus?: string })._engineStatus || 'ok' };
  };
  const outcomes = [
    pickOutcome('mmx', settled[0]),
    pickOutcome('firecrawl', settled[1]),
    pickOutcome('minimax', settled[2]),
    pickOutcome('bing', settled[3]),
  ];
  let finalResults = rankSearchResults(outcomes.map((o) => o.results), query, langCluster, limit);

  if (finalResults.length === 0) {
    const fallbackController = new AbortController();
    const fallbackSignal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any([acSignal, fallbackController.signal])
      : (acSignal.aborted ? acSignal : fallbackController.signal);
    const searxngResults = await withTimeout(
      searchSearxng(query, limit, fallbackSignal),
      TIMEOUT_SEARXNG_MS,
      'searxng',
      (reason) => { if (!fallbackController.signal.aborted) fallbackController.abort(reason); },
    ).catch(() => unavailableResults('error'));
    outcomes.push({
      name: 'searxng',
      results: Array.isArray(searxngResults) ? searxngResults : [],
      status: Array.isArray(searxngResults) ? ((searxngResults as SearchResult[] & { _engineStatus?: string })._engineStatus || 'ok') : 'error',
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

  const variants = await variantsPromise;
  for (const r of finalResults) {
    r.matchedQuery = query;
    r.matchedQueries = variants;
  }

  try {
    Object.defineProperty(finalResults, 'expandedQueries', {
      value: variants,
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
      userId, query, count: limit, locale, apiKeyHint,
      result: finalResults,
    });
  } catch { /* cache is best-effort */ }

  return finalResults;
}

/**
 * Merge per-engine result lists (in engine-priority order) by URL and
 * sort by an estimated relevance score. A URL returned by several engines
 * is kept once, with its cross-engine agreement and per-engine ranks
 * feeding the score. Array.prototype.sort is stable, so equal scores keep
 * engine-priority order.
 */
export function rankSearchResults(
  engineResults: SearchResult[][],
  query: string,
  langCluster: string,
  limit: number,
): SearchResult[] {
  type Candidate = { result: SearchResult; sourceCount: number; _engineRanks: number[] };
  const byUrl = new Map<string, Candidate>();
  for (const results of engineResults) {
    const seenInEngine = new Set<string>();
    results.forEach((r, rank) => {
      if (!r || !r.url || seenInEngine.has(r.url)) return;
      seenInEngine.add(r.url);
      const existing = byUrl.get(r.url);
      if (existing) {
        existing.sourceCount++;
        existing._engineRanks.push(rank);
        if (!existing.result.date && r.date) existing.result.date = r.date;
        if ((r.snippet || '').length > (existing.result.snippet || '').length) existing.result.snippet = r.snippet;
      } else {
        byUrl.set(r.url, { result: { ...r }, sourceCount: 1, _engineRanks: [rank] });
      }
    });
  }
  const words = tokenizeQuery(query);
  const bigrams = tokenBigrams(words);
  const scored = [...byUrl.values()].map((c) => {
    const { title, snippet, url, date, authority } = c.result;
    const score = scoreKeywordSignals(title, snippet, words, bigrams)
      + scoreAuthority(authority)
      + scoreFreshness(date || scoreDateFromUrlPath(url))
      + scoreCrossSource(c)
      + scoreLanguageMatch(langCluster, `${title || ''} ${snippet || ''}`)
      - scoreSpamPenalty(url, title);
    return { result: c.result, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.result);
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

interface ImageResult {
  title: string;
  url: string;
  thumbnailUrl: string;
  sourceUrl: string;
}

function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_: string, h: string) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; }
    })
    .replace(/&#(\d+);/g, (_: string, d: string) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; }
    });
}

function parseBingImageHtml(html: string): ImageResult[] {
  if (!html) return [];
  const results: ImageResult[] = [];
  const seen = new Set();
  const cardRe = /<a[^>]*class="[^"]*iusc[^"]*"[^>]*>/g;
  let m: RegExpExecArray | null;
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
    let im: RegExpExecArray | null;
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

export async function imageSearch(query: string, count: string | number = 8) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_NEWS_RESULTS, parseInt(count as string, 10) || 8));
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
