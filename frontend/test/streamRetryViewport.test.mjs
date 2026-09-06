import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { createStreamRetryViewport, shouldRetryInterruptedStream } = await import(
  '../src/chat/streamRetry.ts'
);

function makeList() {
  const list = dom.window.document.createElement('div');
  const row = dom.window.document.createElement('div');
  row.setAttribute('data-client-id', 'c1');
  const error = dom.window.document.createElement('div');
  error.className = 'msg-error';
  row.appendChild(error);
  list.appendChild(row);
  dom.window.document.body.appendChild(list);
  return { list, row };
}

test('retry decision stays heartbeat-only before semantic output', () => {
  assert.equal(
    shouldRetryInterruptedStream({ isHeartbeat: true, semanticActivity: false, attempt: 1, maxAttempts: 2 }),
    true,
  );
  assert.equal(
    shouldRetryInterruptedStream({ isHeartbeat: true, semanticActivity: true, attempt: 1, maxAttempts: 2 }),
    false,
  );
});

test('measureViewport returns null without a list or row', () => {
  const store = createStreamRetryViewport();
  assert.equal(store.measureViewport(null, 'c1'), null);
  const empty = dom.window.document.createElement('div');
  assert.equal(store.measureViewport(empty, 'missing'), null);
});

test('measureViewport captures the row offset with a ttl', () => {
  const store = createStreamRetryViewport();
  const { list } = makeList();
  try {
    const before = Date.now();
    const snapshot = store.measureViewport(list, 'c1', 2000);
    assert.ok(snapshot);
    assert.equal(snapshot.clientId, 'c1');
    assert.equal(snapshot.offset, 0);
    assert.ok(snapshot.expiresAt >= before + 2000);
  } finally {
    list.remove();
  }
});

test('consumeViewport takes a prepared offset exactly once', () => {
  const store = createStreamRetryViewport();
  assert.equal(store.consumeViewport(), null);
  const { list } = makeList();
  try {
    store.prepareViewport(list, 3, 'c1');
    const taken = store.consumeViewport();
    assert.ok(taken);
    assert.equal(taken.offset, 0);
    assert.equal(store.consumeViewport(), null);
  } finally {
    list.remove();
  }
});

test('clearPendingViewport drops a prepared offset', () => {
  const store = createStreamRetryViewport();
  const { list } = makeList();
  try {
    store.prepareViewport(list, 3, 'c1');
    store.clearPendingViewport();
    assert.equal(store.consumeViewport(), null);
  } finally {
    list.remove();
  }
});

test('captureViewport prefers a fresh stable snapshot', () => {
  const store = createStreamRetryViewport();
  const { list } = makeList();
  try {
    store.rememberStableViewport('c1', 42);
    const captured = store.captureViewport(list, 'c1');
    assert.ok(captured);
    assert.equal(captured.offset, 42);
  } finally {
    list.remove();
  }
});

test('captureViewport ignores an expired stable snapshot', () => {
  const store = createStreamRetryViewport();
  const { list } = makeList();
  try {
    store.rememberStableViewport('c1', 42, -1000);
    const captured = store.captureViewport(list, 'c1');
    assert.ok(captured);
    assert.equal(captured.offset, 0);
  } finally {
    list.remove();
  }
});

test('prepareViewport removes the failed row and message slot', async () => {
  const { stateStore } = await import('../src/state/store.js');
  const store = createStreamRetryViewport();
  const { list, row } = makeList();
  stateStore.dispatch({
    type: 'session/append-message',
    payload: { clientId: 'c1', role: 'assistant', rawText: 'x' },
  });
  try {
    store.prepareViewport(list, 7, 'c1');
    assert.equal(row.parentNode, null);
    const remaining = stateStore
      .read('messages')
      .filter((message) => message && message.clientId === 'c1');
    assert.equal(remaining.length, 0);
  } finally {
    list.remove();
  }
});

test('settleErrorViewport reports the error offset then detaches', () => {
  const store = createStreamRetryViewport();
  const { list } = makeList();
  const queue = [];
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    queue.push(callback);
    return queue.length;
  };
  const offsets = [];
  try {
    store.settleErrorViewport(list, 'c1', (offset) => offsets.push(offset));
    for (let i = 0; i < 50 && queue.length; i++) {
      const frame = queue.shift();
      frame();
    }
    assert.ok(offsets.length >= 1);
    assert.equal(offsets[0], 0);
    assert.equal(queue.length, 0);
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    list.remove();
  }
});
