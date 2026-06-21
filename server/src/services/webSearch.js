import { BadRequest } from '../lib/errors.js';

/**
 * Web search backend — multi-source, high-precision search.
 *
 * Strategy: run Bing + Google (scraped HTML) in PARALLEL for every query,
 * merge results with deduplication, and return the best unified set.
 * Two parallel sources dramatically improves both coverage and resilience:
 * if Bing's HTML changes, Google still works and vice versa.
 *
 * Fallback chain per source: primary selector → secondary selector →
 * regex-based extraction → graceful empty.
 *
 * Future: Brave Search API (free tier, ~2k queries/month) or SerpAPI
 * can be added as a third parallel source with minimal changes.
 */

/* ─── Configuration ─── */

const BING_HOST        = process.env.WEB_SEARCH_HOST || 'cn.bing.com';
const REQUEST_TIMEOUT  = 12_000;       // per-source timeout
const MAX_RESULTS      = 15;           // per source (merged later)
const MAX_RESULTS_MERGED = 12;         // final merged count
const MAX_SNIPPET_LEN  = 500;          // longer snippets = better relevance signals
const MAX_FETCH_DOCS   = 6;            // URLs sent to fetch-batch (down from 8, more selective)

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

/* ═══════════════════════════════════════════════════════════════════
   Shared utilities
   ═══════════════════════════════════════════════════════════════════ */

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

/** Strip HTML tags but keep line-break-like spacing. */
function stripHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
}

/**
 * Extract an approximate publish date from a snippet string.
 * Returns ISO date string or null.
 */
function extractDate(snippet) {
  if (!snippet) return null;
  // Patterns: "May 13, 2026", "5 days ago", "2024-01-15", "2024年1月15日"
  const dateRe = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/;
  let m = snippet.match(dateRe);
  if (m) return m[1];

  const longDateRe = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i;
  m = snippet.match(longDateRe);
  if (m) {
    const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const mon = months[m[1].slice(0,3).toLowerCase()] || '01';
    return `${m[3]}-${mon}-${String(m[2]).padStart(2, '0')}`;
  }

  // Chinese: 2024年1月15日
  const zhRe = /(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5/;
  m = snippet.match(zhRe);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;

  // Relative: "X days/weeks/months ago"
  const relRe = /(\d+)\s*(days?|weeks?|months?|hours?|minutes?)\s*ago/i;
  m = snippet.match(relRe);
  if (m) {
    const now = Date.now();
    const num = parseInt(m[1]);
    const unit = m[2].toLowerCase();
    const ms = unit.startsWith('day') ? num * 86400000
              : unit.startsWith('week') ? num * 604800000
              : unit.startsWith('month') ? num * 2592000000
              : unit.startsWith('hour') ? num * 3600000
              : unit.startsWith('minute') ? num * 60000
              : 0;
    return new Date(now - ms).toISOString().split('T')[0];
  }
  return null;
}

/** Categorize domain authority. */
function domainAuthority(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('.gov')) return 'gov';
    if (host.endsWith('.edu')) return 'edu';
    if (host.endsWith('.org')) return 'org';
    if (host.endsWith('.mil')) return 'mil';
    // Recognized high-authority domains
    const high = ['wikipedia.org', 'reuters.com', 'ap.org', 'bbc.com', 'bbc.co.uk',
      'nature.com', 'sciencedirect.com', 'ieee.org', 'acm.org', 'springer.com',
      'arxiv.org', 'who.int', 'nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'coursera.org',
      'github.com', 'stackoverflow.com', 'mdn.mozilla.org', 'developer.mozilla.org',
      'docs.python.org', 'nodejs.org', 'npmjs.com', 'react.dev', 'nextjs.org',
      'typescriptlang.org', 'stackexchange.com', 'medium.com', 'dev.to'];
    for (const d of high) {
      if (host === d || host.endsWith('.' + d)) return 'high';
    }
    return 'normal';
  } catch { return 'normal'; }
}

/* ═══════════════════════════════════════════════════════════════════
   Source 1: Bing (HTML scraping)
   ═══════════════════════════════════════════════════════════════════ */

function parseBingHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();

  // Primary: <li class="b_algo"> (classic Bing)
  const blockRe = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if (!titleMatch) continue;
    let url = decodeEntities(titleMatch[1]);
    let title = decodeEntities(titleMatch[2].replace(/<[^>]+>/g, '').trim());
    if (!title || !url) continue;
    try {
      const u = new URL(url);
      const redir = u.searchParams.get('url') || u.searchParams.get('u');
      if (redir && /^https?:\/\//i.test(redir)) url = redir;
    } catch (_) {}

    let snippet = '';
    const snipMatch = block.match(/<p[^>]*class="b_(?:lineclamp|caption|paragraph)[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (snipMatch) {
      snippet = decodeEntities(stripHtml(snipMatch[1]).replace(/\s+/g, ' ').trim());
      snippet = snippet.replace(/\s*[·•]+\s*/g, ' · ');
    }

    const date = extractDate(snippet);
    const authority = domainAuthority(url);

    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet, date, authority, source: 'bing' });
    if (results.length >= MAX_RESULTS) break;
  }

  // If primary found nothing, try newer Bing layout: <article> cards
  if (!results.length) {
    const artRe = /<article[^>]*>([\s\S]*?)<\/article>/g;
    while ((m = artRe.exec(html)) !== null) {
      const block = m[1];
      const aMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!aMatch) continue;
      let url = decodeEntities(aMatch[1]);
      let title = decodeEntities(stripHtml(aMatch[2]).trim());
      if (!title || !url) continue;

      let snippet = '';
      const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (pMatch) snippet = decodeEntities(stripHtml(pMatch[1]).replace(/\s+/g, ' ').trim());

      const date = extractDate(snippet || title);
      const authority = domainAuthority(url);
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, snippet, date, authority, source: 'bing' });
      if (results.length >= MAX_RESULTS) break;
    }
  }

  return results;
}

