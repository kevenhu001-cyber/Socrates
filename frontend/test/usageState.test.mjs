import assert from 'node:assert/strict';
import test from 'node:test';

const { usageState, publishUsageState } = await import('../src/ui/usageState.ts');

test('usage publisher shares rendered content and period with React subscribers', () => {
  usageState.__resetForTests();
  let notifications = 0;
  const unsubscribe = usageState.subscribe(() => { notifications += 1; });

  publishUsageState('<div>Year summary</div>', 'year');
  usageState.flush();
  assert.deepEqual(
    { bodyHtml: usageState.getSnapshot().bodyHtml, period: usageState.getSnapshot().period },
    { bodyHtml: '<div>Year summary</div>', period: 'year' },
  );
  assert.equal(notifications, 1);

  publishUsageState('<div>Month summary</div>', 'month');
  usageState.flush();
  assert.deepEqual(
    { bodyHtml: usageState.getSnapshot().bodyHtml, period: usageState.getSnapshot().period },
    { bodyHtml: '<div>Month summary</div>', period: 'month' },
  );
  assert.equal(notifications, 2);

  unsubscribe();
  usageState.__resetForTests();
});
