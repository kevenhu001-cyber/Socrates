/**
 * Centralized scoring helpers for web search results.
 *
 * Each function is a pure delta — add the return value to a result's
 * `_relevance` to influence ranking. Higher = more relevant.
 *
 * Kept out of webSearch.js so the pipeline file stays readable, and so
 * the helpers can be unit-tested in isolation.
 */

/* ─── Keyword signal scoring ─── */

/**
 * Score a result's title + snippet against the query's words and bigrams.
 * Title hits count for more than snippet hits.
 *
 * @param {string} title
 * @param {string} snippet
 * @param {string[]} queryWords  lowercase, length > 2, already deduped
 * @param {string[]} queryBigrams  pairs of adjacent query words
 * @returns {number}
 */
export function scoreKeywordSignals(title: string, snippet: string, queryWords: string[], queryBigrams: string[]): number {
  const t = (title || '').toLowerCase();
  const s = (snippet || '').toLowerCase();
  let score = 0;
  for (const w of queryWords) {
    if (t.indexOf(w) !== -1) score += 3;
    if (s.indexOf(w) !== -1) score += 1.5;
  }
  for (const bg of queryBigrams) {
    if (t.indexOf(bg) !== -1) score += 4;
    if (s.indexOf(bg) !== -1) score += 2;
  }
  return score;
}

/**
 * Title-vs-query match with a stronger weight than snippet match.
 * Used in the post-extraction rescoring pass to give clean-title
 * results a noticeable boost over results whose body is a hit but
 * whose title is generic (e.g. "Home - ACME Corp").
 */
export function scoreTitleQueryMatch(title: string, queryWords: string[]): number {
  if (!title || !queryWords || !queryWords.length) return 0;
  const t = title.toLowerCase();
  let hits = 0;
  for (const w of queryWords) if (t.indexOf(w) !== -1) hits++;
  return Math.min(12, hits * 3);
}

/* ─── Authority scoring ─── */

export function scoreAuthority(authority: string): number {
  if (authority === 'gov' || authority === 'edu') return 3;
  if (authority === 'high') return 1.5;
  return 0;
}

/* ─── Freshness scoring ─── */

/**
 * Date delta boost. A null/unparseable date contributes 0.
 * Heuristic: 30 days → +2, 1 year → +1, 5 years → +0.5.
 */
export function scoreFreshness(date: string | number | Date | null | undefined): number {
  if (!date) return 0;
  const pub = new Date(date).getTime();
  if (isNaN(pub)) return 0;
  const ageDays = (Date.now() - pub) / 86400000;
  if (ageDays < 30) return 2;
  if (ageDays < 365) return 1;
  if (ageDays < 1825) return 0.5;
  return 0;
}

/**
 * Extract an ISO date from URL path patterns.
 * Examples that match:
 *   /2025/11/14/...
 *   /2024-03-12.html
 *   /articles/2024/03/slug
 *   /2024/03/
 * Returns ISO date string (YYYY-MM-DD) or null.
 *
 * Skips future dates — those are noise (typos, randomized URL slugs).
 */
export function scoreDateFromUrlPath(url: string | null | undefined): string | null {
  if (!url) return null;
  // Match /YYYY/MM[/DD] or /YYYY-MM[-DD]
  const m = url.match(/\/((?:19|20)\d{2})[\/\-](\d{1,2})(?:[\/\-](\d{1,2}))?/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = m[3] ? parseInt(m[3], 10) : 1;
  // Sanity checks
  if (month < 1 || month > 12) return null;
  if (m[3] && (day < 1 || day > 31)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(dt as unknown as number)) return null;
  // Reject future dates (with 1 day slack for TZ)
  if (dt.getTime() > Date.now() + 86400000) return null;
  return dt.toISOString().slice(0, 10);
}

/* ─── Cross-source boost ─── */

/**
 * Boost when the same URL was returned by 2+ engines (deduplication
 * is a strong relevance signal) AND when it appeared near the top of
 * the per-engine rankings.
 */
interface CrossSourceResult {
  sourceCount?: number;
  _engineRanks?: number[];
}

export function scoreCrossSource(r: CrossSourceResult): number {
  let bonus = 0;
  if ((r.sourceCount || 0) >= 2) bonus += 8;
  if (Array.isArray(r._engineRanks) && r._engineRanks.length) {
    const avgRank = r._engineRanks.reduce((a, b) => a + b, 0) / r._engineRanks.length;
    if (avgRank < 3) bonus += 5;
  }
  return bonus;
}

/* ─── Spam / quality penalties ─── */

const SPAMMY_HOSTNAMES = [
  'doubleclick.net',
  'googleadservices.com',
  'amazon-adsystem.com',
  'adservice.google.',
];

const FORUM_HOSTNAMES = [
  'reddit.com',
  'quora.com',
  'facebook.com',
  'twitter.com',
  'x.com',
];

/**
 * Demote results that are likely to be SEO spam, forum thin content,
 * or PDF-only (the LLM can't easily read PDFs and the SERP snippet
 * is usually just the abstract).
 *
 * Returns a NEGATIVE number (penalty). Add to _relevance.
 */
export function scoreSpamPenalty(url: string | null | undefined, title: string | null | undefined): number {
  let penalty = 0;
  if (title) {
    if (title.length > 140) penalty += 4;
    if (title.indexOf('...') !== -1 || /[…]\s*$/.test(title)) penalty += 4;
    // SEO-bait caps / excessive separators
    const pipeCount = (title.match(/\|/g) || []).length;
    if (pipeCount >= 2) penalty += 2;
  }
  if (!url) return penalty;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (SPAMMY_HOSTNAMES.some(s => host.indexOf(s) !== -1)) penalty += 5;
    if (FORUM_HOSTNAMES.some(s => host === s || host.endsWith('.' + s))) penalty += 3;
    // PDF-only sources — but whitelist arXiv, which we route through
    // its abstract HTML page (arxiv.org/abs/<id>), not the PDF itself.
    if (/\.pdf(\?|$)/i.test(url) && !/(^|\.)arxiv\.org$/i.test(host)) {
      penalty += 6;
    }
  } catch {}
  return penalty;
}

