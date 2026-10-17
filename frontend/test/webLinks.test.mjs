import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { fetchPagesForContext } from '../src/chat/webLinks.ts';

const dom = new JSDOM('', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const urls = ['https://example.com/page'];

test('page preparation preserves successful content and preview metadata', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    results: [{ ok: true, title: 'Reference', content: 'Verified page contents', truncated: true }],
  }), { headers: { 'content-type': 'application/json' } }));
  const result = await fetchPagesForContext(urls);
  assert.match(result.blocks[0], /Title: Reference/);
  assert.match(result.blocks[0], /Verified page contents/);
  assert.equal(result.results[0].ok, true);
});

test('page preparation has a deadline even if transport ignores abort', async (t) => {
  let signal;
  t.mock.method(globalThis, 'fetch', (_input, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const result = await fetchPagesForContext(urls, { timeoutMs: 10 });
  assert.equal(signal.aborted, true);
  assert.equal(result.results[0].ok, false);
  assert.match(result.blocks[0], /timed out/);
});

test('Stop cancels page preparation without waiting for its deadline', async (t) => {
  let signal;
  t.mock.method(globalThis, 'fetch', (_input, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const controller = new AbortController();
  const pending = fetchPagesForContext(urls, { signal: controller.signal, timeoutMs: 60_000 });
  controller.abort();
  const result = await pending;
  assert.equal(signal.aborted, true);
  assert.match(result.blocks[0], /cancelled/);
});
