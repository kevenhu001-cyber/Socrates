/**
 * Main-content extractor for fetched pages.
 *
 * Primary: Mozilla Readability (the same algorithm Firefox Reader View
 * uses). Fallback: a hand-rolled text-density heuristic that scores
 * DOM blocks by (text density) − 2 × (link density) and picks the
 * highest-scoring <div>-containing-cluster.
 *
 * Strips heavy noise (script, style, nav, footer, aside, svg, form)
 * before running Readability — pre-stripping noticeably improves
 * extraction quality on news sites that bury the article under sticky
 * navs and "related stories" rail.
 *
 * Hard caps:
 *   - cleaned text < 250 chars → treat as fetch failure (return null)
 *   - cleaned text > 8000 chars → keep first 8000 (most relevant
 *     answers live in opening paragraphs; protects the LLM context)
 */

import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';

const HARD_MIN_CHARS = 250;
const HARD_MAX_CHARS = 8000;

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'svg', 'iframe',
  'nav', 'header', 'footer', 'aside', 'form',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '[aria-hidden="true"]',
];

/**
 * Run extraction.
 * @param {string} html
 * @param {string} url
 * @returns {object|null}  {title, byline, siteName, excerpt, content,
 *                          length, date, method} or null on failure.
 */
export function extractArticle(html, url) {
  if (!html || !url) return null;

  let dom;
  try {
    dom = new JSDOM(html, {
      url,
      virtualConsole: new VirtualConsole(), // silence CSS parse errors
      // Don't execute scripts; keep cookie/storage behavior default-off.
      runScripts: 'outside-only',
    });
  } catch (e) {
    return null;
  }

  const doc = dom.window.document;
  stripJunk(doc);

  // Try Readability first.
  let article = null;
  try {
    article = new Readability(doc, { debug: false, charThreshold: HARD_MIN_CHARS }).parse();
  } catch {
    article = null;
  }

  if (article && article.textContent && article.textContent.trim().length >= HARD_MIN_CHARS) {
    return shape(article, doc, 'readability');
  }

  // Fallback: text-density heuristic.
  return extractByTextDensity(doc, url);
}

/* ─── Helpers ─── */

function shape(article, doc, method) {
  const cleaned = cleanText(article.textContent || '');
  const truncated = cleaned.length > HARD_MAX_CHARS;
  const content = truncated ? cleaned.slice(0, HARD_MAX_CHARS) : cleaned;
  const excerptSrc = (article.excerpt || content).replace(/\s+/g, ' ').trim();
  const excerpt = excerptSrc.length > 320 ? excerptSrc.slice(0, 317) + '…' : excerptSrc;
  return {
    title: (article.title || '').trim(),
    byline: article.byline || null,
    siteName: article.siteName || null,
    excerpt,
    content,
    length: content.length,
    date: extractDateFromMeta(doc) || null,
    method,
  };
}

function stripJunk(doc) {
  for (const sel of NOISE_SELECTORS) {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch {
      /* selector may be unsupported in some jsdom versions — skip */
    }
  }
  // Also strip elements whose computed styles say "display:none" — we
  // can't read CSS, so use a class-name heuristic for common ad slots.
  doc.querySelectorAll('[id*="ad-" i], [class*="ad-" i], [class*="advert" i], [id*="-banner" i]')
    .forEach((el) => el.remove());
}

function cleanText(s) {
  if (!s) return '';
  return String(s)
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Drop Read more / Continue reading / "…" tails
    .replace(/\s*(Read more|Continue reading|Continue reading…|More info|Read full article)[\s\S]*$/i, '')
    .trim();
}

/**
 * Look for a publish date in <meta> / <time> / schema.org JSON-LD.
 * Returns ISO YYYY-MM-DD or null.
 */
function extractDateFromMeta(doc) {
  // <meta property="article:published_time">  /  og:article:published_time
  const meta = doc.querySelector(
    'meta[property="article:published_time"], meta[property="og:article:published_time"], ' +
    'meta[name="pubdate"], meta[name="publishdate"], meta[name="date"], ' +
    'meta[itemprop="datePublished"]'
  );
  if (meta && meta.content) {
    const iso = normalizeDate(meta.content);
    if (iso) return iso;
  }
  // <time datetime="...">
  const t = doc.querySelector('time[datetime]');
  if (t) {
    const iso = normalizeDate(t.getAttribute('datetime'));
    if (iso) return iso;
  }
  return null;
}

function normalizeDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d)) return null;
  // Reject obviously wrong dates (year 1900, year > now+1day)
  const yr = d.getUTCFullYear();
  if (yr < 1990 || yr > new Date().getUTCFullYear() + 1) return null;
  return d.toISOString().slice(0, 10);
}

/* ─── Text-density fallback ─── */

function extractByTextDensity(doc, url) {
  // Build candidate blocks: every <div> and <article> with at least
  // one <p> or <li> child, excluding ones inside <main> ancestors
  // already (Readability should have caught them — but if we're
  // here, Readability failed, so cast a wider net).
  const candidates = doc.querySelectorAll('article, main, div, section');
  let best = null;
  let bestScore = 0;

  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    if (text.length < HARD_MIN_CHARS) continue;
    const links = el.querySelectorAll('a').length;
    const textLen = text.length;
    // Penalize link-heavy blocks (nav, table of contents).
    const score = textLen - links * 50;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best) return null;

  // Within the best block, walk <p>/<li>/<h2>/<h3> in document order
  // and concatenate. This is a crude approximation of Readability but
  // recovers a usable body on simpler pages.
  const parts = [];
  best.querySelectorAll('p, li, h2, h3, blockquote, pre').forEach((el) => {
    const t = (el.textContent || '').trim();
    if (!t) return;
    if (el.tagName === 'P' || el.tagName === 'BLOCKQUOTE' || el.tagName === 'PRE') {
      parts.push(t);
    } else if (el.tagName === 'H2' || el.tagName === 'H3') {
      parts.push('\n\n## ' + t);
    } else {
      parts.push('• ' + t);
    }
  });

  const joined = parts.join('\n\n');
  if (joined.length < HARD_MIN_CHARS) return null;

  const title = (doc.querySelector('title') || {}).textContent || '';
  const cleaned = cleanText(joined);
  const content = cleaned.length > HARD_MAX_CHARS ? cleaned.slice(0, HARD_MAX_CHARS) : cleaned;
  const excerptSrc = content.replace(/\s+/g, ' ').trim();
  const excerpt = excerptSrc.length > 320 ? excerptSrc.slice(0, 317) + '…' : excerptSrc;

  return {
    title: title.trim(),
    byline: null,
    siteName: (() => { try { return new URL(url).hostname; } catch { return null; } })(),
    excerpt,
    content,
    length: content.length,
    date: extractDateFromMeta(doc) || null,
    method: 'heuristic',
  };
}
