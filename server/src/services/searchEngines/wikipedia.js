/**
 * Wikipedia REST/Action API engine.
 *
 * Free, JSON-based, no captcha, ToS-friendly for non-commercial
 * research bots. Excellent for entity-disambiguation queries
 * ("transformer architecture" → "Transformer (deep learning architecture)").
 *
 * API endpoint:
 *   https://<lang>.wikipedia.org/w/api.php?action=query&list=search
 *     &srsearch=<q>&format=json&srlimit=15&utf8=1&origin=*
 *
 * We pick the language sub-domain from the query's detected language
 * cluster (zh.wikipedia.org for CJK, en.wikipedia.org otherwise). The
 * `origin=*` param enables CORS — harmless for server-to-server.
 */

const REQUEST_TIMEOUT = 8_000;

const USER_AGENT = 'Socrates/1.0 (research bot; +https://socrates.local)';

function pickLangHost(langCluster) {
  if (langCluster === 'cjk') return 'zh.wikipedia.org';
  if (langCluster === 'cyrillic') return 'ru.wikipedia.org';
  return 'en.wikipedia.org';
}

/**
 * Strip HTML from Wikipedia's snippet (which arrives with <span> tags
 * for highlighting).
 */
function stripWikiHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull a 4-digit year out of the snippet. Wikipedia often includes the
 * publication date in parentheses.
 */
function extractDate(snippet) {
  if (!snippet) return null;
  const m = snippet.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  if (!m) return null;
  return `${m[1]}-01-01`;
}

export async function searchWikipedia(query, limit = 10, langCluster = 'latin') {
  if (!query || !String(query).trim()) return [];
  const host = pickLangHost(langCluster);
  const url = `https://${host}/w/api.php?action=query&list=search`
    + `&srsearch=${encodeURIComponent(query)}`
    + `&format=json&srlimit=${Math.max(1, Math.min(15, limit))}`
    + `&utf8=1&origin=*`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const data = await r.json();
    const hits = data?.query?.search;
    if (!Array.isArray(hits)) return [];

    return hits.slice(0, limit).map((h) => {
      const title = stripWikiHtml(h.title || '');
      const snippet = stripWikiHtml(h.snippet || '');
      const urlPath = encodeURIComponent((h.title || '').replace(/ /g, '_'));
      return {
        title,
        url: `https://${host}/wiki/${urlPath}`,
        snippet,
        date: extractDate(snippet),
        authority: 'high',
        source: 'wikipedia',
      };
    });
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}