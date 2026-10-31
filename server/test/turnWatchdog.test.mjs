import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTurnWatchdog,
  turnWatchdogLimits,
  watchdogError,
  watchdogAbortReason,
  watchdogExpiryFromReason,
  DEFAULT_TURN_IDLE_TIMEOUT_MS,
  DEFAULT_TURN_MAX_DURATION_MS,
} from '../src/lib/turnWatchdog.ts';

/**
 * P_turn-watchdog — a chat turn had no server-side deadline of its own.
 * The SSE route is exempt from the request timeout (a reasoning model may
 * think for minutes), which also meant a turn that produced NOTHING could
 * hang forever. These tests pin the two budgets and the rule that a turn
 * which keeps making progress is never cut off.
 */

test('a fresh watchdog has no expiry', () => {
  const watchdog = createTurnWatchdog({ idleMs: 1000, maxDurationMs: 5000, now: () => 0 });
  assert.equal(watchdog.expiry(), null);
  assert.equal(watchdog.idleMs(), 0);
  assert.equal(watchdog.elapsedMs(), 0);
});

test('silence expires the idle budget, and progress resets it', () => {
  let now = 0;
  const watchdog = createTurnWatchdog({ idleMs: 1000, maxDurationMs: 0, now: () => now });
  now = 999;
  assert.equal(watchdog.expiry(), null);
  now = 1000;
  assert.equal(watchdog.expiry(), 'idle');

  /* Progress resets the idle clock — a turn that keeps producing output is
     never cut off, however long it runs. */
  now = 1000;
  watchdog.touch();
  now = 1900;
  assert.equal(watchdog.expiry(), null);
  now = 2000;
  assert.equal(watchdog.expiry(), 'idle');
});

test('the total duration budget expires even while the turn is progressing', () => {
  let now = 0;
  const watchdog = createTurnWatchdog({ idleMs: 0, maxDurationMs: 1000, now: () => now });
  now = 500;
  watchdog.touch();
  now = 999;
  assert.equal(watchdog.expiry(), null);
  now = 1000;
  assert.equal(watchdog.expiry(), 'max_duration');
});

test('a non-positive limit disables that budget', () => {
  let now = 0;
  const watchdog = createTurnWatchdog({ idleMs: 0, maxDurationMs: 0, now: () => now });
  now = 10_000_000;
  assert.equal(watchdog.expiry(), null);
});

test('the limits come from the environment and default to ten minutes / one hour', () => {
  const defaults = turnWatchdogLimits({});
  assert.equal(defaults.idleMs, DEFAULT_TURN_IDLE_TIMEOUT_MS);
  assert.equal(defaults.maxDurationMs, DEFAULT_TURN_MAX_DURATION_MS);

  const custom = turnWatchdogLimits({ TURN_IDLE_TIMEOUT_MS: '5000', TURN_MAX_DURATION_MS: '60000' });
  assert.equal(custom.idleMs, 5000);
  assert.equal(custom.maxDurationMs, 60000);

  /* A malformed value falls back to the default rather than disabling the
     watchdog by accident. */
  const malformed = turnWatchdogLimits({ TURN_IDLE_TIMEOUT_MS: 'soon' });
  assert.equal(malformed.idleMs, DEFAULT_TURN_IDLE_TIMEOUT_MS);
});

test('the watchdog error carries a machine-readable code and a localized sentence', () => {
  const idle = watchdogError('idle', 'en');
  assert.equal(idle.status, 504);
  assert.equal(idle.code, 'TURN_IDLE_TIMEOUT');
  assert.equal(idle.retryable, true);
  assert.match(idle.message, /stopped making progress/);

  const zh = watchdogError('idle', 'zh');
  assert.equal(zh.code, 'TURN_IDLE_TIMEOUT');
  assert.notEqual(zh.message, idle.message);

  const maxDuration = watchdogError('max_duration', 'en');
  assert.equal(maxDuration.code, 'TURN_MAX_DURATION');
});

test('the abort reason round-trips to the budget that expired', () => {
  assert.equal(watchdogAbortReason('idle'), 'turn_idle_timeout');
  assert.equal(watchdogAbortReason('max_duration'), 'turn_max_duration');
  assert.equal(watchdogExpiryFromReason('turn_idle_timeout'), 'idle');
  assert.equal(watchdogExpiryFromReason('turn_max_duration'), 'max_duration');
  /* Another abort reason (the user pressed Stop) is not the watchdog. */
  assert.equal(watchdogExpiryFromReason('turn_interrupted'), null);
  assert.equal(watchdogExpiryFromReason('client_disconnected'), null);
  assert.equal(watchdogExpiryFromReason(undefined), null);
});