async function searchBing(query, limit) {
  const url = `https://${BING_HOST}/search?q=${encodeURIComponent(query)}&count=${limit + 4}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return [];
    const html = await r.text();
    const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
    return parseBingHtml(capped).slice(0, limit);
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Source 2: Google (HTML scraping)
   ═══════════════════════════════════════════════════════════════════ */

function parseGoogleHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();

  // Primary: <div class="g"> ... <a href="URL"><h3>TITLE</h3></a> ... <div class="VwiC3b">snippet</div>
  const blockRe = /<div[^>]*class="g"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];

    // URL + Title: <a href="URL" ...><h3> or <a href="URL" ...>[any heading]
    const aMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(?:<h3[^>]*>([\s\S]*?)<\/h3>|<h2[^>]*>([\s\S]*?)<\/h2>)/i);
    if (!aMatch) continue;
    let url = decodeEntities(aMatch[1]);
    const titleRaw = aMatch[2] || aMatch[3] || '';
    let title = decodeEntities(stripHtml(titleRaw).trim());
    if (!title || !url) continue;
    // Strip Google tracking redirects
    try {
      const u = new URL(url);
      if (u.pathname === '/url' && u.searchParams.get('q')) {
        url = u.searchParams.get('q');
      }
    } catch (_) {}

    // Snippet: <div class="VwiC3b"> or <span class="st"> or <div data-sncf>
    let snippet = '';
    const snippets = [
      block.match(/<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
      block.match(/<span[^>]*class="[^"]*st[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      block.match(/<div[^>]*data-sncf[^>]*>([\s\S]*?)<\/div>/i),
    ];
    for (const sm of snippets) {
      if (sm) { snippet = decodeEntities(stripHtml(sm[1]).replace(/\s+/g, ' ').trim()); break; }
    }

    const date = extractDate(snippet || title);
    const authority = domainAuthority(url);
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet, date, authority, source: 'google' });
    if (results.length >= MAX_RESULTS) break;
  }

  // Secondary: newer Google layout with <div class="MjjYud">
  if (!results.length) {
    const blockRe2 = /<div[^>]*class="[^"]*MjjYud[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    while ((m = blockRe2.exec(html)) !== null) {
      const block = m[1];
      const aMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(?:<h3[^>]*>([\s\S]*?)<\/h3>|<h2[^>]*>([\s\S]*?)<\/h2>)/i);
      if (!aMatch) continue;
      let url = decodeEntities(aMatch[1]);
      const title = decodeEntities(stripHtml(aMatch[2] || aMatch[3] || '').trim());
      if (!title || !url) continue;
      try {
        const u = new URL(url);
        if (u.pathname === '/url' && u.searchParams.get('q')) url = u.searchParams.get('q');
      } catch (_) {}

      let snippet = '';
      const snipMatch = block.match(/<div[^>]*class="[^"]*[Ss]crape[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || block.match(/<div[^>]*data-content[^>]*>([\s\S]*?)<\/div>/i);
      if (snipMatch) snippet = decodeEntities(stripHtml(snipMatch[1]).replace(/\s+/g, ' ').trim());

      const date = extractDate(snippet || title);
      const authority = domainAuthority(url);
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, snippet, date, authority, source: 'google' });
      if (results.length >= MAX_RESULTS) break;
    }
  }

  return results;
}

async function searchGoogle(query, limit) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit + 4}&hl=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return [];
    const html = await r.text();
    const capped = html.length > 800_000 ? html.slice(0, 800_000) : html;
    return parseGoogleHtml(capped).slice(0, limit);
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Source 3: 百度 (Baidu) — China's largest search engine, fully
   accessible from mainland China. HTML scraping with fallback
   selectors for Baidu's two main result layouts.
   ═══════════════════════════════════════════════════════════════════ */

function parseBaiduHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();

  // Baidu result containers use class "result c-container" or "c-container"
  const blockRe = /<div[^>]*class="[^"]*(?:result\s+)?c-container[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*c-container/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];

    // Title + URL: <h3 class="t"> or <h3> with <a href="URL">
    const aMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i);
    if (!aMatch) continue;
    let url = decodeEntities(aMatch[1]);
    let title = decodeEntities(stripHtml(aMatch[2]).trim());
    if (!title || !url) continue;

    // Skip Baidu internal pages
    if (url.includes('baidu.com') && !url.includes('www.baidu.com/link')) continue;

    // Snippet: various Baidu classes
    let snippet = '';
    const snipMatch = block.match(/<span[^>]*class="[^"]*content-right[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      || block.match(/<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || block.match(/<div[^>]*class="[^"]*c-span-last[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (snipMatch) {
      snippet = decodeEntities(stripHtml(snipMatch[1]).replace(/\s+/g, ' ').trim());
    }

    const date = extractDate(snippet || title);
    const authority = domainAuthority(url);
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet, date, authority, source: 'baidu' });
    if (results.length >= MAX_RESULTS) break;
  }

  // Secondary layout: newer Baidu with different class structure
  if (!results.length) {
    const blockRe2 = /<div[^>]*class="[^"]*result-op[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    while ((m = blockRe2.exec(html)) !== null) {
      const block = m[1];
      const aMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(?:<[^>]+>\s*)?([\s\S]*?)(?:\s*<\/[^>]+>)?<\/a>/i);
      if (!aMatch) continue;
      let url = decodeEntities(aMatch[1]);
      let title = decodeEntities(stripHtml(aMatch[2]).trim());
      if (!title || !url) continue;
      if (url.includes('baidu.com')) continue;

      let snippet = '';
      const snipMatch = block.match(/<div[^>]*class="[^"]*c-line-clamp[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (snipMatch) snippet = decodeEntities(stripHtml(snipMatch[1]).replace(/\s+/g, ' ').trim());

      const date = extractDate(snippet || title);
      const authority = domainAuthority(url);
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, snippet, date, authority, source: 'baidu' });
      if (results.length >= MAX_RESULTS) break;
    }
  }

  return results;
}

/* ─── Baidu cookie store ───
 * Baidu requires cookies (specifically BAIDUID) for search. We cache
 * the cookies from the first successful request and reuse them. */
let _baiduCookieJar = '';

async function searchBaidu(query, limit) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&ie=utf-8`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const headers = {
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.baidu.com/',
    };
    if (_baiduCookieJar) headers['Cookie'] = _baiduCookieJar;
    const r = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];

    // Save Set-Cookie headers for subsequent requests
    const setCookie = r.headers.get('set-cookie');
    if (setCookie) {
      const parsed = setCookie.split(',').map(s => s.split(';')[0].trim()).filter(Boolean).join('; ');
      if (parsed) _baiduCookieJar = parsed;
    }

    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('text/html')) return [];
    const html = await r.text();

    // Detect captcha / verification page — Baidu returns a page that
    // contains "百度安全验证" or a captcha iframe when it suspects automation.
    if (/百度安全验证|baidu.*captcha|captcha.*baidu|请输入验证码/i.test(html)) {
      console.error('[searchBaidu] Blocked by Baidu captcha/verification for query:', query.slice(0, 40));
      return [];
    }

    const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
    let results = parseBaiduHtml(capped);
    // Fallback: if the primary parser found nothing, try a generic
    // URL + title extraction from <a> tags in the content area
    if (!results.length) {
      results = parseBaiduHtmlFallback(capped);
    }
    return results.slice(0, limit);
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}

/** Fallback Baidu HTML parser — extracts any <a> with a visible href
 *  inside the main content region. Catches structural changes. */
