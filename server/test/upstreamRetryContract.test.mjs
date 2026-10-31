import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_LIMIT_ATTEMPTS,
  TRANSIENT_ATTEMPTS,
  attemptsForUpstreamStatus,
  isRetryableUpstreamFailure,
} from '../src/services/core/llm.ts';
import { UPSTREAM_RETRY_BUDGET_MS } from '../src/lib/upstreamRetryBudget.ts';

/**
 * P1-12 — "declared one retry, actually six".
 *
 * The attempt counts used to be private constants next to a comment that
 * described a single retry. The numbers are the contract, so they are
 * exported and asserted here: a change to them has to be a deliberate act
 * in this file rather than a side effect of an unrelated edit.
 *
 * The other half of the contract is the wall clock: all attempts share one
 * budget, so "five attempts" can never mean "five times the backoff".
 */

test('the attempt counts are the documented contract', () => {
  assert.equal(RATE_LIMIT_ATTEMPTS, 5, 'a rate-limited request gets the initial attempt plus four retries');
  assert.equal(TRANSIENT_ATTEMPTS, 3, 'a transient upstream failure gets the initial attempt plus two retries');
});

test('a rate limit is allowed more attempts than a transient failure', () => {
  assert.equal(attemptsForUpstreamStatus(429), RATE_LIMIT_ATTEMPTS);
  for (const status of [408, 425, 500, 502, 503, 504, 520, 522]) {
    assert.equal(attemptsForUpstreamStatus(status), TRANSIENT_ATTEMPTS);
  }
});

test('a deterministic failure is never retried', () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isRetryableUpstreamFailure(status), false, `${status} must not be replayed`);
  }
  assert.equal(isRetryableUpstreamFailure(429), true);
});

test('every attempt shares one eight-second budget', () => {
  assert.equal(UPSTREAM_RETRY_BUDGET_MS, 8000);
});
