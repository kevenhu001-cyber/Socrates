import assert from 'node:assert/strict';
import test from 'node:test';

import {
  flushDeferredMessageRows,
  registerDeferredMessageRowsFlusher,
  restoreDeferredMessageRows,
} from '../src/react/message-list/deferredRows.ts';

test('flush and restore are no-ops before the message list registers', () => {
  assert.doesNotThrow(() => flushDeferredMessageRows());
  assert.doesNotThrow(() => restoreDeferredMessageRows());
});

test('the active message-list registration owns both full mount and bounded restore', () => {
  const calls = [];
  const unregister = registerDeferredMessageRowsFlusher(
    () => calls.push('flush'),
    () => calls.push('restore'),
  );

  flushDeferredMessageRows();
  restoreDeferredMessageRows();
  assert.deepEqual(calls, ['flush', 'restore']);

  unregister();
  flushDeferredMessageRows();
  restoreDeferredMessageRows();
  assert.deepEqual(calls, ['flush', 'restore']);
});

test('stale cleanup cannot clear a newer message-list registration', () => {
  const calls = [];
  const unregisterOld = registerDeferredMessageRowsFlusher(
    () => calls.push('old-flush'),
    () => calls.push('old-restore'),
  );
  const unregisterNew = registerDeferredMessageRowsFlusher(
    () => calls.push('new-flush'),
    () => calls.push('new-restore'),
  );

  unregisterOld();
  flushDeferredMessageRows();
  restoreDeferredMessageRows();
  assert.deepEqual(calls, ['new-flush', 'new-restore']);

  unregisterNew();
  flushDeferredMessageRows();
  restoreDeferredMessageRows();
  assert.deepEqual(calls, ['new-flush', 'new-restore']);
});
