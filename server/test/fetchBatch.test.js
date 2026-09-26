// @ts-check
/**
 * Unit tests for src/services/fetchBatch.js — the SSRF-defended
 * URL fetcher. This module is the ONLY public-facing endpoint that
 * fetches arbitrary user-supplied URLs (`POST /api/fetch-batch`),
 * so a bypass here is the most impactful single vulnerability in
 * the codebase.
 *
 * We test three layers of defence:
 *   1. isPrivateIp(addr)  — every IPv4 / IPv6 private range
 *   2. resolveAndPin(host) — DNS-time rejection + 3s timeout
 *   3. fetchBatch(urls)   — scheme validation, redirect-to-private
 *      rejection, content-type filtering, redirect-loop cap
 *
 * NOTE: fetchBatch.js imports contentExtractor.js, which lazily boots a
 * worker_threads pool. The suite closes that pool explicitly so strict test
 * mode can detect any future handle leak without relying on force-exit.
 *
 * Run with: npm test
 */
import { test, describe, mock, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';

import { fetchBatch, WEB_FETCH_TOOL } from '../src/services/fetchBatch.js';
import { executeWebFetch } from '../src/routes/chat/pipeline/executors/webFetch.js';
import { formatToolResultContent } from '../src/routes/chat/pipeline/toolFeedback.js';
import { stopContentExtractorPool } from '../src/services/contentExtractor.js';

const ORIG_DNS_LOOKUP = dns.lookup;
const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  dns.lookup = ORIG_DNS_LOOKUP;
  globalThis.fetch = ORIG_FETCH;
});

after(async () => {
  await stopContentExtractorPool();
});

/* ── DNS stub ─────────────────────────────────────────────────── */

/** Stub dns.lookup so tests don't hit real DNS. */
function stubDns(recordsByHostname) {
  dns.lookup = async (hostname /* , opts */) => {
    const records = recordsByHostname[hostname];
    if (!records) throw new Error(`No DNS stub for ${hostname}`);
    /* The real impl returns an array when called with { all: true }. */
    return records.map((r) => (typeof r === 'string' ? { address: r, family: 4 } : r));
  };
}

/* ── fetch stub ───────────────────────────────────────────────── */

function makeResponse({ status = 200, headers = {}, body = '' } = {}) {
  return new Response(body, { status, headers });
}

function makeRedirect(location, status = 302) {
  return new Response(null, { status, headers: { location } });
}

/* ── isPrivateIp ─────────────────────────────────────────────── */
/* Re-implement the helper's logic by importing the file's exports
 * is not possible (it is not exported), so we replicate the exact
 * rules in the SSRF expectations below. The strongest test is the
 * end-to-end fetchBatch() rejecting URLs that resolve to those
 * IPs — which we cover extensively below. */

/* ── fetchBatch: input validation ────────────────────────────── */

