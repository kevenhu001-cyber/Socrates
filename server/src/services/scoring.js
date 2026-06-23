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
export function scoreKeywordSignals(title, snippet, queryWords, queryBigrams) {
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
export function scoreTitleQueryMatch(title, queryWords) {
  if (!title || !queryWords || !queryWords.length) return 0;
  const t = title.toLowerCase();
  let hits = 0;
  for (const w of queryWords) if (t.indexOf(w) !== -1) hits++;
  return Math.min(12, hits * 3);
}

/* ─── Authority scoring ─── */

export function scoreAuthority(authority) {
  if (authority === 'gov' || authority === 'edu') return 3;
  if (authority === 'high') return 1.5;
  return 0;
}

/* ─── Freshness scoring ─── */

/**
 * Date delta boost. A null/unparseable date contributes 0.
 * Heuristic: 30 days → +2, 1 year → +1, 5 years → +0.5.
 */
export function scoreFreshness(date) {
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
export function scoreDateFromUrlPath(url) {
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
  if (isNaN(dt)) return null;
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
export function scoreCrossSource(r) {
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
export function scoreSpamPenalty(url, title) {
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
    // PDF-only sources
    if (/\.pdf(\?|$)/i.test(url)) penalty += 6;
  } catch {}
  return penalty;
}

/**
 * Boost when the fetched page is substantive; demote thin / paywalled
 * / 404-stub pages. Used in the post-extraction rescoring pass.
 *
 * Returns delta in [-6, +4].
 */
export function contentQualityBoost(wordCount) {
  const n = wordCount | 0;
  if (n >= 800) return 4;
  if (n >= 300) return 2;
  if (n >= 120) return 0;
  if (n > 0)   return -6;  // present but too thin to be useful
  return 0;
}
