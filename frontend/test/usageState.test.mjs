import assert from 'node:assert/strict';
import test from 'node:test';

const {
  usageState,
  setUsageOpen,
  publishUsageLoading,
  publishUsageData,
  publishUsageError,
} = await import('../src/ui/usageState.ts');

test('usage snapshot publishes open, loading, report, and error state for React', () => {
  usageState.__resetForTests();
  let notifications = 0;
  const unsubscribe = usageState.subscribe(() => { notifications += 1; });

  setUsageOpen(true);
  publishUsageLoading('year');
  usageState.flush();
  assert.deepEqual(
    Object.fromEntries(Object.entries(usageState.getSnapshot()).filter(([key]) => key !== 'revision')),
    { open: true, status: 'loading', errorKey: null, entries: [], limits: null, period: 'year' },
  );

  const entries = [{ day: '2026-10-31', tokens: 789, messages: 3 }];
  const limits = { beagleUsed: 10, beagleLimit: 1000 };
  publishUsageData(entries, limits, 'month');
  usageState.flush();
  entries[0].tokens = 0;
  limits.beagleUsed = 0;
  assert.deepEqual(
    Object.fromEntries(Object.entries(usageState.getSnapshot()).filter(([key]) => key !== 'revision')),
    {
      open: true,
      status: 'loaded',
      errorKey: null,
      entries: [{ day: '2026-10-31', tokens: 789, messages: 3 }],
      limits: { beagleUsed: 10, beagleLimit: 1000 },
      period: 'month',
    },
  );

  publishUsageError('month', 'usage.failedGeneric');
  usageState.flush();
  assert.equal(usageState.getSnapshot().status, 'error');
  assert.equal(usageState.getSnapshot().errorKey, 'usage.failedGeneric');
  setUsageOpen(false);
  usageState.flush();
  assert.equal(usageState.getSnapshot().open, false);
  assert.equal(notifications, 4);

  unsubscribe();
  usageState.__resetForTests();
});
