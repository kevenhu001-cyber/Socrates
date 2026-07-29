import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRetryInterruptedStream } from '../src/chat/streamRetry.ts';

test('stream retries only before semantic output reaches the UI', () => {
  assert.equal(shouldRetryInterruptedStream({
    isHeartbeat: true,
    semanticActivity: false,
    attempt: 1,
    maxAttempts: 2,
  }), true);

  for (const semanticActivity of [true]) {
    assert.equal(shouldRetryInterruptedStream({
      isHeartbeat: true,
      semanticActivity,
      attempt: 1,
      maxAttempts: 2,
    }), false, 'partial text/tool output must never be replayed');
  }

  assert.equal(shouldRetryInterruptedStream({
    isHeartbeat: false,
    semanticActivity: false,
    attempt: 1,
    maxAttempts: 2,
  }), false);
  assert.equal(shouldRetryInterruptedStream({
    isHeartbeat: true,
    semanticActivity: false,
    attempt: 2,
    maxAttempts: 2,
  }), false);
});
