import assert from 'node:assert/strict';
import test from 'node:test';

import { TtsCache, ttsCacheKey } from '../src/services/ttsCache.ts';

test('cache keys isolate per user and per request shape', () => {
  const a = ttsCacheKey('user-1', 'hello', 'alloy', 'mp3', 'en');
  const b = ttsCacheKey('user-2', 'hello', 'alloy', 'mp3', 'en');
  const c = ttsCacheKey('user-1', 'hello', 'alloy', 'mp3', 'en');
  const d = ttsCacheKey('user-1', 'hello', 'alloy', 'mp3', 'zh');
  assert.notEqual(a, b, 'different users never share audio');
  assert.equal(a, c);
  assert.notEqual(a, d, 'different languages never share audio');
});

test('repeat reads hit the cache without re-synthesis, LRU + byte budget evict', () => {
  let clock = 0;
  const cache = new TtsCache({ maxBytes: 100, ttlMs: 1000, maxEntries: 10, now: () => clock });

  cache.set('k1', Buffer.alloc(40), 'audio/mpeg');
  assert.equal(cache.get('k1')?.audio.length, 40);
  assert.equal(cache.get('missing'), null);

  cache.set('k2', Buffer.alloc(40), 'audio/mpeg');
  // bytes=80, still under budget.
  cache.set('k3', Buffer.alloc(40), 'audio/mpeg');
  // bytes=120 over budget: the front entry (oldest access = k1) is evicted.
  assert.equal(cache.get('k1'), null, 'oldest-access entry evicted first');
  assert.ok(cache.get('k2'));
  assert.ok(cache.get('k3'));

  cache.set('k4', Buffer.alloc(30), 'audio/mpeg');
  // bytes: 80 + 30 = 110 over budget → k2 (oldest access) evicted → 70.
  assert.equal(cache.get('k2'), null);
  assert.ok(cache.get('k3'));
  assert.ok(cache.get('k4'));

  cache.set('k5', Buffer.alloc(30), 'audio/mpeg');
  // bytes: 70 + 30 = 100, exactly at budget → no eviction.
  assert.ok(cache.get('k3'));
  assert.ok(cache.get('k4'));
  assert.ok(cache.get('k5'));
  assert.equal(cache.size, 3);

  // One byte over the budget evicts the oldest-access entry.
  cache.set('k6', Buffer.alloc(1), 'audio/mpeg');
  assert.equal(cache.get('k3'), null);
  assert.ok(cache.get('k4'));
  assert.ok(cache.get('k5'));
  assert.ok(cache.get('k6'));
  assert.equal(cache.size, 3);
});

test('expired entries are served as misses', () => {
  let clock = 0;
  const cache = new TtsCache({ maxBytes: 1024, ttlMs: 1000, now: () => clock });
  cache.set('k1', Buffer.alloc(10), 'audio/mpeg');
  clock = 1001;
  assert.equal(cache.get('k1'), null);
});
