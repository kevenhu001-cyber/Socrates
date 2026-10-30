import assert from 'node:assert/strict';
import test from 'node:test';
import {
  claimLiveRetry,
  claimLiveSearchRetry,
  installLiveTurnRetryListener,
  retryLiveTurn,
} from '../src/chat/liveTurn.ts';

test('React Retry resolves the streaming controller identity and rejects another message', () => {
  let calls = 0;
  claimLiveRetry({ getClientId: () => 'failed-turn' }, () => { calls += 1; });
  assert.equal(retryLiveTurn('another-turn'), false);
  assert.equal(calls, 0);
  assert.equal(retryLiveTurn('failed-turn'), true);
  assert.equal(calls, 1);
  claimLiveRetry(null);
  assert.equal(retryLiveTurn('failed-turn'), false);
});

test('restored retry owners retain their field-based identity', () => {
  let calls = 0;
  claimLiveRetry({ clientId: 'restored-turn' }, () => { calls += 1; });
  assert.equal(retryLiveTurn('restored-turn'), true);
  assert.equal(calls, 1);
  claimLiveRetry(null);
});

test('tool retry uses the module-owned live handler instead of a window fallback', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let onToolRetry;
  let legacyCalls = 0;
  const received = [];
  const detail = { query: 'repair this search', source: 'viz-failure' };

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { addEventListener: (type, listener) => {
      if (type === 'tool-retry') onToolRetry = listener;
    } },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { __socratesToolRetry: () => { legacyCalls += 1; } },
  });

  try {
    claimLiveSearchRetry((query, eventDetail) => received.push([query, eventDetail]));
    installLiveTurnRetryListener();
    assert.equal(typeof onToolRetry, 'function');
    onToolRetry({ detail });
    assert.deepEqual(received, [[detail.query, detail]]);
    assert.equal(legacyCalls, 0);
  } finally {
    claimLiveSearchRetry(null);
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
