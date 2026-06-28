/**
 * Product Context Service — gives the model direct knowledge of
 * topodrive.top (the company's marketing site) so it can answer
 * questions like "what is Topodrive?", "how much does it cost?",
 * "what's your privacy policy?" with accurate, sourced answers.
 *
 * Design:
 *   - On boot: refresh cache once (async, non-blocking).
 *   - Every 6 hours: refresh again in the background.
 *   - Manual refresh: POST /api/product-context/refresh.
 *   - All fetches go through fetchBatch (SSRF-safe) with a 10s/200KB cap.
 *   - HTML is converted to clean Markdown via a tag-based transformer,
 *     then cached in-process.
 *
 * The Markdown is injected as a single system message by routes/chat.js.
 * The LLM is told to use it only for company/product questions, not to
 * shill in unrelated conversations.
 */

import { fetchBatch } from './fetchBatch.js';

/** Pages we want the model to know about. Ordered roughly by importance. */
const PRODUCT_PAGES = [
  'https://topodrive.top/',
  'https://topodrive.top/pricing',
  'https://topodrive.top/guide',
  'https://topodrive.top/about',
  'https://topodrive.top/contact',
  'https://topodrive.top/terms',
  'https://topodrive.top/privacy',
  'https://topodrive.top/account',
  'https://topodrive.top/api-keys',
  'https://topodrive.top/profile',
  'https://topodrive.top/checkout',
];

/** Cache TTL — pages can change but the FAQ-grade content moves slowly. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Hard cap on context size we inject per request, to protect the
 *  prompt budget.  ~20K Markdown chars is well within limits. */
const MAX_CONTEXT_CHARS = 20_000;

/** Per-page Markdown cap before joining — keeps one giant page from
 *  eating the budget. */
const MAX_PAGE_CHARS = 4_000;

/* In-memory cache. Process-local — not shared across Node instances. */
const cache = {
  fetchedAt: 0,
  expiresAt: 0,
  pages: {},
};

let refreshInFlight = null;

/**
 * Convert Readability's HTML content into clean Markdown.
 * Readability.content is semantic HTML (p, h1-h6, ul/ol, etc.), so we
 * walk the tags and emit Markdown equivalents.
 */
function cleanToMarkdown(html) {
  if (!html) return '';
  return String(html)
    // Strip script/style blocks.
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Headings.
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t) => '\n\n## ' + t.replace(/<[^>]+>/g, '').trim() + '\n')
    // Paragraphs.
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => t.replace(/<[^>]+>/g, '').trim() + '\n\n')
    // List items.
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => '- ' + t.replace(/<[^>]+>/g, '').trim() + '\n')
    // Remove remaining HTML tags.
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities.
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    // Collapse whitespace.
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Refresh all pages. Called on boot, on a 6h interval, and on demand
 * via the admin endpoint. Idempotent and concurrency-safe — if a
 * refresh is already running, callers receive the same promise.
 */
