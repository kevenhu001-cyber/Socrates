import dns from 'node:dns/promises';
import net from 'node:net';
import {Agent} from 'undici';
import {extractArticle} from './contentExtractor.js';
import {fetchWithRust, rustExtractionEnabled, type RustFetchResponse} from './rustFetchWorker.js';
import * as urlCache from '../lib/urlCache.js';

interface ExtractedArticle {
  title?: string;
  content?: string;
  excerpt?: string;
  length?: number;
  date?: string;
  method?: string;
  truncated?: boolean;
}

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
 *   - The native canary may return a bounded Rust text-density extraction;
 *     otherwise run each page through `extractArticle` (Mozilla Readability
 *     with a text-density fallback). The returned `content` field is
 *     boilerplate-cleaned text, not raw HTML. The LLM context builder can
 *     pass it straight into the prompt.
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
function isPrivateIp(addr: string): boolean {
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
async function resolveAndPin(hostname: string) {
  const records = await Promise.race([
    dns.lookup(hostname, { all: true }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns-timeout')), 3000)),
  ]);
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error(`Blocked: ${hostname} resolves to private IP ${r.address}`);
    }
  }
  return records;
}

/**
 * Create an undici Agent whose connector pins DNS to pre-resolved
 * addresses. Passed to fetch() via the `dispatcher` option so the
 * actual TCP connection uses the exact IPs we already validated —
 * this closes the DNS-rebinding (TOCTOU) window between our lookup
 * and the connect. Node's built-in fetch ignores the http.Agent
 * `agent` option; it only honours an undici dispatcher, so the
 * previous `agent` wiring silently disabled pinning entirely.
 */
function createPinnedAgent(addresses: { address: string; family: number }[]) {
  // undici's connector invokes lookup with all-addresses semantics: the
  // callback must yield an array of { address, family } records (NOT the
  // single-address `net.LookupFunction` form, which makes undici read an
  // undefined address). Every record here was already validated as a
  // public IP by resolveAndPin, so returning the full set lets undici
  // round-robin / retry across them while staying pinned.
  const lookup = (
    _hostname: string,
    _opts: unknown,
    cb: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void,
  ) => {
    cb(null, addresses.map((a) => ({ address: a.address, family: a.family })));
  };
  // TLS still validates against the request hostname (undici sets the
  // SNI/servername from the URL); only the resolved IP is pinned.
  return new Agent({ connect: { lookup: lookup as never, rejectUnauthorized: true } });
}

/**
 * Convert the native worker's bounded raw response into the legacy
 * fetchBatch shape. Keeping extraction and URL-cache ownership in Node makes
 * the Rust cutover reversible and preserves the existing Readability output.
 */
async function materializeRustResponse(url: string, cached: urlCache.CacheEntry | null, raw: RustFetchResponse, maxChars: number) {
  if (!raw.ok) {
    return { ok: false, url, code: raw.code || (raw.status ? 'http_status' : 'fetch_failed'), reason: raw.reason || (raw.status ? `HTTP ${raw.status}` : 'Fetch failed') };
  }

  if (raw.status === 304) {
    if (!cached) return { ok: false, url, code: 'cache_miss', reason: 'HTTP 304 without a cached response' };
    let extracted: ExtractedArticle | null = null;
    try { extracted = (await extractArticle(cached.html, raw.finalUrl || url, maxChars > 200_000 ? { maxChars } : {})) as unknown as ExtractedArticle; } catch { extracted = null; }
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
        truncated: Boolean(cached.truncated || extracted.truncated),
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

  const text = String(raw.body || '');
  const truncated = Boolean(raw.truncated);
  const contentType = raw.headers?.['content-type'] || '';
  const etag = raw.headers?.etag || undefined;
  const lastModified = raw.headers?.['last-modified'] || undefined;
  if (etag || lastModified) {
    urlCache.set(url, {
      url,
      status: raw.status,
      etag,
      lastModified,
      contentType,
      html: text,
      bytes: text.length,
      fetchedAt: Date.now(),
      truncated,
    });
  }

  let title = '';
  const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  const extractionUrl = raw.finalUrl || url;
  if (raw.article) {
    return {
      ok: true,
      url,
      title: raw.article.title || title,
      content: raw.article.content || text,
      excerpt: raw.article.excerpt,
      wordCount: raw.article.length,
      pageDate: raw.article.date || undefined,
      method: raw.article.method,
      rawHtml: text,
      truncated,
      chars: text.length,
    };
  }
  let extracted: ExtractedArticle | null = null;
  try { extracted = (await extractArticle(text, extractionUrl, maxChars > 200_000 ? { maxChars } : {})) as unknown as ExtractedArticle; } catch { extracted = null; }
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
      truncated: Boolean(truncated || extracted.truncated),
      chars: text.length,
    };
  }
  return { ok: true, url, title, content: text, truncated, chars: text.length };
}

