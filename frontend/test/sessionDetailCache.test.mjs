import test from 'node:test';
import assert from 'node:assert/strict';

import {
  signature, lookup, store, invalidate, has, _reset, _size, limits, detailCache,
} from '../src/session/detailCache.js';

/* session/detailCache.js is pure in-memory state; reset between tests so the
   module-level Map never leaks across cases. */
test('store + lookup is a hit, invalidate drops it, miss returns null', () => {
  _reset();
  const resp = { id: 'A', kind: 'chat', messages: [{ id: 'm1', html: '<p>hi</p>' }] };
  assert.equal(lookup('A'), null);
  store('A', resp);
  assert.equal(_size(), 1);
  assert.equal(lookup('A').response, resp);
  invalidate('A');
  assert.equal(lookup('A'), null);
  assert.equal(_size(), 0);
});

test('exam sessions are never cached (different render path)', () => {
  _reset();
  store('E', { id: 'E', kind: 'exam', examData: {}, messages: [] });
  assert.equal(lookup('E'), null);
  assert.equal(_size(), 0);
});

test('oversized responses are skipped to bound memory', () => {
  _reset();
  const big = { id: 'B', kind: 'chat', messages: [{ id: 'x', html: 'y'.repeat(limits.MAX_ENTRY_BYTES + 10) }] };
  store('B', big);
  assert.equal(lookup('B'), null);
  assert.equal(_size(), 0);
});

test('LRU evicts the least-recently-used entry beyond MAX_ENTRIES', () => {
  _reset();
  for (let i = 0; i < limits.MAX_ENTRIES; i++) {
    store('s' + i, { id: 's' + i, kind: 'chat', messages: [{ id: 'm', html: 'x' }] });
  }
  assert.equal(_size(), limits.MAX_ENTRIES);
  // touch s0 so it becomes most-recent, then add a new key
  lookup('s0');
  store('fresh', { id: 'fresh', kind: 'chat', messages: [{ id: 'm', html: 'x' }] });
  assert.equal(_size(), limits.MAX_ENTRIES);
  assert.equal(lookup('s1'), null, 's1 was the oldest untouched and got evicted');
  assert.ok(lookup('s0'), 's0 was refreshed and survived');
  assert.ok(lookup('fresh'));
});

test('entries expire after MAX_AGE and read as a miss', () => {
  _reset();
  store('A', { id: 'A', kind: 'chat', messages: [] });
  const before = lookup('A').at;
  // rewind the stored timestamp past the TTL
  lookup('A').at = before - limits.MAX_AGE_MS - 1;
  assert.equal(lookup('A'), null);
  assert.equal(has('A'), false);
});

test('signature is stable for identical paint-relevant content and ignores updatedAt', () => {
  const a = { title: 'T', topic: 'Q', phase: 'chat', kind: 'chat', updatedAt: 'x', messages: [{ id: '1', html: '<p>a</p>' }] };
  const b = { ...a, updatedAt: 'later' };
  assert.equal(signature(a), signature(b));
});

test('signature changes when messages are added, edited in place, or a title moves', () => {
  const base = { title: 'T', topic: 'Q', phase: 'chat', kind: 'chat', messages: [{ id: '1', html: '<p>a</p>' }, { id: '2', html: '<p>b</p>' }] };
  const s0 = signature(base);
  const added = { ...base, messages: base.messages.concat([{ id: '3', html: '<p>c</p>' }]) };
  assert.notEqual(signature(added), s0);
  const edited = { ...base, messages: [{ id: '1', html: '<p>a-changed</p>' }, base.messages[1]] };
  assert.notEqual(signature(edited), s0);
  const retitled = { ...base, title: 'T2' };
  assert.notEqual(signature(retitled), s0);
});

test('isFresh: a just-stored entry skips background revalidation, an older one does not', () => {
  _reset();
  store('F', { id: 'F', kind: 'chat', messages: [] });
  const entry = lookup('F');
  assert.equal(detailCache.isFresh(entry), true);
  entry.at = Date.now() - limits.REVALIDATE_AFTER_MS - 1;
  assert.equal(detailCache.isFresh(entry), false);
  assert.equal(detailCache.isFresh(null), false);
});

test('size cap counts attachment payloads, not only message html', () => {
  _reset();
  const dataUrl = 'data:image/png;base64,' + 'A'.repeat(limits.MAX_ENTRY_BYTES);
  store('I', { id: 'I', kind: 'chat', messages: [{ id: 'm', html: '<p>x</p>', attachments: [{ kind: 'image', dataUrl }] }] });
  assert.equal(has('I'), false);
});