function parseBaiduHtmlFallback(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();
  const region = extractBaiduRegion(html);
  if (!region) return [];
  const aRe = /<a[^>]*href="(https?:\/\/(?:www\.)?(?!baidu\.com)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(region)) !== null) {
    const url = decodeEntities(m[1]);
    if (!url || url.includes('baidu.com') || seen.has(url)) continue;
    seen.add(url);
    const title = decodeEntities(stripHtml(m[2]).replace(/\s+/g, ' ').trim());
    if (!title) continue;
    const snippet = '';
    const date = extractDate(title);
    const authority = domainAuthority(url);
    results.push({ title, url, snippet, date, authority, source: 'baidu' });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

/** Find the main result region in a Baidu search page. Tries several
 *  known container IDs in order; falls back to the full body. */
function extractBaiduRegion(html) {
  const ids = ['content_left', 'content_right', 'results', 'wrapper_wrapper', 'container'];
  for (const id of ids) {
    const re = new RegExp(`<div[^>]*id=["']${id}["'][^>]*>([\\s\\S]*)`, 'i');
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return html;
}

/* ═══════════════════════════════════════════════════════════════════
   Merging & ranking — uses Reciprocal Rank Fusion (RRF) across
   all sources. RRF gives better result diversity than raw scoring.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Reciprocal Rank Fusion: combine ranked lists from multiple engines.
 * Each result's RRF score = Σ 1/(k + rank_i) for each engine_i.
 * k=60 is the standard constant.
 */
function rrfScore(rank, k = 60) {
  return 1 / (k + rank);
}

/**
 * Merge results from multiple sources using Reciprocal Rank Fusion.
 * Each engine's ranked list contributes RRF scores, then results are
 * combined, deduplicated, and annotated with cross-source metadata.
 */
function mergeResultsRRF(sources, query, limit) {
  const seen = new Map();
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const queryBigrams = [];
  for (let i = 0; i < queryWords.length - 1; i++) {
    queryBigrams.push(queryWords[i] + ' ' + queryWords[i + 1]);
  }

  for (const results of sources) {
    if (!results || !results.length) continue;
    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank];
      if (!r || !r.url) continue;
      let norm;
      try {
        const u = new URL(r.url);
        norm = u.hostname + u.pathname.replace(/\/$/, '') + (u.search ? u.search.split('&').sort().join('&') : '');
      } catch { norm = r.url; }

      const existing = seen.get(norm);
      if (existing) {
        existing.rrfScore += rrfScore(rank); // use this engine's rank too
        existing.sourceCount = (existing.sourceCount || 1) + 1;
        existing.sources = existing.sources || [existing.source];
        existing.sources.push(r.source);
        if ((r.snippet || '').length > (existing.snippet || '').length) {
          existing.snippet = r.snippet;
        }
        existing._engineRanks.push(rank);
        continue;
      }

      // Calculate relevance score (0-100) combining RRF + keyword signals
      const title = (r.title || '').toLowerCase();
      const snippet = (r.snippet || '').toLowerCase();
      let score = rrfScore(rank) * 100;  // base from RRF

      // Keyword signals
      for (const w of queryWords) {
        if (title.indexOf(w) !== -1) score += 3;
        if (snippet.indexOf(w) !== -1) score += 1.5;
      }
      for (const bg of queryBigrams) {
        if (title.indexOf(bg) !== -1) score += 4;
        if (snippet.indexOf(bg) !== -1) score += 2;
      }

      // Domain authority bonus
      const auth = r.authority || 'normal';
      if (auth === 'gov' || auth === 'edu') score += 3;
      else if (auth === 'high') score += 1.5;

      // Freshness bonus
      if (r.date) {
        const pub = new Date(r.date).getTime();
        if (!isNaN(pub)) {
          const ageDays = (Date.now() - pub) / 86400000;
          if (ageDays < 30) score += 2;
          else if (ageDays < 365) score += 1;
          else if (ageDays < 1825) score += 0.5;
        }
      }

      // Spam penalty
      try {
        const host = new URL(r.url).hostname;
        const spammy = ['doubleclick.net', 'googleadservices.com', 'amazon-adsystem.com'];
        if (spammy.some(s => host.includes(s))) score -= 5;
      } catch {}

      r._relevance = Math.round(Math.min(100, Math.max(0, score)));
      r.rrfScore = rrfScore(rank);
      r.sourceCount = 1;
      r.sources = [r.source];
      r._engineRanks = [rank];

      seen.set(norm, r);
    }
  }

  // Finalize: boost cross-source results, sort by combined score
  const merged = Array.from(seen.values());
  for (const r of merged) {
    // Cross-source results get extra boost
    if (r.sourceCount >= 2) {
      r._relevance = Math.min(100, r._relevance + 8);
    }
    // Upvote results with high RRF (early in many engine rankings)
    const avgRank = r._engineRanks.reduce((a, b) => a + b, 0) / r._engineRanks.length;
    if (avgRank < 3) r._relevance = Math.min(100, r._relevance + 5);
  }

  merged.sort((a, b) => b._relevance - a._relevance);
  return merged.slice(0, limit).map(r => {
    const { _relevance, sourceCount, sources, rrfScore, _engineRanks, ...rest } = r;
    return { ...rest, matchedQuery: query, _relevance, sourceCount, sources };
  });
}

