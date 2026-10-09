import assert from 'node:assert/strict';
import test from 'node:test';

import { indexOfId, resolveMountedRows } from '../src/react/message-list/progressiveMount.ts';

const history = (count, prefix = 'message') => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index}`,
  rawText: `Message ${index}`,
}));

test('initial history mounts the newest chunk first', () => {
  const items = history(30);
  const result = resolveMountedRows(items, { items: [], floor: null });

  assert.equal(result.start, 18);
  assert.equal(result.floor, 'message-18');
  assert.equal(result.mounted.length, 12);
  assert.equal(result.mounted.at(-1)?.id, 'message-29');
  assert.equal(result.replaced, true);
});

test('appending a message preserves the current progressive mount floor', () => {
  const previous = history(30);
  const appended = [...previous, { id: 'message-30', rawText: 'Message 30' }];
  const result = resolveMountedRows(appended, { items: previous, floor: 'message-18' });

  assert.equal(result.start, 18);
  assert.equal(result.floor, 'message-18');
  assert.equal(result.mounted.length, 13);
  assert.equal(result.replaced, false);
});

test('a replaced transcript resets the floor to its newest chunk', () => {
  const previous = history(30, 'old');
  const next = history(20, 'new');
  const result = resolveMountedRows(next, { items: previous, floor: 'old-6' });

  assert.equal(result.start, 8);
  assert.equal(result.floor, 'new-8');
  assert.equal(result.mounted.length, 12);
  assert.equal(result.replaced, true);
});

test('short histories mount completely and id lookup keeps fallback indexes stable', () => {
  const short = history(5);
  const result = resolveMountedRows(short, { items: [], floor: null });

  assert.equal(result.start, 0);
  assert.equal(result.floor, null);
  assert.equal(result.mounted, short);
  assert.equal(indexOfId([{ rawText: 'first' }, { rawText: 'second' }], 'idx-1'), 1);
});
