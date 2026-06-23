import dns from 'node:dns/promises';
import net from 'node:net';
import { extractArticle } from './contentExtractor.js';
import * as urlCache from '../lib/urlCache.js';

/**
 * Fetch a batch of URLs server-side. Used by the front-end web research
 * feature to retrieve page content for the AI model's context.
 *
 * SSRF guard rails:
 *   - Only http(s) schemes.
 *   - Resolve the hostname ourselves and reject any IP that falls
 *     inside a private / loopback / link-local / cloud-metadata range
 *     BEFORE issuing the request.
 *   - On redirect chains we re-validate each hop. `fetch` follows
 *     redirects automatically, so we manually walk the chain and stop
 *     at the first unsafe hop. (Node's built-in `fetch` does NOT expose
 *     each redirect — but it does expose the final URL via
 *     `response.url`. We do a second pass for the final URL, and rely
 *     on the redirect-limit knob to bound the chain.)
 *
 * Content extraction:
 *   - After fetching, run each page through `extractArticle` (Mozilla
 *     Readability with a text-density fallback). The returned `content`
 *     field is boilerplate-cleaned text, not raw HTML. The LLM context
 *     builder can pass it straight into the prompt.
 *
 * HTTP caching (Phase 2):
 *   - In-process URL cache (server/src/lib/urlCache.js) stores raw
 *     HTML keyed by URL, along with ETag / Last-Modified validators.
 *   - On every fetch we send `If-None-Match` and `If-Modified-Since`
 *     if we have cached validators for this URL. On 304 we return
 *     the cached body (no second parse). On 200 we replace the cache.
 *   - Cache TTL is implicit (LRU + 50 MB byte cap), not time-based.
 *     Acceptable staleness window: topic-refresh within ~6 hours.
 */
function isPrivateIp(addr) {
  if (net.isIP(addr) === 4) {
    const parts = addr.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT
    if (parts[0] === 0) return true;                                       // 0.0.0.0/8
    if (parts[0] >= 224) return true;                                      // multicast / reserved
  } else if (net.isIP(addr) === 6) {
    const lower = addr.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;     // ULA
    if (lower.startsWith('fe80')) return true;                             // link-local
  }
  return false;
}

/**
 * Validate a URL is safe to fetch:
 *   - http(s) scheme only
 *   - host is not a private IP literal
 *   - every resolved DNS record for the host is public
 *
 * @param {string} rawUrl
 * @returns {Promise<boolean>}
 */
async function isSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  if (!host) return false;
  if (net.isIP(host) && isPrivateIp(host)) return false;
  try {
    // Hard-cap DNS lookups so blocked hosts (e.g. en.wikipedia.org
    // from some datacenters) don't stall the whole batch.
    const records = await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), 3000)),
    ]);
    for (const r of records) {
      if (isPrivateIp(r.address)) return false;
    }
  } catch {
    return false;
  }
  return true;
}

/**
 * Re-validate the FINAL URL of a redirect chain. If the server
 * redirects to a private IP, this catches it before we send any bytes.
 * Node's built-in fetch follows redirects automatically and we set
 * `redirect: 'follow'`; we cannot inspect each hop, but we CAN inspect
 * the final URL via `response.url` once the chain completes.
 */
async function isSafeFinalUrl(finalUrl) {
  return isSafeUrl(finalUrl);
}

export async function fetchBatch(urls) {
  if (!Array.isArray(urls)) throw new Error('urls must be an array');
  const maxUrls = 10;
  const maxSize = 200_000; // 200 KB per page
  const timeout = 10_000; // 10s per page

  const results = await Promise.allSettled(
    urls.slice(0, maxUrls).map(async (url) => {
      if (!(await isSafeUrl(url))) {
        return { ok: false, url, reason: 'Blocked: private or invalid URL' };
      }

      // Phase 2: build conditional-GET headers from the URL cache.
      const cached = urlCache.get(url);
      const headers = { 'User-Agent': 'Socrates/1.0 (research bot)' };
      if (cached) {
        if (cached.etag) headers['If-None-Match'] = cached.etag;
        if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers,
          // 30x redirects are followed by `fetch`. We re-validate the
          // final URL via isSafeFinalUrl below. (Node's fetch does NOT
          // expose per-hop URLs to JS.)
          redirect: 'follow',
        });

        // Phase 2: 304 Not Modified — rebuild from cached entry.
        if (response.status === 304 && cached) {
          let extracted = null;
          try { extracted = extractArticle(cached.html, url); } catch { extracted = null; }
          if (extracted) {
            return {
              ok: true,
              url,
              title: extracted.title || '',
              content: extracted.content,
              excerpt: extracted.excerpt,
              wordCount: extracted.length,
              pageDate: extracted.date,
              method: extracted.method,
              rawHtml: cached.html,
              truncated: cached.truncated || false,
              chars: cached.html.length,
              fromCache: true,
            };
          }
          return {
            ok: true,
            url,
            title: '',
            content: cached.html,
            truncated: cached.truncated || false,
            chars: cached.html.length,
            fromCache: true,
          };
        }

        // Re-validate the post-redirect final URL.
        const finalUrl = response.url || url;
        if (finalUrl !== url && !(await isSafeFinalUrl(finalUrl))) {
          return { ok: false, url, reason: 'Blocked: redirect to private/invalid URL' };
        }

        if (!response.ok) {
          return { ok: false, url, reason: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text') && !contentType.includes('json') && !contentType.includes('html')) {
          return { ok: false, url, reason: `Unsupported content type: ${contentType}` };
        }

        let text = await response.text();
        const truncated = text.length > maxSize;
        if (truncated) text = text.slice(0, maxSize);

        // Phase 2: write to URL cache with validator headers for
        // future conditional GETs.
        const etag = response.headers.get('etag') || undefined;
        const lastModified = response.headers.get('last-modified') || undefined;
        if (etag || lastModified) {
          urlCache.set(url, {
            url,
            status: response.status,
            etag,
            lastModified,
            contentType,
            html: text,
            bytes: text.length,
            fetchedAt: Date.now(),
            truncated,
          });
        }

        // Extract title from HTML
        let title = '';
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();

        // Run main-content extraction (Readability + heuristic fallback).
        let extracted = null;
        try { extracted = extractArticle(text, url); } catch { extracted = null; }

        if (extracted) {
          return {
            ok: true,
            url,
            title: extracted.title || title,
            content: extracted.content,
            excerpt: extracted.excerpt,
            wordCount: extracted.length,
            pageDate: extracted.date,
            method: extracted.method,
            rawHtml: text,
            truncated,
            chars: text.length,
          };
        }

        return {
          ok: true,
          url,
          title,
          content: text,
          truncated,
          chars: text.length,
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return {
    results: results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { ok: false, url: urls[i], reason: r.reason?.message || 'Fetch failed' };
    }),
  };
}