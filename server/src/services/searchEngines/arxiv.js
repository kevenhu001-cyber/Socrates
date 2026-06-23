/**
 * arXiv Atom XML API engine.
 *
 * Free, no captcha, extremely high quality for science queries. Returns
 * Atom XML which we parse with regex (no XML lib needed for the simple
 * <entry>-walking this engine does).
 *
 * API endpoint:
 *   http://export.arxiv.org/api/query?search_query=all:<q>&max_results=10
 *
 * We point each result at the abstract HTML page (arxiv.org/abs/<id>),
 * NOT the .pdf URL — fetchBatch's Readability extractor works on HTML
 * and the `scoreSpamPenalty` PDF penalty is whitelisted for arxiv.org
 * in scoring.js either way.
 */

const REQUEST_TIMEOUT = 8_000;

const USER_AGENT = 'Socrates/1.0 (research bot; mailto:noreply@socrates.local)';

function decodeXmlEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; }
    });
}

function pickTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]).trim() : '';
}

function extractId(idUrl) {
  // "http://arxiv.org/abs/2401.01234v1" → "2401.01234"
  if (!idUrl) return null;
  const m = String(idUrl).match(/arxiv\.org\/abs\/([\w.\-]+?)(v\d+)?$/);
  return m ? m[1] : null;
}

export async function searchArxiv(query, limit = 10) {
  if (!query || !String(query).trim()) return [];
  const url = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}`
    + `&max_results=${Math.max(1, Math.min(15, limit))}&sortBy=relevance&sortOrder=descending`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/atom+xml' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const xml = await r.text();
    const capped = xml.length > 800_000 ? xml.slice(0, 800_000) : xml;

    const results = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRe.exec(capped)) !== null) {
      const block = m[1];
      const idUrl = pickTag(block, 'id');
      const id = extractId(idUrl);
      if (!id) continue;
      const title = pickTag(block, 'title').replace(/\s+/g, ' ').trim();
      const summary = pickTag(block, 'summary').replace(/\s+/g, ' ').trim();
      const published = pickTag(block, 'published'); // ISO YYYY-MM-DDTHH:MM:SSZ
      const date = published ? published.slice(0, 10) : null;
      const snippet = summary.length > 500 ? summary.slice(0, 497) + '…' : summary;
      results.push({
        title,
        url: `https://arxiv.org/abs/${id}`,
        snippet,
        date,
        authority: 'high',
        source: 'arxiv',
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}