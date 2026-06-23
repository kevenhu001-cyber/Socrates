/**
 * DuckDuckGo HTML engine.
 *
 * Best-effort fallback for English queries when Bing/Google are both
 * captcha-blocked. DDG itself frequently challenges datacenter IPs
 * with an "Anubis" challenge or similar; this engine returns []
 * gracefully when that happens. Captcha is recorded by searchHealth.
 *
 * Endpoint:
 *   https://html.duckduckgo.com/html/?q=<q>&kl=us-en
 *
 * We use the lite HTML variant (`html.duckduckgo.com`) not the JS-heavy
 * main site. Result layout: <a class="result__a"> + <a class="result__snippet">.
 */

/* eslint-disable no-unused-vars */
/* Local copies of small helpers to avoid a circular import into
 * webSearch.js (which itself imports from searchEngines/). The
 * upstream versions are identical. */
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
  return String(s)
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
function stripHtml(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
}
function extractDate(snippet) {
  if (!snippet) return null;
  const m = String(snippet).match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
  if (m) return m[1];
  return null;
}
function domainAuthority(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith('.gov')) return 'gov';
    if (host.endsWith('.edu')) return 'edu';
    if (host.endsWith('.org')) return 'org';
    if (host.endsWith('.mil')) return 'mil';
    const high = ['wikipedia.org', 'reuters.com', 'ap.org', 'bbc.com', 'nature.com',
      'arxiv.org', 'github.com', 'stackoverflow.com', 'developer.mozilla.org',
      'docs.python.org', 'nodejs.org'];
    for (const d of high) if (host === d || host.endsWith('.' + d)) return 'high';
    return 'normal';
  } catch { return 'normal'; }
}

const REQUEST_TIMEOUT = 8_000;

function parseDdgHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();

  // Primary: result blocks in #react-layout / .result
  const blockRe = /<div[^>]*class="[^"]*result[^"]*"[^>]*data-result[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    // URL + title: <a class="result__a" href="...">TITLE</a>
    const aMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;
    let url = decodeEntities(aMatch[1]);
    const title = decodeEntities(stripHtml(aMatch[2]).trim());
    if (!title || !url) continue;
    // DDG wraps results in a redirector; unwrap if present.
    try {
      const u = new URL(url);
      const uddg = u.searchParams.get('uddg');
      if (uddg && /^https?:\/\//i.test(uddg)) url = uddg;
    } catch {}

    // Snippet: <a class="result__snippet"> or <div class="result__snippet">
    let snippet = '';
    const snipMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (snipMatch) snippet = decodeEntities(stripHtml(snipMatch[1]).replace(/\s+/g, ' ').trim());

    const date = extractDate(snippet || title);
    const authority = domainAuthority(url);
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet, date, authority, source: 'ddg' });
    if (results.length >= 15) break;
  }

  // Secondary: even simpler layout (older DDG HTML)
  if (!results.length) {
    const linkRe = /<a[^>]*class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snipRe = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
    while ((m = linkRe.exec(html)) !== null) {
      let url = decodeEntities(m[1]);
      const title = decodeEntities(stripHtml(m[2]).trim());
      if (!title || !url) continue;
      try {
        const u = new URL(url);
        const uddg = u.searchParams.get('uddg');
        if (uddg && /^https?:\/\//i.test(uddg)) url = uddg;
      } catch {}
      const sm = snipRe.exec(html);
      const snippet = sm ? decodeEntities(stripHtml(sm[1]).replace(/\s+/g, ' ').trim()) : '';
      const date = extractDate(snippet || title);
      const authority = domainAuthority(url);
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, snippet, date, authority, source: 'ddg' });
      if (results.length >= 15) break;
    }
  }

  return results;
}

export async function searchDdg(query, limit = 10, langCluster = 'latin') {
  if (!query || !String(query).trim()) return [];
  // DDG HTML only handles Latin-script queries cleanly.
  if (langCluster !== 'latin') return [];
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
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
    // Captcha / Anubis detection
    if (/Anubis|challenge|captcha|unusual traffic|robot check/i.test(html)) {
      // Record but don't log full HTML to avoid noise.
      return [];
    }
    const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
    return parseDdgHtml(capped).slice(0, limit);
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}