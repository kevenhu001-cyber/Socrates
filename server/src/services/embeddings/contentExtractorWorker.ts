/**
 * contentExtractorWorker.js — runs extractArticle() in an isolated
 * worker thread so the JSDOM + Readability parse (which is CPU-bound
 * and synchronous inside the JS engine) can never block the main
 * Node event loop.
 *
 * Why this matters: on 2026-07-04 the main thread was pinned at 96.9%
 * CPU for ~9 hours after one of the topodrive.top marketing pages
 * triggered an extreme JSDOM parse. SIGTERM was ignored because the
 * event loop never got to run the shutdown handler. Wrapping the
 * extraction in a worker thread caps the damage — a stuck parse is
 * confined to one worker and can be killed without taking down the
 * HTTP server.
 *
 * Protocol (parent ↔ worker):
 *   Parent → Worker: { id, type:'extract', html, url, maxChars? }
 *   Worker → Parent: { id, type:'result', payload } on success
 *   Worker → Parent: { id, type:'error', message } on failure
 *
 * On boot the worker loads @mozilla/readability + jsdom once and
 * keeps them resident — no per-request module load cost.
 */
import { parentPort } from 'node:worker_threads';
import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';

const HARD_MIN_CHARS = 250;
const HARD_MAX_CHARS = 8000;
type ReadabilityArticle = NonNullable<ReturnType<Readability['parse']>>;

interface DomElement {
  textContent: string | null;
  tagName: string;
  remove(): void;
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): DomElementList;
}

interface DomElementList extends Iterable<DomElement> {
  length: number;
  forEach(callback: (element: DomElement) => void): void;
}

interface DomDocument {
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): DomElementList;
}

interface ExtractRequest {
  id: string;
  type: 'extract';
  html: string;
  url: string;
  maxChars?: number;
}

function isExtractRequest(value: unknown): value is ExtractRequest {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'id' in value && typeof value.id === 'string'
    && 'type' in value && value.type === 'extract'
    && 'html' in value && typeof value.html === 'string'
    && 'url' in value && typeof value.url === 'string';
}

const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'svg', 'iframe',
  'nav', 'header', 'footer', 'aside', 'form',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '[aria-hidden="true"]',
];

function cleanText(s: string) {
  if (!s) return '';
  return String(s)
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s*(Read more|Continue reading|Continue reading…|More info|Read full article)[\s\S]*$/i, '')
    .trim();
}

function stripJunk(doc: DomDocument) {
  for (const sel of NOISE_SELECTORS) {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch { /* selector may be unsupported in some jsdom versions — skip */ }
  }
  doc.querySelectorAll('[id*="ad-" i], [class*="ad-" i], [class*="advert" i], [id*="-banner" i]')
    .forEach((el) => el.remove());
}

function shape(article: ReadabilityArticle, doc: DomDocument, method: string, maxChars: number) {
  const cleaned = cleanText(article.textContent || '');
  const truncated = cleaned.length > maxChars;
  const content = truncated ? cleaned.slice(0, maxChars) : cleaned;
  const excerptSrc = (article.excerpt || content).replace(/\s+/g, ' ').trim();
  const excerpt = excerptSrc.length > 320 ? excerptSrc.slice(0, 317) + '…' : excerptSrc;
  let date: string | null = null;
  try {
    const meta = doc.querySelector(
      'meta[property="article:published_time"], meta[property="og:article:published_time"], ' +
      'meta[name="pubdate"], meta[name="publishdate"], meta[name="date"], ' +
      'meta[itemprop="datePublished"]'
    );
    const publishedAt = meta?.getAttribute('content');
    if (publishedAt) {
      const d = new Date(publishedAt);
      if (!isNaN(d as unknown as number)) {
        const yr = d.getUTCFullYear();
        if (yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
          date = d.toISOString().slice(0, 10);
        }
      }
    }
    if (!date) {
      const t = doc.querySelector('time[datetime]');
      if (t) {
        const datetime = t.getAttribute('datetime');
        const d = new Date(datetime || '');
        if (!isNaN(d as unknown as number)) {
          const yr = d.getUTCFullYear();
          if (yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
            date = d.toISOString().slice(0, 10);
          }
        }
      }
    }
  } catch { /* date is best-effort */ }

  return {
    title: (article.title || '').trim(),
    byline: article.byline || null,
    siteName: article.siteName || null,
    excerpt,
    content,
    length: content.length,
    date,
    method,
    truncated,
  };
}

function extractByTextDensity(doc: DomDocument, url: string, maxChars: number) {
  const candidates = doc.querySelectorAll('article, main, div, section');
  let best: DomElement | null = null;
  let bestScore = 0;
  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    if (text.length < HARD_MIN_CHARS) continue;
    const links = el.querySelectorAll('a').length;
    const textLen = text.length;
    const score = textLen - links * 50;
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (!best) return null;

  const parts: string[] = [];
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
  const title = doc.querySelector('title')?.textContent || '';
  const cleaned = cleanText(joined);
  const truncated = cleaned.length > maxChars;
  const content = truncated ? cleaned.slice(0, maxChars) : cleaned;
  const excerptSrc = content.replace(/\s+/g, ' ').trim();
  const excerpt = excerptSrc.length > 320 ? excerptSrc.slice(0, 317) + '…' : excerptSrc;
  let siteName: string | null = null;
  try { siteName = new URL(url).hostname; } catch {}
  return {
    title: title.trim(),
    byline: null,
    siteName,
    excerpt,
    content,
    length: content.length,
    date: null,
    method: 'heuristic',
    truncated,
  };
}

function extract(html: string, url: string, maxChars: number) {
  if (!html || !url) return null;
  let doc: DomDocument;
  try {
    doc = new JSDOM(html, {
      url,
      virtualConsole: new VirtualConsole(),
      runScripts: 'outside-only',
    }).window.document as DomDocument;
  } catch { return null; }
  stripJunk(doc);
  let article: ReadabilityArticle | null = null;
  try {
    article = new Readability(doc as never, { debug: false, charThreshold: HARD_MIN_CHARS }).parse();
  } catch { article = null; }
  if (article && article.textContent && article.textContent.trim().length >= HARD_MIN_CHARS) {
    return shape(article, doc, 'readability', maxChars);
  }
  return extractByTextDensity(doc, url, maxChars);
}

parentPort!.on('message', (value: unknown) => {
  if (!isExtractRequest(value)) return;
  const msg = value;
  try {
    const maxChars = typeof msg.maxChars === 'number' && Number.isSafeInteger(msg.maxChars)
      ? Math.min(1_000_000, Math.max(HARD_MAX_CHARS, msg.maxChars))
      : HARD_MAX_CHARS;
    const payload = extract(msg.html, msg.url, maxChars);
    parentPort!.postMessage({ id: msg.id, type: 'result', payload });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, type: 'error', message: String(e && (e as Error).message || e) });
  }
});
