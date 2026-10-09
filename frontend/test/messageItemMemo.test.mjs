import test from 'node:test';
import assert from 'node:assert/strict';

import { areMessageItemsEqual } from '../src/react/message-list/messageItemMemo.ts';

function props(message = {}) {
  return {
    message: {
      id: 'message-1',
      clientId: 'client-1',
      role: 'assistant',
      rawText: 'Answer',
      html: '<p>Answer</p>',
      ...message,
    },
    textLength: 6,
    toolRevision: 0,
    mathRevision: 0,
    renderRevision: 0,
  };
}

test('message item comparator skips an unchanged mutable message', () => {
  const current = props();
  assert.equal(areMessageItemsEqual(current, { ...current }), true);
});

test('message item comparator detects revisions outside message identity', () => {
  const current = props();
  assert.equal(areMessageItemsEqual(current, { ...current, textLength: 7 }), false);
  assert.equal(areMessageItemsEqual(current, { ...current, toolRevision: 1 }), false);
  assert.equal(areMessageItemsEqual(current, { ...current, mathRevision: 1 }), false);
  assert.equal(areMessageItemsEqual(current, { ...current, renderRevision: 1 }), false);
});

test('message item comparator detects changed rendered content', () => {
  const current = props();
  assert.equal(areMessageItemsEqual(current, props({ html: '<p>Updated</p>' })), false);
  assert.equal(areMessageItemsEqual(current, props({ toolCalls: [{ id: 'tool-1' }] })), false);
  assert.equal(areMessageItemsEqual(current, props({ attachments: [{ id: 'file-1', kind: 'image' }] })), false);
});

test('message item comparator accepts a new object with the same rendered state', () => {
  const current = props();
  const next = props();
  assert.notEqual(current.message, next.message);
  assert.equal(areMessageItemsEqual(current, next), true);
});

test('message item comparator detects renderer revisions and anchor fields', () => {
  const current = props({ _katexRenderedRev: 0, _turnViewportTarget: 24 });
  const next = props({ _katexRenderedRev: 1, _turnViewportTarget: 24 });
  assert.equal(areMessageItemsEqual(current, next), false);

  const currentAnchor = props({ _turnViewportTarget: 24 });
  const nextAnchor = props({ _turnViewportTarget: 32 });
  assert.equal(areMessageItemsEqual(currentAnchor, nextAnchor), false);
});
