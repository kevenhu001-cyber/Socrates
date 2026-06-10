/**
 * Fetch a batch of URLs server-side. Used by the front-end web research
 * feature to retrieve page content for the AI model's context.
 */
export async function fetchBatch(urls) {
  if (!Array.isArray(urls)) throw new Error('urls must be an array');
  const maxUrls = 10;
  const maxSize = 200_000; // 200 KB per page
  const timeout = 10_000; // 10s per page

  const results = await Promise.allSettled(
    urls.slice(0, maxUrls).map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Socrates/1.0 (research bot)' },
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
