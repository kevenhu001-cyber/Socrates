import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import {
  isRetryableAIError,
  isUserAbort,
  waitForAIRetry,
} from '../src/chat/retryPolicy.ts';

const RUNS = 200;

/* Transient statuses the policy treats as retryable transport/upstream
   failures: explicit 408/425/429 plus the whole 5xx range. */
const transientStatus = () => fc.oneof(
  fc.constantFrom(408, 425, 429),
  fc.integer({ min: 500, max: 599 }),
);

/* Nest a status under one of the three shapes errorStatus() reads:
   top-level `status`, top-level `statusCode`, or `body.status`. */
function nestStatus(status, shape) {
  if (shape === 'status') return { status };
  if (shape === 'statusCode') return { statusCode: status };
  return { body: { status } };
}

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 1: Transient failures are
// retryable before semantic output (nested status/statusCode/body.status)
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 1: Transient failures are retryable before semantic output', () => {
  fc.assert(
    fc.property(
      transientStatus(),
      fc.constantFrom('status', 'statusCode', 'body.status'),
      (status, shape) => {
        const error = nestStatus(status, shape);
        // No semantic output emitted and no user abort -> retryable.
        assert.equal(isRetryableAIError(error, false), true);
      },
    ),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 2: Deterministic provider/config
// failures are never retryable (regardless of semanticActivity)
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 2: Deterministic provider/config failures are never retryable', () => {
  // Terminal codes matched by the classifier's code regex.
  const terminalCode = () => fc.constantFrom(
    'MONTHLY_LIMIT',
    'QUOTA',
    'INVALID_API_KEY',
    'INVALID-API-KEY',
    'AUTH',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'INVALID_REQUEST',
    'CONTENT_POLICY',
    'BAD_REQUEST',
  );
  // Terminal messages matched by the classifier's message regex (used when no
  // status/code is present).
  const terminalMessage = () => fc.constantFrom(
    'monthly limit reached',
    'quota exhausted',
    'invalid api key',
    'authentication failed',
    'unauthorized',
    'forbidden',
    'invalid request',
    'content policy violation',
  );
  // Non-retryable 4xx statuses (excluding the retryable 408/425/429).
  const terminalStatus = () => fc.integer({ min: 400, max: 499 })
    .filter((s) => s !== 408 && s !== 425 && s !== 429);

  fc.assert(
    fc.property(
      fc.oneof(
        terminalCode().map((code) => ({ code })),
        terminalMessage().map((message) => ({ message })),
        terminalStatus().map((status) => ({ status })),
      ),
      fc.boolean(),
      (error, semanticActivity) => {
        assert.equal(isRetryableAIError(error, semanticActivity), false);
      },
    ),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 3: User abort is classified as
// user intent and never retried
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 3: User abort is classified as user intent and never retried', () => {
  const userStopReason = () => fc.constantFrom(
    'user-stop',
    'user_stop',
    'user stop',
    'cancelled',
    'canceled',
  );

  // A signal-like object carrying an aborted flag and a reason.
  const abortedSignal = (reason) => ({ aborted: true, reason });

  fc.assert(
    fc.property(
      fc.oneof(
        // Named user-stop reasons carried on the error object.
        userStopReason().map((reason) => ({ error: { reason }, signal: undefined })),
        // Named user-stop reasons carried on the signal.
        userStopReason().map((reason) => ({ error: {}, signal: abortedSignal(reason) })),
        // Bare DOM abort: aborted signal with no / abort-like reason.
        fc.constantFrom('', 'abort', 'AbortError', 'The operation was aborted')
          .map((reason) => ({ error: {}, signal: abortedSignal(reason) })),
      ),
      ({ error, signal }) => {
        assert.equal(isUserAbort(error, signal), true);
        assert.equal(isRetryableAIError(error, false, signal), false);
      },
    ),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 4: Retry waits and replays only
// below the attempt ceiling (use the sleep seam, no real delay)
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 4: Retry waits and replays only below the attempt ceiling', async () => {
  const retryableError = () => transientStatus().map((status) => ({ status }));
  const terminalError = () => fc.constantFrom(
    { status: 401 },
    { status: 400 },
    { code: 'MONTHLY_LIMIT' },
    { message: 'quota exhausted' },
  );

  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 20 }),   // maxRetries -> maxAttempts = maxRetries + 1
      fc.integer({ min: 1, max: 40 }),   // attempt number
      retryableError(),
      terminalError(),
      fc.integer({ min: 0, max: 10000 }),
      async (maxRetries, attempt, retryable, terminal, delayMs) => {
        const maxAttempts = maxRetries + 1;

        // Case A: retryable error below the ceiling -> waits once, resolves true.
        {
          const sleeps = [];
          const options = {
            maxRetries,
            delayMs,
            sleep: async (ms) => { sleeps.push(ms); },
          };
          const belowCeiling = ((attempt - 1) % maxAttempts) + 1; // 1..maxAttempts
          if (belowCeiling < maxAttempts) {
            const result = await waitForAIRetry(belowCeiling, retryable, options);
            assert.equal(result, true);
            assert.deepEqual(sleeps, [delayMs]); // waited exactly once, via the seam
          }
        }

        // Case B: attempt at or above the ceiling -> resolves false, no wait.
        {
          const sleeps = [];
          const options = {
            maxRetries,
            delayMs,
            sleep: async (ms) => { sleeps.push(ms); },
          };
          const atOrAbove = maxAttempts + (attempt % 5); // >= maxAttempts
          const result = await waitForAIRetry(atOrAbove, retryable, options);
          assert.equal(result, false);
          assert.deepEqual(sleeps, []); // no delay incurred
        }

        // Case C: non-retryable error below the ceiling -> resolves false, no wait.
        {
          const sleeps = [];
          const options = {
            maxRetries,
            delayMs,
            sleep: async (ms) => { sleeps.push(ms); },
          };
          const result = await waitForAIRetry(1, terminal, options);
          assert.equal(result, false);
          assert.deepEqual(sleeps, []);
        }
      },
    ),
    { numRuns: RUNS },
  );
});