/**
 * Boost when the fetched page is substantive; demote thin / paywalled
 * / 404-stub pages. Used in the post-extraction rescoring pass.
 *
 * Returns delta in [-6, +4].
 */
export function contentQualityBoost(wordCount: number): number {
  const n = wordCount | 0;
  if (n >= 800) return 4;
  if (n >= 300) return 2;
  if (n >= 120) return 0;
  if (n > 0)   return -6;  // present but too thin to be useful
  return 0;
}

/* ─── Tokenization ─── */

/* Unicode ranges for major scripts. Used to detect the language cluster
 * of a query or result and to apply length-aware token filters. */
const CJK_RE = /[㐀-鿿豈-﫿가-힯]/;
const CYRILLIC_RE = /[Ѐ-ӿ]/;
const LATIN_RE = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ſ]/;

let _segmenter: Intl.Segmenter | false | null = null;
function getSegmenter(): Intl.Segmenter | null {
  if (_segmenter) return _segmenter;
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try { _segmenter = new Intl.Segmenter(undefined, { granularity: 'word' }); return _segmenter; }
    catch { _segmenter = false; return null; }
  }
  _segmenter = false;
  return null;
}

/**
 * Detect the dominant script cluster for a string. Returns one of
 * 'cjk' | 'cyrillic' | 'latin' | 'other'. Used to:
 *   - Pick the right Bing host (cn.bing.com for cjk, www.bing.com otherwise)
 *   - Skip engines that have been returning wrong-cluster results for
 *     this query's cluster (see searchHealth.js)
 *   - Boost results whose language cluster matches the query's cluster
 */
export function detectLanguageCluster(s: string): 'cjk' | 'cyrillic' | 'latin' | 'other' {
  if (!s) return 'other';
  const str = String(s);
  let cjk = 0, cyr = 0, lat = 0;
  // Sample at most 200 chars for performance.
  const sample = str.length > 200 ? str.slice(0, 200) : str;
  for (const ch of sample) {
    if (CJK_RE.test(ch)) cjk++;
    else if (CYRILLIC_RE.test(ch)) cyr++;
    else if (LATIN_RE.test(ch)) lat++;
  }
  const max = Math.max(cjk, cyr, lat);
  if (max === 0) return 'other';
  if (max === cjk) return 'cjk';
  if (max === cyr) return 'cyrillic';
  return 'latin';
}

/**
 * Tokenize a query into a deduped array of normalized words, suitable
 * for keyword matching. Replaces the broken
 * `query.toLowerCase().split(/\W+/)` that:
 *   - Fails on CJK (one token per character)
 *   - Misses diacritic folding (résumé != resume)
 *   - Drops accented Latin tokens
 *
 * Uses `Intl.Segmenter` with word granularity. Falls back to
 * whitespace split if Segmenter isn't available.
 *
 * Length filter is script-aware:
 *   - CJK tokens: 2+ chars (a single Chinese character is rarely a
 *     meaningful search keyword by itself)
 *   - Other tokens: 3+ chars (skip "a", "of", "the", "is")
 *
 * @param {string} query
 * @returns {string[]} deduped, lowercased, NFKC-normalized tokens
 */
export function tokenizeQuery(query: string): string[] {
  if (!query) return [];
  const norm = String(query).normalize('NFKC').toLowerCase();
  const seg = getSegmenter();
  const tokens: string[] = [];
  if (seg) {
    for (const { segment } of seg.segment(norm)) {
      const w = String(segment).trim();
      if (!w) continue;
      // Drop pure whitespace and punctuation that Segmenter sometimes emits.
      if (/^[\s\p{P}]+$/u.test(w)) continue;
      const isCJK = CJK_RE.test(w);
      const minLen = isCJK ? 2 : 3;
      if (w.length < minLen) continue;
      tokens.push(w);
    }
  } else {
    // Fallback: split on non-letter/digit, keep Latin tokens ≥3 chars
    // and CJK tokens ≥2 chars.
    for (const w of norm.split(/[^\p{L}\p{N}]+/u)) {
      if (!w) continue;
      const isCJK = CJK_RE.test(w);
      const minLen = isCJK ? 2 : 3;
      if (w.length < minLen) continue;
      tokens.push(w);
    }
  }
  return [...new Set(tokens)];
}

/**
 * Build bigrams from a token array (after tokenization).
 */
export function tokenBigrams(tokens: string[]): string[] {
  if (!Array.isArray(tokens) || tokens.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    out.push(tokens[i] + ' ' + tokens[i + 1]);
  }
  return out;
}

/* ─── Language-match scoring ─── */

/**
 * Boost results whose text content matches the query's language cluster.
 * Specifically catches the case where cn.bing.com returns Chinese
 * results for an English query, or vice versa.
 *
 * Returns delta in [-4, +3].
 */
export function scoreLanguageMatch(queryCluster: string, resultText: string): number {
  if (!queryCluster || queryCluster === 'other') return 0;
  if (!resultText) return 0;
  const resultCluster = detectLanguageCluster(resultText);
  if (resultCluster === queryCluster) return 3;
  if (resultCluster === 'other') return 0;
  // Mismatched script: significant penalty.
  return -4;
}
