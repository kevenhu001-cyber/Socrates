import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_MAX_ATTEMPTS,
  AI_MAX_RETRIES,
  AI_RETRY_DELAY_MS,
  isRetryableAIError,
  isUserAbort,
  waitForAIRetry,
} from '../src/chat/retryPolicy.ts';

test('AI retry policy allows six total attempts with five exact five-second waits', async () => {
  const delays = [];
  const notices = [];
  let retries = 0;
  const options = {
    source: 'chat',
    sleep: async (delayMs) => { delays.push(delayMs); },
    onRetry: (notice) => notices.push(notice),
  };

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    if (await waitForAIRetry(attempt, new Error('connection reset'), options)) retries += 1;
  }

  assert.equal(AI_MAX_RETRIES, 5);
  assert.equal(AI_MAX_ATTEMPTS, 6);
  assert.equal(retries, 5);
  assert.deepEqual(delays, Array(5).fill(AI_RETRY_DELAY_MS));
  assert.deepEqual(notices.map((notice) => notice.retryNumber), [1, 2, 3, 4, 5]);
  assert.ok(notices.every((notice) => notice.maxRetries === 5 && notice.delayMs === 5000));
});

test('AI retry policy retries transient status errors but rejects terminal provider errors', () => {
  assert.equal(isRetryableAIError({ status: 408 }), true);
  assert.equal(isRetryableAIError({ status: 425 }), true);
  assert.equal(isRetryableAIError({ status: 429 }), true);
  assert.equal(isRetryableAIError({ status: 502 }), true);
  assert.equal(isRetryableAIError({ status: 401 }), false);
  assert.equal(isRetryableAIError({ status: 400 }), false);
  assert.equal(isRetryableAIError({ status: 429, code: 'MONTHLY_LIMIT' }), false);
  assert.equal(isRetryableAIError(new Error('quota exhausted')), false);
  assert.equal(isRetryableAIError(new Error('network reset'), true), false);
});

test('aborting the retry delay rejects immediately and does not start another attempt', async () => {
  const controller = new AbortController();
  const retrying = waitForAIRetry(1, new Error('network reset'), {
    signal: controller.signal,
    onRetry: () => controller.abort('user-stop'),
  });

  await assert.rejects(retrying, (error) => error.name === 'AbortError');
});

test('lifecycle aborts unwind quietly without retry (P_turn-abort-quiet)', () => {
  for (const reason of ['session-expired', 'session-switch', 'superseded', 'new-session', 'msg-edit', 'user-stop']) {
    const controller = new AbortController();
    controller.abort(reason);
    assert.equal(isUserAbort(null, controller.signal), true, reason);
  }
  assert.equal(isRetryableAIError({ status: 429, reason: 'session-expired' }), false);
});
