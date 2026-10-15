import assert from 'node:assert/strict';
import test from 'node:test';
import { claimLiveRetry, retryLiveTurn } from '../src/chat/liveTurn.js';

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