/** True when the response advertises a PDF body. `octet-stream` +
    a .pdf path covers servers that mislabel downloads. */
function isPdfContent(contentType: string, url: string): boolean {
  if (/application\/pdf\b/i.test(contentType)) return true;
  return /octet-stream/i.test(contentType) && /\.pdf(?:[?#]|$)/i.test(url);
}

/**
 * Binary counterpart of readBoundedText: PDF bodies cannot survive the
 * UTF-8 decode (replacement chars corrupt the xref tables), so they are
 * accumulated as bytes and handed to pdf-parse.
 */
async function readBoundedBuffer(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return { buffer: Buffer.alloc(0), truncated: false };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let finished = false;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { finished = true; break; }
      const remaining = maxBytes - bytes;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, Math.max(0, remaining)));
        truncated = true;
        break;
      }
      chunks.push(value);
      bytes += value.byteLength;
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))), truncated };
}

/* pdf-parse ships with the server for attachmentReader; reuse it here so
   papers, reports and standards documents stop being a research blind
   spot. Dynamic import keeps startup cost off the hot path. */
async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number } | null> {
  try {
    const mod = await import('pdf-parse');
    const pdfParse = (mod as { default?: unknown }).default || mod;
    const result = await (pdfParse as (b: Uint8Array) => Promise<{ text?: string; numpages?: number }>)(new Uint8Array(buffer));
    return { text: String(result?.text || ''), pageCount: Number(result?.numpages || 0) };
  } catch {
    return null;
  }
}

async function readBoundedText(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  let finished = false;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { finished = true; break; }
      const remaining = maxBytes - bytes;
      if (value.byteLength > remaining) {
        text += decoder.decode(value.subarray(0, remaining), { stream: true });
        truncated = true;
        break;
      }
      text += decoder.decode(value, { stream: true });
      bytes += value.byteLength;
    }
    text += decoder.decode();
  } finally {
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { text, truncated };
}

