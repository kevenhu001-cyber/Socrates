import test from 'node:test';
import assert from 'node:assert/strict';
import { createProseCache, createSettledProseCache, sharedFinalProseCache, clearSharedProseCache } from '../src/render/proseCache.ts';
const box = (text) => ({ __html: `<p>${text}</p>` });

test('LRU tracks retained source and HTML exactly through repeated evictions', () => {
  const cache = createProseCache(100, 20);
  for (let i = 0; i < 1000; i++) {
    const key = String(i).padStart(10, '0');
    cache.set(key, { __html: 'h'.repeat(10) });
    assert.deepEqual(cache.stats(), { chars: Math.min(i + 1, 5) * 20, entries: Math.min(i + 1, 5) });
  }
  assert.ok(cache.get('0000000995'));
  assert.ok(cache.get('0000000999'));
  assert.equal(cache.get('0000000994'), undefined);
});

test('LRU evicts least recently used entries, replaces weights, and bounds tiny entries', () => {
  const cache = createProseCache(100, 2);
  const a = box('a');
  cache.set('a', a); cache.set('b', box('b'));
  assert.strictEqual(cache.get('a'), a);
  cache.set('c', box('c'));
  assert.equal(cache.get('b'), undefined);
  cache.set('a', { __html: 'longer' });
  assert.deepEqual(cache.stats(), { chars: 7 + 9, entries: 2 });
  cache.set('oversized', { __html: 'x'.repeat(200) });
  assert.equal(cache.get('oversized'), undefined);
  assert.ok(cache.get('a'), 'oversized content must not evict useful entries');
  cache.clear();
  assert.deepEqual(cache.stats(), { chars: 0, entries: 0 });
});

test('account boundary drops shared finalized prose', () => {
  sharedFinalProseCache.set('private answer', box('private answer'));
  clearSharedProseCache();
  assert.equal(sharedFinalProseCache.get('private answer'), undefined);
  assert.deepEqual(sharedFinalProseCache.stats(), { chars: 0, entries: 0 });
});

test('a prefix larger than the lookup cache never reparses unchanged blocks', () => {
  const renderPrefix = createSettledProseCache();
  let paints = 0;
  const paint = (text) => { paints++; return box(text); };
  const blocks = Array.from({ length: 260 }, (_, i) => `Block ${i}`);
  const first = renderPrefix(blocks, paint);
  for (let frame = 0; frame < 60; frame++) assert.strictEqual(renderPrefix(blocks, paint), first);
  assert.equal(paints, 260);
  // The splitter appends to its existing blocks array in place.
  blocks.push('Next block');
  const extended = renderPrefix(blocks, paint);
  assert.equal(paints, 261);
  first.forEach((html, i) => assert.strictEqual(extended[i], html));
});

test('prefix cache handles replacement, truncation, renderer changes and replay', () => {
  const renderPrefix = createSettledProseCache();
  let paints = 0;
  const paint = (text) => { paints++; return box(text); };
  const first = renderPrefix(['one', 'two'], paint);
  const replacement = renderPrefix(['one', 'changed'], paint);
  assert.strictEqual(replacement[0], first[0]);
  assert.notStrictEqual(replacement[1], first[1]);
  assert.equal(paints, 3);
  const truncated = renderPrefix(['one'], paint);
  assert.equal(truncated.length, 1);
  assert.equal(paints, 3);
  const replayed = renderPrefix(['one', 'two'], paint);
  assert.equal(paints, 4);
  assert.strictEqual(replayed[0], first[0]);
  const mathChanged = renderPrefix(['one', 'two'], (text) => box('new math: ' + text));
  assert.notStrictEqual(mathChanged[0], first[0]);
  assert.match(mathChanged[0].__html, /new math/);
  assert.deepEqual(renderPrefix([], paint), []);
});
