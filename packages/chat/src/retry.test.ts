import assert from 'node:assert/strict';
import test from 'node:test';
import { STREAM_MAX_ATTEMPTS, isRetryableStatus, offlineGuard, shouldRetryInterruptedStream } from './retry.ts';

test('the retry budget is six attempts with a fixed retryable set', () => {
  assert.equal(STREAM_MAX_ATTEMPTS, 6);
  for (const status of [408, 425, 429, 500, 502, 503, 504, 520, 522]) {
    assert.equal(isRetryableStatus(status), true);
  }
});

test('524 and client errors are terminal', () => {
  assert.equal(isRetryableStatus(524), false);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(401), false);
  assert.equal(isRetryableStatus(404), false);
});

test('an interrupted stream replays only before visible output', () => {
  assert.equal(shouldRetryInterruptedStream({ isHeartbeat: true, semanticActivity: false, attempt: 1, maxAttempts: 6 }), true);
  assert.equal(shouldRetryInterruptedStream({ isHeartbeat: true, semanticActivity: true, attempt: 1, maxAttempts: 6 }), false);
  assert.equal(shouldRetryInterruptedStream({ isHeartbeat: false, semanticActivity: false, attempt: 1, maxAttempts: 6 }), false);
  assert.equal(shouldRetryInterruptedStream({ isHeartbeat: true, semanticActivity: false, attempt: 6, maxAttempts: 6 }), false);
});

test('the offline probe is false without a navigator going offline', () => {
  assert.equal(offlineGuard(), false);
});
