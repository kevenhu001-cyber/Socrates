import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beagleUsageSummary,
  collectUsageEntries,
  monthlyUsageSummaries,
  usageLevel,
} from '../src/ui/usageModel.ts';

test('usage model preserves totals, heatmap levels, limits, and monthly breakdown', () => {
  const entries = [
    { day: '2026-10-27', tokens: 1200, messages: 3 },
    { day: '2026-10-28', tokens: 600, messages: 2 },
    { day: '2026-09-30', tokens: 100, messages: 1 },
  ];
  const totals = collectUsageEntries(entries);

  assert.equal(totals.totalTokens, 1900);
  assert.equal(totals.totalMsgs, 6);
  assert.equal(totals.maxDay, 1200);
  assert.equal(usageLevel(1200, totals.maxDay), 5);
  assert.equal(usageLevel(600, totals.maxDay), 3);
  assert.deepEqual(beagleUsageSummary({ beagleUsed: 800, beagleLimit: 1000 }), {
    used: 800,
    limit: 1000,
    percent: 80,
    color: 'hsl(35 80% 55%)',
    message: 'approaching',
  });
  assert.deepEqual(monthlyUsageSummaries(entries), [
    { month: 'October 2026', activeDays: 2, tokens: 1800, messages: 5 },
    { month: 'September 2026', activeDays: 1, tokens: 100, messages: 1 },
  ]);
});
