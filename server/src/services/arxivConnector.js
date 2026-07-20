import { parseStringPromise } from 'xml2js';

const ARXIV_API = 'https://export.arxiv.org/api/query';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 3_000;
const cache = new Map();
let requestQueue = Promise.resolve();
let nextRequestAt = 0;

export class ArxivConnectorError extends Error {
  constructor(message) {
    super(message);
    this.code = 'ARXIV_REQUEST_FAILED';
  }
}

function normalizedQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 200);
}

function searchExpression(query) {
  // Treat text as words, not raw arXiv syntax, so an Apps search cannot
  // accidentally create an unexpectedly broad provider query.
  return query.split(' ').filter(Boolean).map((word) => `all:${word.replace(/[^\p{L}\p{N}._-]/gu, '')}`).filter((word) => word !== 'all:').join(' AND ');
}

async function pacedFetch(url) {
  let release;
  const previous = requestQueue;
  requestQueue = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetch(url, { headers: { Accept: 'application/atom+xml, application/xml;q=0.9' } });
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    return response;
  } finally {
    release();
  }
}

function asArray(value) { return value == null ? [] : (Array.isArray(value) ? value : [value]); }
function text(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }

function paperId(idUrl) {
  try {
    const url = new URL(text(idUrl));
    if (!/(^|\.)arxiv\.org$/i.test(url.hostname)) return '';
    return decodeURIComponent(url.pathname.replace(/^\/abs\//, '').replace(/^\//, '')).slice(0, 120);
  } catch (_) { return ''; }
}

function toPaper(entry) {
  const id = paperId(entry.id);
  const authors = asArray(entry.author).map((author) => text(author?.name)).filter(Boolean).slice(0, 12);
  const categories = asArray(entry.category).map((category) => text(category?.$?.term)).filter(Boolean).slice(0, 10);
  return {
    id,
    title: text(entry.title).slice(0, 500) || 'Untitled paper',
    summary: text(entry.summary).slice(0, 2_000),
    authors,
    categories,
    publishedAt: text(entry.published) || null,
    updatedAt: text(entry.updated) || null,
    abstractUrl: id ? `https://arxiv.org/abs/${encodeURIComponent(id).replace(/%2F/gi, '/')}` : null,
    pdfUrl: id ? `https://arxiv.org/pdf/${encodeURIComponent(id).replace(/%2F/gi, '/')}.pdf` : null,
  };
}

/** Search public arXiv metadata. No user credentials are sent or stored. */
export async function searchArxivPapers(value) {
  const query = normalizedQuery(value);
  if (query.length < 2) return [];
  const expression = searchExpression(query);
  if (!expression) return [];
  const cached = cache.get(query.toLowerCase());
  if (cached && cached.expiresAt > Date.now()) return cached.papers;
  const params = new URLSearchParams({ search_query: expression, start: '0', max_results: '20', sortBy: 'relevance', sortOrder: 'descending' });
  let response;
  try { response = await pacedFetch(`${ARXIV_API}?${params.toString()}`); }
  catch (_) { throw new ArxivConnectorError('arXiv could not be reached. Try again shortly.'); }
  if (!response.ok) throw new ArxivConnectorError('arXiv could not complete the search. Try again shortly.');
  let feed;
  try {
    feed = await parseStringPromise(await response.text(), { explicitArray: false, trim: true, normalize: true });
  } catch (_) {
    throw new ArxivConnectorError('arXiv returned an unreadable response. Try again shortly.');
  }
  const papers = asArray(feed?.feed?.entry).map(toPaper).filter((paper) => paper.id);
  cache.set(query.toLowerCase(), { papers, expiresAt: Date.now() + CACHE_TTL_MS });
  return papers;
}