describe('fetchBatch — input validation', () => {
  test('rejects non-array input with a thrown error', async () => {
    await assert.rejects(() => fetchBatch(null), /urls must be an array/);
    await assert.rejects(() => fetchBatch('https://example.com'), /urls must be an array/);
    await assert.rejects(() => fetchBatch({ url: 'x' }), /urls must be an array/);
  });

  test('caps the input at 10 URLs (extra URLs are silently ignored)', async () => {
    /* The contract is "maxUrls = 10" — extra entries are dropped.
       We assert by counting fetch calls and the result-array size. */
    stubDns({ 'a.test': [{ address: '93.184.216.34', family: 4 }] });
    const fetchCalls = [];
    globalThis.fetch = mock.fn(async (url) => {
      fetchCalls.push(url);
      return makeResponse({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><title>t</title></html>' });
    });

    const urls = Array.from({ length: 15 }, (_, i) => `https://a.test/${i}`);
    const out = await fetchBatch(urls);
    assert.equal(fetchCalls.length, 10, 'only first 10 URLs fetched');
    /* The result array follows the slice length, so it's also 10.
       (The caller passes a shorter list next time — there is no
       signal that URLs were dropped beyond the count.) */
    assert.equal(out.results.length, 10, 'result array follows the slice length');
  });
});

/* ── fetchBatch: scheme validation ───────────────────────────── */

describe('fetchBatch — scheme validation', () => {
  test('rejects file:// URLs', async () => {
    const out = await fetchBatch(['file:///etc/passwd']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /non-http/);
  });

  test('rejects ftp:// URLs', async () => {
    const out = await fetchBatch(['ftp://example.com/x']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /non-http/);
  });

  test('rejects javascript: URLs', async () => {
    const out = await fetchBatch(['javascript:alert(1)']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /non-http/);
  });

  test('rejects data: URLs', async () => {
    const out = await fetchBatch(['data:text/html,<script>alert(1)</script>']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /non-http/);
  });

  test('rejects invalid URLs', async () => {
    const out = await fetchBatch(['not-a-url-at-all']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /invalid URL/);
  });
});

/* ── fetchBatch: SSRF defence via DNS ────────────────────────── */

describe('fetchBatch — SSRF defence (DNS resolution)', () => {
  test('blocks URLs resolving to 10.0.0.0/8 (RFC 1918)', async () => {
    stubDns({ 'internal.test': [{ address: '10.1.2.3', family: 4 }] });
    const out = await fetchBatch(['https://internal.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /private IP|Blocked/);
  });

  test('blocks URLs resolving to 192.168.x.x (RFC 1918)', async () => {
    stubDns({ 'router.local': [{ address: '192.168.1.1', family: 4 }] });
    const out = await fetchBatch(['http://router.local/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks URLs resolving to 172.16-31.x.x (RFC 1918)', async () => {
    stubDns({ 'docker.local': [{ address: '172.17.0.2', family: 4 }] });
    const out = await fetchBatch(['http://docker.local/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks URLs resolving to 127.0.0.0/8 (loopback)', async () => {
    stubDns({ 'localhost': [{ address: '127.0.0.1', family: 4 }] });
    const out = await fetchBatch(['http://localhost:8080/admin']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks URLs resolving to 169.254.x.x (link-local / cloud metadata)', async () => {
    /* 169.254.169.254 is the AWS / GCP / Azure instance metadata
       endpoint — the canonical SSRF target. */
    stubDns({ 'metadata.aws': [{ address: '169.254.169.254', family: 4 }] });
    const out = await fetchBatch(['http://metadata.aws/latest/meta-data/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks URLs resolving to CGNAT 100.64-127.x.x', async () => {
    stubDns({ 'cgnat.test': [{ address: '100.64.0.1', family: 4 }] });
    const out = await fetchBatch(['https://cgnat.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks URLs resolving to 0.0.0.0 (unspecified)', async () => {
    stubDns({ 'wildcard.test': [{ address: '0.0.0.0', family: 4 }] });
    const out = await fetchBatch(['http://wildcard.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks URLs resolving to multicast / reserved 224.0.0.0/4', async () => {
    stubDns({ 'mcast.test': [{ address: '239.0.0.1', family: 4 }] });
    const out = await fetchBatch(['http://mcast.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks IPv6 loopback (::1)', async () => {
    stubDns({ 'ip6-localhost': [{ address: '::1', family: 6 }] });
    const out = await fetchBatch(['http://ip6-localhost/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks IPv6 ULA (fc00::/7)', async () => {
    stubDns({ 'ip6-ula': [{ address: 'fc00::1', family: 6 }] });
    const out = await fetchBatch(['http://ip6-ula/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks IPv6 link-local (fe80::/10)', async () => {
    stubDns({ 'ip6-ll': [{ address: 'fe80::1', family: 6 }] });
    const out = await fetchBatch(['http://ip6-ll/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('blocks IPv4-mapped IPv6 addresses pointing at private space', async () => {
    /* ::ffff:10.0.0.1 normalises to 10.0.0.1 (private). The bypass
       attempt "use an IPv6 literal to smuggle an IPv4 private IP"
       must be caught. */
    stubDns({ 'smuggle.test': [{ address: '::ffff:10.0.0.1', family: 6 }] });
    const out = await fetchBatch(['https://smuggle.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('rejects when ANY resolved address is private (multi-A records)', async () => {
    /* DNS load balancing often returns multiple A records. If
       even ONE is private, the whole hostname is suspect — the
       resolver could be rotating through them and one unlucky
       hop would land in private space. */
    stubDns({ 'mixed.test': [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ] });
    const out = await fetchBatch(['https://mixed.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private IP/);
  });

  test('passes through public IPs (allow-list is not over-restrictive)', async () => {
    stubDns({ 'public.test': [{ address: '93.184.216.34', family: 4 }] });
    let fetchCalled = false;
    globalThis.fetch = mock.fn(async () => {
      fetchCalled = true;
      return makeResponse({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><title>t</title></html>' });
    });
    const out = await fetchBatch(['https://public.test/']);
    assert.equal(out.results[0].ok, true);
    assert.equal(fetchCalled, true);
  });
});

/* ── fetchBatch: redirect defence ────────────────────────────── */

describe('fetchBatch — redirect chain defence', () => {
  test('rejects redirect with no Location header', async () => {
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    globalThis.fetch = mock.fn(async () =>
      new Response(null, { status: 302, headers: {} }),
    );
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /no Location/);
  });

  test('rejects redirect to a non-http(s) scheme', async () => {
    stubDns({
      'a.test': [{ address: '8.8.8.8', family: 4 }],
      'b.test': [{ address: '8.8.4.4', family: 4 }],
    });
    let hop = 0;
    globalThis.fetch = mock.fn(async () => {
      hop++;
      if (hop === 1) return makeRedirect('file:///etc/passwd');
      return makeResponse({ status: 200, headers: { 'content-type': 'text/html' } });
    });
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /non-http.*redirect|non-http/);
  });

  test('rejects redirect to a private IP (the canonical SSRF bypass)', async () => {
    /* The classic SSRF attack: a public URL redirects to
       http://169.254.169.254/latest/meta-data/. The redirect
       walker must re-validate every hop. */
    stubDns({
      'public.test': [{ address: '8.8.8.8', family: 4 }],
      // private.test resolves to AWS metadata — must be blocked.
      'private.test': [{ address: '169.254.169.254', family: 4 }],
    });
    let hop = 0;
    globalThis.fetch = mock.fn(async (url) => {
      hop++;
      if (hop === 1) return makeRedirect('http://private.test/admin');
      /* The second hop should never execute — the redirect walker
         blocks the request before issuing it. */
      return makeResponse({ status: 200, headers: { 'content-type': 'text/html' } });
    });
    const out = await fetchBatch(['https://public.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked.*private|redirect.*private|private IP/);
    assert.equal(hop, 1, 'no second fetch issued once redirect target was blocked');
  });

  test('rejects redirect to a 10.x address even if the hostname resolves to public IPs initially', async () => {
    /* A hostname that LOOKS public can resolve to private IPs at
       redirect time. The walker must re-resolve and re-validate. */
    stubDns({
      'public.test': [{ address: '8.8.8.8', family: 4 }],
      'looks-public.test': [{ address: '10.0.0.1', family: 4 }],
    });
    let hop = 0;
    globalThis.fetch = mock.fn(async () => {
      hop++;
      if (hop === 1) return makeRedirect('http://looks-public.test/');
      return makeResponse({ status: 200, headers: { 'content-type': 'text/html' } });
    });
    const out = await fetchBatch(['https://public.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /Blocked/);
    assert.equal(hop, 1, 'second hop blocked at DNS resolution');
  });

  test('caps the redirect chain at 10 hops', async () => {
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    let hop = 0;
    globalThis.fetch = mock.fn(async () => {
      hop++;
      /* Always redirect back to the same URL so the walker keeps going. */
      return makeRedirect(`https://a.test/hop/${hop}`);
    });
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, false);
    /* Either "Too many redirects" or eventually successful —
       we just assert the chain was bounded. */
    assert.ok(hop <= 12, `redirect walker issued too many hops: ${hop}`);
  });

  test('follows a redirect chain that stays on public IPs', async () => {
    stubDns({
      'a.test': [{ address: '8.8.8.8', family: 4 }],
      'b.test': [{ address: '8.8.4.4', family: 4 }],
    });
    let hop = 0;
    globalThis.fetch = mock.fn(async (url) => {
      hop++;
      if (url.endsWith('/initial')) return makeRedirect('https://b.test/final');
      return makeResponse({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Final</title><p>hello</p></html>',
      });
    });
    const out = await fetchBatch(['https://a.test/initial']);
    assert.equal(out.results[0].ok, true);
    assert.equal(out.results[0].title, 'Final');
  });
});

/* ── fetchBatch: response handling ───────────────────────────── */

describe('fetchBatch — response handling', () => {
  test('returns a structured ok:false on non-2xx HTTP status', async () => {
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    globalThis.fetch = mock.fn(async () => makeResponse({ status: 503 }));
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /HTTP 503/);
  });

  test('rejects non-text / non-html content types', async () => {
    /* Binary blobs would crash the readability extraction and
       bloat the LLM context — refuse them up front. */
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    globalThis.fetch = mock.fn(async () =>
      makeResponse({ status: 200, headers: { 'content-type': 'application/octet-stream' }, body: '\x00\x01' }),
    );
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /content type|Unsupported/);
  });

  test('truncates response bodies larger than 200 KB', async () => {
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    const huge = '<html><title>Big</title>' + 'x'.repeat(500_000) + '</html>';
    globalThis.fetch = mock.fn(async () =>
      makeResponse({ status: 200, headers: { 'content-type': 'text/html' }, body: huge }),
    );
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, true);
    assert.equal(out.results[0].truncated, true);
    assert.ok(out.results[0].content.length <= 200_000, 'body truncated to <=200KB');
  });

  test('web_fetch continues beyond 20k and the ordinary 200 KB page limit', async () => {
    stubDns({ 'paged.test': [{ address: '8.8.8.8', family: 4 }] });
    const body = 'A'.repeat(220_000) + 'PAGED_MARKER' + 'B'.repeat(25_000);
    globalThis.fetch = mock.fn(async () => makeResponse({ headers: { 'content-type': 'text/plain' }, body }));
    const events = [];
    const ctx = { emitter: { event: (_name, payload) => events.push(payload) } };
    const call = { id: 'fetch-page', function: { name: 'web_fetch' } };
    const url = 'https://paged.test/article';
    const first = await executeWebFetch({ url }, call, ctx, { activeToolNames: [] });
    assert.match(first.result.output, /\[range: 0-20000 of \d+ available chars\]/);
    assert.match(first.result.output, /\[has_more: yes\]/);
    assert.match(first.result.output, /\[next_offset: 20000\]/);
    const later = await executeWebFetch({ url, offset: 220_000, max_chars: 100 }, call, ctx, { activeToolNames: [] });
    assert.match(later.result.output, /PAGED_MARKER/);
    assert.match(later.result.output, /\[range: 220000-220100 of \d+ available chars\]/);
    assert.equal(events[1].hasMore, true);
    assert.equal(globalThis.fetch.mock.calls.length, 1, 'continuation should reuse extracted page');
    assert.equal(WEB_FETCH_TOOL.function.parameters.properties.offset.type, 'integer');
    assert.equal(WEB_FETCH_TOOL.function.parameters.properties.max_chars.maximum, 30_000);
  });

  test('continuation without its earlier snapshot asks to restart instead of mixing pages', async () => {
    const ctx = { emitter: { event: () => {} } };
    const call = { id: 'missing-snapshot', function: { name: 'web_fetch' } };
    const result = await executeWebFetch({ url: 'https://uncached.test/page', offset: 20000 }, call, ctx, { activeToolNames: [] });
    assert.equal(result.result.errorCode, 'page_cache_miss');
    assert.match(formatToolResultContent('web_fetch', result.result), /restart this URL at offset 0/i);
  });

  test('a source cap is not misreported as another readable page', async () => {
    stubDns({ 'bounded.test': [{ address: '8.8.8.8', family: 4 }] });
    globalThis.fetch = mock.fn(async () => makeResponse({ headers: { 'content-type': 'text/plain' }, body: 'Z'.repeat(1_050_000) }));
    const events = [];
    const ctx = { emitter: { event: (_name, payload) => events.push(payload) } };
    const call = { id: 'bounded', function: { name: 'web_fetch' } };
    const url = 'https://bounded.test/page';
    await executeWebFetch({ url }, call, ctx, { activeToolNames: [] });
    const response = await executeWebFetch({ url, offset: 999_500, max_chars: 1000 }, call, ctx, { activeToolNames: [] });
    assert.match(response.result.output, /\[source_truncated: yes/);
    assert.match(response.result.output, /\[has_more: no\]/);
    assert.equal(events[1].hasMore, false);
    assert.equal(events[1].sourceTruncated, true);
    const invalid = await executeWebFetch({ url, offset: 1_000_000 }, call, ctx, { activeToolNames: [] });
    assert.equal(invalid.result.errorCode, 'offset_out_of_range');
    assert.match(formatToolResultContent('web_fetch', invalid.result), /restart at offset 0/i);
    assert.equal(globalThis.fetch.mock.calls.length, 1);
  });

  test('a larger tool read does not reuse a truncated 200 KB HTTP validator', async () => {
    stubDns({ 'expand.test': [{ address: '8.8.8.8', family: 4 }] });
    const body = 'A'.repeat(250_000);
    const sentHeaders = [];
    globalThis.fetch = mock.fn(async (_url, opts) => {
      sentHeaders.push(opts.headers);
      if (opts.headers['If-None-Match']) return makeResponse({ status: 304 });
      return makeResponse({ headers: { 'content-type': 'text/plain', etag: '"version1"' }, body });
    });
    const url = 'https://expand.test/page';
    const first = await fetchBatch([url]);
    const second = await fetchBatch([url], { maxBytes: 1_000_000 });
    assert.equal(first.results[0].truncated, true);
    assert.equal(sentHeaders[1]['If-None-Match'], undefined);
    assert.ok(second.results[0].content.length > 200_000);
  });

  test('returns ok:true with extracted title on a successful HTML fetch', async () => {
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    globalThis.fetch = mock.fn(async () =>
      makeResponse({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>My Page</title><p>Hello world</p></html>',
      }),
    );
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, true);
    assert.equal(out.results[0].title, 'My Page');
    assert.match(out.results[0].content, /Hello world/);
  });

  test('handles fetch throwing (network error)', async () => {
    stubDns({ 'a.test': [{ address: '8.8.8.8', family: 4 }] });
    globalThis.fetch = mock.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    /* AllSettled wraps the throw — Promise.allSettled returns
       the rejection but fetchBatch maps it to a structured entry. */
    const out = await fetchBatch(['https://a.test/']);
    assert.equal(out.results[0].ok, false);
    assert.match(out.results[0].reason, /ECONNREFUSED|Fetch failed/);
  });

  test('parallel: returns one entry per input URL even when some fail', async () => {
    stubDns({
      'good.test': [{ address: '8.8.8.8', family: 4 }],
      'bad.test': [{ address: '10.0.0.1', family: 4 }],
    });
    globalThis.fetch = mock.fn(async (url) =>
      makeResponse({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html><title>t</title></html>' }),
    );
    const out = await fetchBatch(['https://good.test/', 'https://bad.test/']);
    assert.equal(out.results.length, 2);
    assert.equal(out.results[0].ok, true);
    assert.equal(out.results[1].ok, false);
    assert.match(out.results[1].reason, /private IP/);
  });
});