export async function fetchBatch(urls: string[], options: { maxBytes?: number } = {}) {
  if (!Array.isArray(urls)) throw new Error('urls must be an array');
  const maxUrls = 10;
  const requestedMaxBytes = options.maxBytes;
  const maxSize = Math.min(1_000_000, Math.max(200_000, typeof requestedMaxBytes === 'number' && Number.isFinite(requestedMaxBytes) ? Math.floor(requestedMaxBytes) : 200_000)); // 200 KB by default, 1 MB for tool reads
  const timeout = 10_000; // 10s per page

  const results = await Promise.allSettled(
    urls.slice(0, maxUrls).map(async (url) => {
      // Validate URL scheme and parse.
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return { ok: false, url, code: 'invalid_url', reason: 'Blocked: invalid URL' };
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { ok: false, url, code: 'invalid_scheme', reason: 'Blocked: non-http(s) URL' };
      }

      // Phase 2: build conditional-GET headers from the URL cache.
      const cached = urlCache.get(url);
      const reusableCache = cached && cached.bytes <= maxSize && !(cached.truncated && cached.bytes < maxSize) ? cached : null;
      const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' };
      if (reusableCache) {
        if (reusableCache.etag) headers['If-None-Match'] = reusableCache.etag;
        if (reusableCache.lastModified) headers['If-Modified-Since'] = reusableCache.lastModified;
      }

      // The native worker is opt-in in tests and automatically falls back
      // when its binary is absent. It owns DNS/HTTP/redirect policy; Node
      // continues to own extraction, cache semantics, and the public shape.
      const rustResponse = await fetchWithRust({
        url,
        headers,
        maxBytes: maxSize,
        maxRedirects: 10,
        timeoutMs: timeout,
        extract: rustExtractionEnabled() && maxSize <= 200_000,
      });
      if (rustResponse) {
        /* PDF bodies are binary — the worker decodes them as UTF-8 text,
           which corrupts the bytes before pdf-parse can see them. Fall
           through to the Node path, which reads bytes for PDFs. */
        const rustContentType = String(rustResponse.headers?.['content-type'] || '');
        if (!isPdfContent(rustContentType, url)) {
          return materializeRustResponse(url, reusableCache, rustResponse, maxSize);
        }
      }

      // Resolve DNS and pin the IP to prevent DNS rebinding.
      let pinnedRecords;
      try {
        pinnedRecords = await resolveAndPin(parsedUrl.hostname);
      } catch (err) {
        return { ok: false, url, code: 'dns_failure', reason: (err as Error).message };
      }
      let dispatcher = createPinnedAgent(pinnedRecords);

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
            dispatcher,
            redirect: 'manual',
          } as unknown as RequestInit);

          // 30x: validate the Location header before following.
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) {
              return { ok: false, url, code: 'redirect_missing_location', reason: 'Redirect with no Location header' };
            }
            const nextUrl = new URL(location, currentUrl).href;
            const nextParsed = new URL(nextUrl);
            if (nextParsed.protocol !== 'http:' && nextParsed.protocol !== 'https:') {
              return { ok: false, url, code: 'redirect_invalid_scheme', reason: 'Blocked: redirect to non-http(s) URL' };
            }
            // Re-resolve if the hostname changed.
            if (nextParsed.hostname !== currentParsed.hostname) {
              try {
                const nextRecords = await resolveAndPin(nextParsed.hostname);
                const previous = dispatcher;
                dispatcher = createPinnedAgent(nextRecords);
                previous.close().catch(() => {});
              } catch (err) {
                return { ok: false, url, code: 'redirect_dns_failure', reason: `Blocked: redirect to ${nextParsed.hostname} — ${(err as Error).message}` };
              }
            }
            currentUrl = nextUrl;
            redirectCount++;
            continue;
          }

          // Too many redirects.
          if (redirectCount === maxRedirects) {
            return { ok: false, url, code: 'too_many_redirects', reason: 'Too many redirects' };
          }

          // Phase 2: 304 Not Modified — rebuild from cached entry.
          if (response.status === 304 && reusableCache) {
            let extracted: ExtractedArticle | null = null;
            try { extracted = (await extractArticle(reusableCache.html, url, maxSize > 200_000 ? { maxChars: maxSize } : {})) as unknown as ExtractedArticle; } catch { extracted = null; }
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
                rawHtml: reusableCache.html,
                truncated: Boolean(reusableCache.truncated || extracted.truncated),
                chars: reusableCache.html.length,
                fromCache: true,
              };
            }
            return {
              ok: true,
              url,
              title: '',
              content: reusableCache.html,
              truncated: reusableCache.truncated || false,
              chars: reusableCache.html.length,
              fromCache: true,
            };
          }

          if (!response.ok) {
            return { ok: false, url, code: 'http_status', reason: `HTTP ${response.status}` };
          }

          const contentType = response.headers.get('content-type') || '';

          /* PDFs get their own bounded-bytes read + pdf-parse extraction.
             Research sources (papers, government reports, spec sheets)
             are disproportionately PDF, so rejecting them here used to
             blind the whole fetch pipeline to primary sources. */
          if (isPdfContent(contentType, currentUrl)) {
            const { buffer, truncated } = await readBoundedBuffer(response, maxSize);
            const parsed = await extractPdfText(buffer);
            if (parsed && parsed.text.trim()) {
              return {
                ok: true,
                url,
                title: '',
                content: parsed.text.replace(/\r\n/g, '\n'),
                wordCount: parsed.pageCount,
                pageCount: parsed.pageCount,
                method: 'pdf',
                truncated,
                chars: buffer.length,
              };
            }
            return {
              ok: false,
              url,
              code: 'pdf_parse_failed',
              reason: 'Could not extract text from this PDF (it may be scanned images, encrypted, or corrupt).',
            };
          }

          if (!contentType.includes('text') && !contentType.includes('json') && !contentType.includes('html')) {
            return { ok: false, url, code: 'unsupported_content_type', reason: `Unsupported content type: ${contentType}` };
          }

          const { text, truncated } = await readBoundedText(response, maxSize);

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
          let extracted: ExtractedArticle | null = null;
          try { extracted = (await extractArticle(text, url, maxSize > 200_000 ? { maxChars: maxSize } : {})) as unknown as ExtractedArticle; } catch { extracted = null; }

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
              truncated: Boolean(truncated || extracted.truncated),
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
        return { ok: false, url, code: 'fetch_failed', reason: 'Unexpected loop exit' };
      } finally {
        clearTimeout(timer);
        dispatcher.close().catch(() => {});
      }
    })
  );

  return {
    results: results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { ok: false, url: urls[i], code: 'fetch_failed', reason: r.reason?.message || 'Fetch failed' };
    }),
  };
}