export async function refreshCache({ force = false } = {}) {
  if (refreshInFlight && !force) return refreshInFlight;

  refreshInFlight = (async () => {
    const startedAt = Date.now();
    console.log(`[product-context] refreshing ${PRODUCT_PAGES.length} pages...`);

    const { results } = await fetchBatch(PRODUCT_PAGES);

    const newPages = {};
    let okCount = 0;
    let totalChars = 0;

    for (const r of results) {
      const url = r.url;
      if (!r.ok || !r.content) {
        newPages[url] = {
          url,
          title: '',
          markdown: '',
          status: r.status || 0,
          length: 0,
          fetchedAt: Date.now(),
          error: r.reason || r.error || 'HTTP ' + (r.status || 'unknown'),
        };
        console.warn('[product-context] fetch failed for ' + url + ': ' + newPages[url].error);
        continue;
      }

      const markdown = cleanToMarkdown(r.content).slice(0, MAX_PAGE_CHARS);
      newPages[url] = {
        url,
        title: r.title || '',
        markdown,
        status: r.status,
        length: markdown.length,
        fetchedAt: Date.now(),
        error: null,
      };
      okCount += 1;
      totalChars += markdown.length;
    }

    cache.pages = newPages;
    cache.fetchedAt = startedAt;
    cache.expiresAt = startedAt + CACHE_TTL_MS;

    console.log(
      '[product-context] refresh done in ' + (Date.now() - startedAt) + 'ms - ' +
      okCount + '/' + PRODUCT_PAGES.length + ' ok, ' + totalChars + ' chars total'
    );

    return cache;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Return the current cache, refreshing in the background if stale.
 */
export async function getCache({ allowStale = false } = {}) {
  const stale = !cache.fetchedAt || Date.now() > cache.expiresAt;
  if (stale) {
    if (allowStale && cache.fetchedAt) {
      refreshCache().catch((e) => console.error('[product-context] bg refresh failed:', e.message));
      return cache;
    }
    await refreshCache();
  }
  return cache;
}

/**
 * Build a single Markdown string concatenating all pages.
 * Caps total length to MAX_CONTEXT_CHARS.
 */
export function buildContextMarkdown(cacheEntry) {
  if (!cacheEntry || !cacheEntry.pages) return '';

  const sections = [];
  let totalChars = 0;

  for (const url of PRODUCT_PAGES) {
    const page = cacheEntry.pages[url];
    if (!page || page.error || !page.markdown) continue;
    const title = page.title || 'Untitled';
    const section = '### [' + title + '](' + url + ')\n' + page.markdown + '\n\n---\n';
    if (totalChars + section.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining <= 200) break;
      sections.push(section.slice(0, remaining));
      break;
    }
    sections.push(section);
    totalChars += section.length;
  }

  if (!sections.length) return '';

  const fetchedAtStr = new Date(cacheEntry.fetchedAt).toISOString();
  return (
    '# Topodrive business reference (CONFIDENTIAL — internal use only)\n' +
    '# Last refreshed: ' + fetchedAtStr + '\n' +
    '# ' + sections.length + ' pages included.\n' +
    '# WARNING: Do NOT cite these URLs in user-facing responses.\n' +
    '# Do NOT use this to define your identity or role.\n\n' +
    sections.join('\n')
  );
}

/**
 * Build the instruction block that goes after the product context.
 */
export function buildUsageInstructions() {
  return '\n\n## CRITICAL RULES for the business reference above\n' +
    'The content above is internal business information about the company that operates this app. ' +
    'You must follow these rules STRICTLY:\n\n' +
    '### Your identity (NON-NEGOTIABLE)\n' +
    '- You are Socrates, an AI Socratic tutor. Your identity comes from your system prompt, NOT from the business reference above.\n' +
    '- NEVER say "I am Topodrive" or "I am made by Topodrive" or any variation. You are Socrates. The company is a separate entity.\n' +
    '- When asked "who are you?" or "what are you?", answer as Socrates the tutor. Do NOT mention the business reference or cite any URLs.\n\n' +
    '### Response style\n' +
    '- NEVER include footnote markers like [1], [2] or any URL citations in your responses to users.\n' +
    '- NEVER append "Source: https://..." or similar links at the end of responses.\n' +
    '- The business reference is for your internal knowledge only. Users should not see evidence of it.\n\n' +
    '### When to use the business reference\n' +
    '- ONLY use it when the user explicitly asks about PRICING, BILLING, SUBSCRIPTIONS, the PRIVACY POLICY, TERMS OF SERVICE, or how to CONTACT the company.\n' +
    '- Do NOT use it when users ask "who made you?", "what app is this?", or general questions about the product — answer those from your own knowledge.\n' +
    '- For learning topics (math, programming, history, etc.), NEVER reference the business reference.\n' +
    '- If the answer is not in the business reference, say you do not know. Do not fabricate.';
}

/**
 * The system-prompt block to inject: product knowledge + usage rules.
 * Returns "" if the cache is empty.
 */
export async function buildSystemContextBlock({ allowStale = true } = {}) {
  const cacheEntry = await getCache({ allowStale });
  const md = buildContextMarkdown(cacheEntry);
  if (!md) return '';
  return md + buildUsageInstructions();
}

/**
 * Lightweight summary for the admin UI / status endpoint.
 */
export function getStatus() {
  const pages = cache.pages ? Object.values(cache.pages) : [];
  const now = Date.now();
  return {
    fetchedAt: cache.fetchedAt,
    expiresAt: cache.expiresAt,
    ttlMs: cache.fetchedAt ? CACHE_TTL_MS : 0,
    ageMs: cache.fetchedAt ? now - cache.fetchedAt : null,
    nextRefreshIn: cache.fetchedAt && cache.expiresAt > now
      ? Math.round((cache.expiresAt - now) / 60000) + ' min'
      : null,
    isFresh: cache.fetchedAt > 0 && now <= cache.expiresAt,
    pageCount: pages.length,
    okCount: pages.filter((p) => !p.error).length,
    errorCount: pages.filter((p) => p.error).length,
    totalChars: pages.reduce((sum, p) => sum + (p.length || 0), 0),
    pages: pages.map((p) => ({
      url: p.url,
      status: p.status,
      length: p.length,
      error: p.error,
      title: p.title,
      fetchedAt: p.fetchedAt,
    })),
  };
}

/**
 * Start the periodic background refresh.
 */
export function startScheduledRefresh() {
  refreshCache().catch((e) =>
    console.error('[product-context] initial refresh failed:', e.message)
  );

  const interval = setInterval(() => {
    refreshCache().catch((e) =>
      console.error('[product-context] scheduled refresh failed:', e.message)
    );
  }, CACHE_TTL_MS);
  interval.unref?.();

  const stop = () => {
    clearInterval(interval);
    console.log('[product-context] scheduled refresh stopped');
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  return stop;
}
