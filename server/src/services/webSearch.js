import { BadRequest } from '../lib/errors.js';

/**
 * Web search backend.
 *
 * The legacy /api/search route is a local content search (sessions +
 * messages in the user's own database). That's perfect for Cmd-K's
 * local-recents lookup, but the front-end web research feature
 * (fetchWebContext in the SPA) needs *real* web results, not local
 * ones. This module is a separate, additive endpoint that does
 * a live web search and returns the shape fetchWebContext already
 * expects: { results: [{ title, url, snippet, matchedQuery }] }.
 *
 * Backend choice: Bing HTML scraping (cn.bing.com / www.bing.com).
 * Pros: no API key, no signup, no rate-limit dashboard to babysit.
 * Cons: HTML is brittle — selectors may need updating if Bing
 * changes its markup. We isolate that risk to this single file and
 * fall back to an empty result set on any parse error so the rest
 * of the prompt-builder pipeline degrades gracefully.
 *
 * If a real search API is later wired up (Tavily / Brave / SerpAPI),
 * only this file needs to change — the contract with the client
 * stays the same.
 */

const BING_HOST = process.env.WEB_SEARCH_HOST || 'cn.bing.com';
const BING_PATH = '/search';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 10;
const MAX_SNIPPET_LEN = 320;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Decode HTML entities the most common cases (Bing emits these
 * in titles, URLs, and snippets). Not a full implementation — only
 * the entities we see in the wild.
 */
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; }
    });
}

/**
 * Parse a Bing HTML response into a flat result list. We tolerate
 * ads, related-search blocks, "people also ask" — they're skipped
 * because they don't match the organic-result pattern. If the
 * markup shifts and zero results come back, the caller can decide
 * to surface a soft "no results" error to the user.
 */
function parseBingHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();

  // Organic results: <li class="b_algo"> ... <h2><a href="URL">TITLE</a></h2> ...
  // The b_algo list item wraps a heading + a snippet. We use a
  // global, non-greedy match and walk each block.
  const blockRe = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    // Title + URL: <h2><a href="URL" ...>TITLE</a></h2>
    const titleMatch = block.match(
      /<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i
    );
    if (!titleMatch) continue;
    let url = decodeEntities(titleMatch[1]);
    let title = decodeEntities(titleMatch[2].replace(/<[^>]+>/g, '').trim());
    if (!title || !url) continue;
    // Bing sometimes wraps the URL in a /link?url= redirect — unwrap.
    try {
      const u = new URL(url);
      const redir = u.searchParams.get('url') || u.searchParams.get('u');
      if (redir && /^https?:\/\//i.test(redir)) url = redir;
    } catch (_) { /* keep raw url */ }

    // Snippet: <p class="b_lineclamp..."> ... </p>  (multiple variants)
    let snippet = '';
    const snipMatch = block.match(/<p[^>]*class="b_(?:lineclamp|caption|paragraph)[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (snipMatch) {
      snippet = decodeEntities(snipMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      // Bing often leads with "May 13, 2026 · " or "5 days ago · " — keep it
      // readable as a normal separator.
      snippet = snippet.replace(/\s*[·•]+\s*/g, ' · ');
    }
    if (snippet.length > MAX_SNIPPET_LEN) snippet = snippet.slice(0, MAX_SNIPPET_LEN) + '…';

    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

/**
 * Run a single web search and return the top organic results.
 * Empty array (not throw) on any failure — the caller treats an
 * empty list as a soft "no results" so the prompt-builder can
 * still ship with the previous searchContext cached.
 */
export async function webSearch(query, count = 8) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_RESULTS, parseInt(count, 10) || 8));
  const url = `https://${BING_HOST}${BING_PATH}?q=${encodeURIComponent(query)}&count=${limit + 2}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return [];
    const html = await r.text();
    // Cap parse input to 500 KB to avoid pathological pages.
    const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
    const results = parseBingHtml(capped);
    return results.slice(0, limit);
  } catch (e) {
    clearTimeout(timer);
    // Network / abort / parse failure — surface as empty results
    // so the upstream can degrade gracefully.
    return [];
  }
}
