import assert from 'node:assert/strict';
import test from 'node:test';

import {
  flushDeferredMessageRows,
  registerDeferredMessageRowsFlusher,
} from '../src/react/message-list/deferredRows.ts';

test('flushing is a no-op before the message list registers', () => {
  assert.doesNotThrow(() => flushDeferredMessageRows());
});

test('flushing invokes the active message-list registration until cleanup', () => {
  let calls = 0;
  const unregister = registerDeferredMessageRowsFlusher(() => { calls += 1; });

  flushDeferredMessageRows();
  assert.equal(calls, 1);

  unregister();
  flushDeferredMessageRows();
  assert.equal(calls, 1);
});

test('stale cleanup cannot clear a newer message-list registration', () => {
  const calls = [];
  const unregisterOld = registerDeferredMessageRowsFlusher(() => calls.push('old'));
  const unregisterNew = registerDeferredMessageRowsFlusher(() => calls.push('new'));

  unregisterOld();
  flushDeferredMessageRows();
  assert.deepEqual(calls, ['new']);

  unregisterNew();
  flushDeferredMessageRows();
  assert.deepEqual(calls, ['new']);
});
