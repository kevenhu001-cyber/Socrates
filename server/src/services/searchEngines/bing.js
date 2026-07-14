/**
 * Bing Web Search engine — HTML scrape fallback.
 *
 * Searches Bing's web results by scraping the HTML search page, similar to
 * the existing imageSearch that already scrapes Bing Images successfully.
 * Used as a third fallback when MiniMax search and searXNG both fail.
 *
 * Bing is accessible from China and returns results in ~3-5s.
 */

const REQUEST_TIMEOUT = 12_000;
const MAX_RESULTS = 12;

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
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; }
    });
}

/**
 * Extract an approximate date from Bing snippet text.
 */
function extractDate(snippet) {
  if (!snippet) return null;
  // Match dates like "2024年1月5日", "Jan 5, 2024", "2024-01-05", "2 days ago"
  const cjk = snippet.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cjk) return `${cjk[1]}-${cjk[2].padStart(2,'0')}-${cjk[3].padStart(2,'0')}`;
  const en = snippet.match(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/);
  if (en) return en[1];
  return null;
}

/**
 * Parse Bing web search HTML results.
 */
function parseBingWebHtml(html) {
  if (!html) return [];
  const results = [];
  const seen = new Set();

  // Bing's organic results are in <li class="b_algo"> elements
  const liRe = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const li = m[1];
    // Extract URL from <a> with href
    const aMatch = li.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/);
    if (!aMatch) continue;
    const url = decodeEntities(aMatch[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    // Extract title from <a> or <h2> text
    const titleMatch = li.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

    // Extract snippet from <p> or .b_caption p or <div class="b_caption">
    let snippet = '';
    const pMatch = li.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (pMatch) {
      snippet = decodeEntities(pMatch[1].replace(/<[^>]+>/g, '').trim());
    }
    if (!snippet) {
      const capMatch = li.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (capMatch) {
        snippet = decodeEntities(capMatch[1].replace(/<[^>]+>/g, '').trim());
      }
    }

    if (!url || !title) continue;

    results.push({
      title,
      url,
      snippet: snippet.slice(0, 500),
      date: extractDate(snippet),
      authority: url.includes('wikipedia.org') || url.includes('.edu.') ? 'high' : 'normal',
      source: 'bing',
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

/**
 * Search the web via Bing HTML scrape.
 *
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Promise<Array<{title:string, url:string, snippet:string, date:string|null, authority:string, source:'bing'}>>}
 */
export async function searchBing(query, limit = 10, signal = null) {
  if (!query || !String(query).trim()) return [];

  const bingHost = process.env.WEB_SEARCH_HOST || 'cn.bing.com';
  const url = `https://${bingHost}/search?q=${encodeURIComponent(query)}&count=${limit + 4}&cc=cn`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const fetchSignal = signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([controller.signal, signal]) : signal)
    : controller.signal;

  try {
    const r = await fetch(url, {
      method: 'GET',
      signal: fetchSignal,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];

    const html = await r.text();
    const capped = html.length > 500_000 ? html.slice(0, 500_000) : html;
    const results = parseBingWebHtml(capped);
    return results.slice(0, Math.min(limit, MAX_RESULTS));
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      console.warn('[searchBing] Request timed out');
    } else {
      console.warn('[searchBing] Request failed:', e && e.message ? e.message : e);
    }
    return [];
  }
}
