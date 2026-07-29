import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNextRunAt } from '../src/services/scheduler.js';

test('computeNextRunAt advances hourly/daily/weekly by fixed offsets', () => {
  const from = new Date('2026-07-29T10:00:00Z');
  assert.equal(computeNextRunAt('hourly', from).getTime(), from.getTime() + 3600_000);
  assert.equal(computeNextRunAt('daily', from).getTime(), from.getTime() + 86_400_000);
  assert.equal(computeNextRunAt('weekly', from).getTime(), from.getTime() + 7 * 86_400_000);
});

test('computeNextRunAt monthly keeps the day-of-month when it fits', () => {
  const from = new Date(2026, 3, 15, 9, 30); // Apr 15
  const next = computeNextRunAt('monthly', from);
  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 4); // May
  assert.equal(next.getDate(), 15);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 30);
});

test('computeNextRunAt monthly clamps Jan 31 into February instead of rolling to March', () => {
  const from = new Date(2026, 0, 31, 8, 0); // Jan 31
  const next = computeNextRunAt('monthly', from);
  assert.equal(next.getMonth(), 1); // February
  assert.equal(next.getDate(), 28); // 2026 is not a leap year
});

test('computeNextRunAt returns null for one-shot and unknown frequencies', () => {
  assert.equal(computeNextRunAt('once'), null);
  assert.equal(computeNextRunAt('custom'), null);
  assert.equal(computeNextRunAt(null), null);
  assert.equal(computeNextRunAt(undefined), null);
  assert.equal(computeNextRunAt('bogus'), null);
});