/* ─── Tool definition (sent to upstream on every chat turn) ───
 *
 * Reads a single page the model already has a URL for. Execution runs
 * through fetchBatch above, so it inherits the SSRF guard rails (scheme
 * allow-list, DNS pinning, private-IP rejection, per-hop redirect
 * re-validation) and the Readability main-content extraction. The
 * description steers the model to reach for web_search when it does not
 * yet have a concrete URL, and to avoid re-fetching content already in
 * its context.
 */
export const WEB_FETCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_fetch',
    description:
      '## What this tool does\n' +
      'Fetches web pages by URL and returns their main text content with boilerplate removed (Readability), plus the page title and, when available, its publication date. Provide a single `url`, or `urls` to read up to 4 pages in one call — batch mode is the cheapest way to triage several search results. http(s) pages returning text, HTML, or JSON are supported; PDF documents are parsed to text (page count reported). Other binaries (images, archives) are not.\n\n' +
      '## When to call\n' +
      '- The user gives a URL and asks what it says, or asks you to summarize or analyze it.\n' +
      '- A web_search result looks relevant and you need the full article text, not just the snippet.\n' +
      '- Several web_search results look promising — pass them together as `urls` instead of fetching one per call.\n' +
      '- You need to quote or verify a detail the search snippet does not contain.\n\n' +
      '## When NOT to call\n' +
      '- You do not have a concrete URL yet — call web_search first to find one.\n' +
      '- The relevant page text is already in your context (a [Referenced page] block or a prior web_fetch range this turn).\n' +
      '- The target needs a login — this tool cannot authenticate.\n\n' +
      '## Output\n' +
      'Each page returns at most max_chars of extracted text starting at offset (defaults: 20000 and 0; in batch mode offset is unsupported and each page starts at 0). Start at offset 0; then use next_offset with the same single url to continue when has_more is yes. Ranges are zero-based with an exclusive end and total available characters are reported. If the cached page snapshot expires, restart from offset 0. The source is read up to 1 MB of raw text; source_truncated means content beyond that limit is unavailable, even when has_more is no. Summarize in natural prose; do not paste raw page text back to the user.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The absolute http(s) URL of the page to fetch, including the scheme (for example https://example.com/article). Use this alone, or `urls` — not both.',
          minLength: 8,
          maxLength: 2000,
        },
        urls: {
          type: 'array',
          description: 'Batch mode: 1-4 absolute http(s) URLs fetched in parallel in one call. Each page is returned from its start (offset is unsupported in batch mode); reopen a single url with offset to page further.',
          items: { type: 'string', minLength: 8, maxLength: 2000 },
          minItems: 1,
          maxItems: 4,
        },
        offset: { type: 'integer', minimum: 0, maximum: 1000000, description: 'Character offset in the available extracted text; use next_offset to continue. Single-URL calls only.' },
        max_chars: { type: 'integer', minimum: 1, maximum: 30000, description: 'Maximum number of characters returned per page in this call (default 20000).' },
      },
      required: [],
      additionalProperties: false,
    },
  },
};
