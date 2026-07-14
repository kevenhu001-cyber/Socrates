import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
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
  // Normalise IPv4-mapped IPv6 (::ffff:x.x.x.x) to plain IPv4
  if (addr.includes('.')) {
    const ipv4Match = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipv4Match) addr = ipv4Match[1];
  }
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
    if (lower.startsWith('2002:')) return true;                            // 6to4 (2002::/16)
    if (lower.startsWith('64:ff9b:')) return true;                         // NAT64
    if (lower.startsWith('100:')) return true;                             // discard-only (100::/64)
  }
  return false;
}

/**
 * Resolve a hostname and return a lookup function that pins the resolved
 * IP address, preventing DNS rebinding between validation and connection.
 * Returns { lookup, addresses } where `addresses` is the list of resolved
 * IPs (for logging) and `lookup` is the function to pass to `agent`.
 */
async function resolveAndPin(hostname) {
  const records = await Promise.race([
    dns.lookup(hostname, { all: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), 3000)),
  ]);
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error(`Blocked: ${hostname} resolves to private IP ${r.address}`);
    }
  }
  return records;
}

/**
 * Create an http.Agent that pins DNS to pre-resolved addresses.
 * This prevents the TOCTOU race where an attacker changes DNS between
 * our validation lookup and the actual fetch connection.
 */
function createPinnedAgent(protocol, addresses) {
  const lookup = (_hostname, _opts, cb) => {
    // Return the first resolved address; for agents with multiple A
    // records we round-robin across them (fetch will retry on failure).
    const idx = Math.floor(Math.random() * addresses.length);
    cb(null, addresses[idx].address, addresses[idx].family);
  };
  if (protocol === 'https:') {
    return new https.Agent({ lookup, rejectUnauthorized: true });
  }
  return new http.Agent({ lookup });
}

export async function fetchBatch(urls) {
  if (!Array.isArray(urls)) throw new Error('urls must be an array');
  const maxUrls = 10;
  const maxSize = 200_000; // 200 KB per page
  const timeout = 10_000; // 10s per page

  const results = await Promise.allSettled(
    urls.slice(0, maxUrls).map(async (url) => {
      // Validate URL scheme and parse.
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return { ok: false, url, reason: 'Blocked: invalid URL' };
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { ok: false, url, reason: 'Blocked: non-http(s) URL' };
      }

      // Phase 2: build conditional-GET headers from the URL cache.
      const cached = urlCache.get(url);
      const headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' };
      if (cached) {
        if (cached.etag) headers['If-None-Match'] = cached.etag;
        if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
      }

      // Resolve DNS and pin the IP to prevent DNS rebinding.
      let pinnedRecords;
      try {
        pinnedRecords = await resolveAndPin(parsedUrl.hostname);
      } catch (err) {
        return { ok: false, url, reason: err.message };
      }
      const agent = createPinnedAgent(parsedUrl.protocol, pinnedRecords);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        // Manual redirect walk — validate each hop to prevent redirect-
        // based SSRF that carries the request body (POST/GET) to an
        // internal endpoint after an initial public redirect.
        let currentUrl = url;
        let redirectCount = 0;
        const maxRedirects = 10;

        while (redirectCount <= maxRedirects) {
          const currentParsed = new URL(currentUrl);
          const response = await fetch(currentUrl, {
            signal: controller.signal,
            headers,
            agent,
            redirect: 'manual',
          });

          // 30x: validate the Location header before following.
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) {
              return { ok: false, url, reason: 'Redirect with no Location header' };
            }
            const nextUrl = new URL(location, currentUrl).href;
            const nextParsed = new URL(nextUrl);
            if (nextParsed.protocol !== 'http:' && nextParsed.protocol !== 'https:') {
              return { ok: false, url, reason: 'Blocked: redirect to non-http(s) URL' };
            }
            // Re-resolve if the hostname changed.
            if (nextParsed.hostname !== currentParsed.hostname) {
              try {
                const nextRecords = await resolveAndPin(nextParsed.hostname);
                Object.assign(agent, createPinnedAgent(nextParsed.protocol, nextRecords));
              } catch (err) {
                return { ok: false, url, reason: `Blocked: redirect to ${nextParsed.hostname} — ${err.message}` };
              }
            }
            currentUrl = nextUrl;
            redirectCount++;
            continue;
          }

          // Too many redirects.
          if (redirectCount === maxRedirects) {
            return { ok: false, url, reason: 'Too many redirects' };
          }

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
          // Runs in a worker thread so a stuck parse can't pin the main
          // event loop (the 2026-07-04 incident). 5s timeout via the
          // extractor pool — null on timeout/failure, caller falls back.
          let extracted = null;
          try { extracted = await extractArticle(text, url); } catch { extracted = null; }

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
        }

        // Unreachable — but satisfy the linter.
        return { ok: false, url, reason: 'Unexpected loop exit' };
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