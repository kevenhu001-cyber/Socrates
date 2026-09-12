import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDuration,
  formatTokenCount,
  usageSummary,
} from '../src/react/tool-run/usageModel.ts';

test('formatTokenCount keeps exact counts and compacts thousands/millions', () => {
  assert.equal(formatTokenCount(0), '0');
  assert.equal(formatTokenCount(999), '999');
  assert.equal(formatTokenCount(1000), '1k');
  assert.equal(formatTokenCount(1234), '1.2k');
  assert.equal(formatTokenCount(99_949), '99.9k');
  assert.equal(formatTokenCount(123_456), '123k');
  assert.equal(formatTokenCount(1_500_000), '1.5M');
  assert.equal(formatTokenCount(-5), null);
  assert.equal(formatTokenCount(NaN), null);
  assert.equal(formatTokenCount('42'), null);
});

test('formatDuration formats seconds and minutes, rejecting non-positive input', () => {
  assert.equal(formatDuration(0), null);
  assert.equal(formatDuration(undefined), null);
  assert.equal(formatDuration(840), '0.8s');
  assert.equal(formatDuration(12_340), '12.3s');
  assert.equal(formatDuration(65_000), '1m 05s');
  assert.equal(formatDuration(600_000), '10m 00s');
});

test('usageSummary derives speed and duration from tokens and wall clock', () => {
  const summary = usageSummary({
    promptTokens: 1200,
    completionTokens: 340,
    totalTokens: 1540,
    durationMs: 10_000,
  });
  assert.deepEqual(summary, {
    speed: '34',
    duration: '10s',
    promptTokens: 1200,
    completionTokens: 340,
    totalTokens: 1540,
  });
});

test('usageSummary infers the total and degrades when timing is missing', () => {
  assert.deepEqual(usageSummary({ promptTokens: 100, completionTokens: 50 }), {
    speed: null,
    duration: null,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
  });
  /* A total-only record (reloaded sessions) renders tokens without speed. */
  assert.deepEqual(usageSummary({ totalTokens: 900 }), {
    speed: null,
    duration: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: 900,
  });
});

test('usageSummary returns null when nothing measurable is present', () => {
  assert.equal(usageSummary(null), null);
  assert.equal(usageSummary(undefined), null);
  assert.equal(usageSummary({ durationMs: 5000 }), null);
  assert.equal(usageSummary({ totalTokens: -1, promptTokens: NaN }), null);
  /* Speed needs a positive clock; a zero-token completion has no rate. */
  assert.equal(usageSummary({ completionTokens: 0, durationMs: 0, totalTokens: 0 }), null);
});
