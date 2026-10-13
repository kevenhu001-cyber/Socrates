import test from 'node:test';
import assert from 'node:assert/strict';

import { areMessageItemsEqual } from '../src/react/message-list/messageItemMemo.ts';

function message(overrides = {}) {
  return Object.freeze({
    id: 'message-1',
    clientId: 'client-1',
    role: 'assistant',
    rawText: 'Answer',
    html: '<p>Answer</p>',
    ...overrides,
  });
}

function props(messageSnapshot = message(), mathRevision = 0) {
  return { message: messageSnapshot, mathRevision };
}

test('message item comparator reuses an unchanged immutable snapshot', () => {
  const snapshot = message();
  const current = props(snapshot);
  assert.equal(areMessageItemsEqual(current, { ...current }), true);
});

test('message item comparator still observes the external math revision', () => {
  const snapshot = message();
  assert.equal(areMessageItemsEqual(props(snapshot, 0), props(snapshot, 1)), false);
});

test('a new immutable message snapshot always invalidates the row', () => {
  const current = props(message());
  const next = props(message());

  assert.notEqual(current.message, next.message);
  assert.equal(areMessageItemsEqual(current, next), false);
});

test('render, tool, process, and anchor changes invalidate through snapshot identity', () => {
  const currentMessage = message({
    _activity: { type: 'thinking' },
    _turnViewportTarget: 24,
  });
  const changes = [
    message({ html: '<p>Updated</p>' }),
    message({ toolCalls: [{ id: 'tool-1', name: 'web_search' }] }),
    message({ attachments: [{ id: 'file-1', kind: 'image' }] }),
    message({ _activity: { type: 'synthesizing' } }),
    message({ summary: 'Checked sources.' }),
    message({ reasoningContent: 'private reasoning' }),
    message({ _turnViewportTarget: 32 }),
    message({ _katexRenderedRev: 1 }),
  ];

  for (const changedMessage of changes) {
    assert.equal(
      areMessageItemsEqual(props(currentMessage), props(changedMessage)),
      false,
    );
  }
});
