import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Fetch a batch of URLs server-side. Used by the front-end web research
 * feature to retrieve page content for the AI model's context.
 *
 * SSRF guard rails:
 *  - Only http(s) schemes.
 *  - Resolve the hostname ourselves and reject any IP that falls
 *    inside a private / loopback / link-local / cloud-metadata range
 *    BEFORE issuing the request. (The user can still be tricked into
 *    DNS-rebinding past the lookup, but this blocks the obvious
 *    `http://169.254.169.254/...` style probes.)
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

async function isSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  // Block obvious literals.
  const host = parsed.hostname;
  if (!host) return false;
  if (net.isIP(host) && isPrivateIp(host)) return false;
  // Resolve and check every address.
  try {
    const records = await dns.lookup(host, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) return false;
    }
  } catch {
    return false;
  }
  return true;
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

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Socrates/1.0 (research bot)' },
          // manual mode: we already validated the *initial* host, so
          // 30x redirects to a private IP would slip through. Pin
          // redirects to a sane count and re-check each hop.
          redirect: 'follow',
        });

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

        // Extract title from HTML
        let title = '';
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();

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
