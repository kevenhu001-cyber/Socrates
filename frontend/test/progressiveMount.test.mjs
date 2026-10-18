import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_MOUNTED_ROWS,
  fullMountWindow,
  hasLiveTail,
  indexOfId,
  resolveMountedRows,
  shiftMountWindow,
  windowAroundIndex,
} from '../src/react/message-list/progressiveMount.ts';

const history = (count, prefix = 'message') => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${index}`,
  rawText: `Message ${index}`,
}));

const emptyTrack = () => ({ items: [], floor: null, ceiling: null, full: false });

test('initial history mounts the newest chunk first', () => {
  const items = history(30);
  const result = resolveMountedRows(items, emptyTrack());

  assert.equal(result.start, 18);
  assert.equal(result.end, 30);
  assert.equal(result.floor, 'message-18');
  assert.equal(result.ceiling, null);
  assert.equal(result.mounted.length, 12);
  assert.equal(result.mounted.at(-1)?.id, 'message-29');
  assert.equal(result.replaced, true);
});

test('appending a message preserves the current bounded tail floor', () => {
  const previous = history(30);
  const appended = [...previous, { id: 'message-30', rawText: 'Message 30' }];
  const result = resolveMountedRows(appended, {
    items: previous,
    floor: 'message-18',
    ceiling: null,
    full: false,
  });

  assert.equal(result.start, 18);
  assert.equal(result.end, 31);
  assert.equal(result.floor, 'message-18');
  assert.equal(result.mounted.length, 13);
  assert.equal(result.replaced, false);
});

test('a long-lived tail never grows beyond the resident row cap', () => {
  const previous = history(80);
  const appended = [...previous, { id: 'message-80', rawText: 'Message 80' }];
  const result = resolveMountedRows(appended, {
    items: previous,
    floor: 'message-20',
    ceiling: null,
    full: false,
  });

  assert.equal(result.start, 21);
  assert.equal(result.end, 81);
  assert.equal(result.mounted.length, MAX_MOUNTED_ROWS);
  assert.equal(result.floor, 'message-21');
});

test('a replaced transcript resets the floor to its newest chunk', () => {
  const previous = history(30, 'old');
  const next = history(20, 'new');
  const result = resolveMountedRows(next, {
    items: previous,
    floor: 'old-6',
    ceiling: null,
    full: false,
  });

  assert.equal(result.start, 8);
  assert.equal(result.floor, 'new-8');
  assert.equal(result.mounted.length, 12);
  assert.equal(result.replaced, true);
});

test('short histories mount completely and id lookup keeps fallback indexes stable', () => {
  const short = history(5);
  const result = resolveMountedRows(short, emptyTrack());

  assert.equal(result.start, 0);
  assert.equal(result.end, 5);
  assert.equal(result.floor, null);
  assert.equal(result.ceiling, null);
  assert.equal(result.mounted, short);
  assert.equal(indexOfId([{ rawText: 'first' }, { rawText: 'second' }], 'idx-1'), 1);
});

test('older scrolling grows to the cap, then slides the bounded window', () => {
  const items = history(100);
  let resolved = resolveMountedRows(items, emptyTrack());
  let track = { items, floor: resolved.floor, ceiling: resolved.ceiling, full: false };

  for (let index = 0; index < 4; index++) {
    const next = shiftMountWindow(items, track, 'older');
    track = { items, ...next };
    resolved = resolveMountedRows(items, track);
  }

  assert.equal(resolved.start, 40);
  assert.equal(resolved.end, 100);
  assert.equal(resolved.mounted.length, MAX_MOUNTED_ROWS);

  const shifted = shiftMountWindow(items, track, 'older');
  const earlier = resolveMountedRows(items, { items, ...shifted });
  assert.equal(earlier.start, 28);
  assert.equal(earlier.end, 88);
  assert.equal(earlier.ceiling, 'message-88');
  assert.equal(earlier.mounted.length, MAX_MOUNTED_ROWS);

  const newer = shiftMountWindow(items, { items, ...shifted }, 'newer');
  const backTowardTail = resolveMountedRows(items, { items, ...newer });
  assert.equal(backTowardTail.start, 40);
  assert.equal(backTowardTail.end, 100);
  assert.equal(backTowardTail.ceiling, null);
});

test('a live assistant tail cannot be stranded outside a historical window', () => {
  const items = history(99);
  items.push({
    id: 'message-99',
    role: 'assistant',
    type: 'streaming',
    rawText: 'Still streaming',
  });

  assert.equal(hasLiveTail(items), true);
  const resolved = resolveMountedRows(items, {
    items,
    floor: 'message-20',
    ceiling: 'message-80',
    full: false,
  });

  assert.equal(resolved.start, 88);
  assert.equal(resolved.end, 100);
  assert.equal(resolved.ceiling, null);
  assert.equal(resolved.mounted.at(-1)?.id, 'message-99');
});

test('full mount is explicit and collapse can center around the visible row', () => {
  const items = history(100);
  const full = resolveMountedRows(items, { items, ...fullMountWindow() });
  assert.equal(full.start, 0);
  assert.equal(full.end, 100);
  assert.equal(full.mounted.length, 100);
  assert.equal(full.full, true);

  const centered = resolveMountedRows(items, { items, ...windowAroundIndex(items, 50) });
  assert.equal(centered.start, 20);
  assert.equal(centered.end, 80);
  assert.equal(centered.mounted.length, MAX_MOUNTED_ROWS);
});
