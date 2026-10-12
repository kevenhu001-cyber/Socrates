import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

/* Keep the cache small so the eviction path is exercised without allocating
 * the production 50 MB cap in a unit test process. */
process.env.URL_CACHE_MAX_BYTES = '10';
const cache = await import('../src/lib/urlCache.js');

const entry = (html, bytes = html.length) => ({
  url: 'https://example.test',
  status: 200,
  contentType: 'text/html',
  html,
  bytes,
  fetchedAt: 1,
  truncated: false,
});

beforeEach(() => {
  cache.clear();
  cache._resetStats();
});

test('url cache handles misses, hits, replacement and invalidation', () => {
  assert.equal(cache.get(''), null);
  assert.equal(cache.get('missing'), null);
  cache.set('', entry('ignored'));
  cache.set('bad', { html: 42 });
  assert.equal(cache.stats().entries, 0);

  cache.set('https://example.test', entry('abc', 0));
  assert.equal(cache.get('https://example.test').html, 'abc');
  cache.set('https://example.test', entry('updated', 7));
  assert.equal(cache.get('https://example.test').html, 'updated');
  cache.invalidate('missing');
  cache.invalidate('https://example.test');
  assert.equal(cache.get('https://example.test'), null);
});

test('url cache evicts oldest entries and reports hit rate', () => {
  cache.set('https://one.test', entry('12345678'));
  cache.set('https://two.test', entry('abcdefgh'));
  assert.equal(cache.get('https://one.test'), null);
  assert.equal(cache.get('https://two.test').html, 'abcdefgh');

  const stats = cache.stats();
  assert.equal(stats.entries, 1);
  assert.equal(stats.bytes, 8);
  assert.equal(stats.hitRate, 0.5);
});
