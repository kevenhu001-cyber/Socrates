import test from 'node:test';
import assert from 'node:assert/strict';

import { visibleFromMessages } from '../src/react/message-list/visibleMessages.ts';

function msg(overrides = {}) {
  return {
    id: undefined,
    clientId: undefined,
    html: '<p>row</p>',
    ...overrides,
  };
}

test('full compute filters non-renderable rows and dedupes by identity id', () => {
  const a = msg({ clientId: 'a', html: '<p>a</p>' });
  const ghost = msg({ html: '' }); // non-renderable: no html/rawText/tools
  const aDup = msg({ clientId: 'a', html: '<p>a</p>' });
  const b = msg({ id: 'b', html: '<p>b</p>' });
  const result = visibleFromMessages([a, ghost, aDup, b], null);
  assert.deepEqual(result.visible, [a, b]);
  assert.ok(Object.isFrozen(result.visible));
  /* A non-renderable row must not claim its dedupe id. */
  assert.equal(result.ids[1], null);
});

test('appending to the array reuses the previous visible prefix by identity', () => {
  const a = msg({ clientId: 'a' });
  const b = msg({ clientId: 'b' });
  const first = visibleFromMessages([a, b], null);
  const c = msg({ clientId: 'c' });
  const second = visibleFromMessages([a, b, c], first);
  /* Prefix entries are the same frozen objects, so the visible rows are too. */
  assert.equal(second.visible[0], first.visible[0]);
  assert.equal(second.visible[1], first.visible[1]);
  assert.deepEqual(second.visible, [a, b, c]);
});

test('streaming tail replacement keeps the head and reworks only the tail', () => {
  const a = msg({ clientId: 'a' });
  const live1 = msg({ clientId: 'live', rawText: 'hel' });
  const live2 = msg({ clientId: 'live', rawText: 'hello' });
  const first = visibleFromMessages([a, live1], null);
  const second = visibleFromMessages([a, live2], first);
  assert.equal(second.visible[0], first.visible[0]);
  assert.deepEqual(second.visible, [a, live2]);
});

test('element-wise identical arrays reuse the previous visible list', () => {
  const a = msg({ clientId: 'a' });
  const b = msg({ clientId: 'b' });
  const first = visibleFromMessages([a, b], null);
  const second = visibleFromMessages([a, b].slice(), first);
  assert.equal(second.visible, first.visible);
  assert.equal(second.source.length, 2);
});

test('a mid-array deletion falls back to a correct full recompute', () => {
  const a = msg({ clientId: 'a' });
  const b = msg({ clientId: 'b' });
  const c = msg({ clientId: 'c' });
  const first = visibleFromMessages([a, b, c], null);
  const second = visibleFromMessages([a, c], first);
  assert.deepEqual(second.visible, [a, c]);
  assert.equal(second.counts[0], 1);
  assert.equal(second.counts[1], 2);
});

test('counts stay monotonic and match the visible list length', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id) => msg({ clientId: id }));
  const result = visibleFromMessages(rows, null);
  assert.equal(result.counts[result.counts.length - 1], result.visible.length);
  for (let i = 1; i < result.counts.length; i++) {
    assert.ok(result.counts[i] >= result.counts[i - 1]);
  }
});