/**
 * Run a web search across Bing + Google + 百度(Baidu) in parallel, merge
 * results with Reciprocal Rank Fusion and deduplication. All three
 * engines are accessible from mainland China.
 *
 * Returns: { results: [{ title, url, snippet, date, authority, source,
 *                        _relevance, sourceCount, sources }] }
 *
 * Each result is tagged with:
 *   - `source`: original engine ('bing' | 'google' | 'baidu')
 *   - `sources`: array of engines that found this URL (dedup signal)
 *   - `sourceCount`: how many engines found it (higher = more reliable)
 *   - `_relevance`: 0-100 relevance score to the query
 *   - `date`: parsed publish date (ISO string) or null
 *   - `authority`: 'gov' | 'edu' | 'org' | 'high' | 'normal'
 */
export async function webSearch(query, count = 10) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_RESULTS_MERGED, parseInt(count, 10) || 10));

  // Run all three sources in PARALLEL
  const [bingResults, googleResults, baiduResults] = await Promise.allSettled([
    searchBing(query, MAX_RESULTS),
    searchGoogle(query, MAX_RESULTS),
    searchBaidu(query, MAX_RESULTS),
  ]);

  // Log per-source failures for diagnostics — critical because any of
  // these engines can silently fail (blocked, captcha, HTML change).
  if (bingResults.status === 'rejected')    console.error('[webSearch] Bing failed:', bingResults.reason?.message || bingResults.reason);
  if (googleResults.status === 'rejected')  console.error('[webSearch] Google failed:', googleResults.reason?.message || googleResults.reason);
  if (baiduResults.status === 'rejected')   console.error('[webSearch] Baidu failed:', baiduResults.reason?.message || baiduResults.reason);

  const sources = [
    bingResults.status === 'fulfilled' ? bingResults.value : [],
    googleResults.status === 'fulfilled' ? googleResults.value : [],
    baiduResults.status === 'fulfilled' ? baiduResults.value : [],
  ];

  // Log if sources returned empty (valid HTML but no results parsed)
  if (!sources[0].length) console.error('[webSearch] Bing returned 0 results');
  if (!sources[1].length) console.error('[webSearch] Google returned 0 results');
  if (!sources[2].length) console.error('[webSearch] Baidu returned 0 results');

  const merged = mergeResultsRRF(sources, query, limit);

  // If all sources returned nothing, retry each source once in sequence
  if (!merged.length) {
    console.error('[webSearch] All sources returned empty — retrying each source');
    for (const [name, fn] of [['Bing', searchBing], ['Google', searchGoogle], ['Baidu', searchBaidu]]) {
      try {
        const retry = await fn(query, limit);
        if (retry && retry.length) {
          console.error('[webSearch] Retry succeeded with', name, '—', retry.length, 'results');
          const fallback = mergeResultsRRF([retry, [], []], query, limit);
          if (fallback.length) return fallback;
        }
      } catch (e) {
        console.error('[webSearch] Retry also failed for', name, ':', e.message);
      }
    }
  }

  return merged;
}

/* ═══════════════════════════════════════════════════════════════════
   Image search (unchanged — Bing Images only)
   ═══════════════════════════════════════════════════════════════════ */

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
      if (results.length >= MAX_RESULTS) break;
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
      if (results.length >= MAX_RESULTS) break;
    }
  }
  return results;
}

export async function imageSearch(query, count = 8) {
  if (!query || !String(query).trim()) {
    throw new BadRequest('Query is required');
  }
  const limit = Math.max(1, Math.min(MAX_RESULTS, parseInt(count, 10) || 8));
  const url = `https://${BING_HOST}/images/search?q=${encodeURIComponent(query)}&count=${limit + 4}`;
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
