import assert from 'node:assert/strict';
import test from 'node:test';
import { renderUsageHeatmap } from '../src/ui/usage.ts';
import { usageState } from '../src/ui/usageState.ts';

test('usage heatmap keeps totals, period controls, limits, and monthly breakdown', () => {
  usageState.__resetForTests();
  renderUsageHeatmap({ entries: [
    { day: '2026-10-27', tokens: 1200, messages: 3 },
    { day: '2026-10-28', tokens: 600, messages: 2 },
    { day: '2026-09-30', tokens: 100, messages: 1 },
  ] }, { beagleUsed: 800, beagleLimit: 1000 }, 'month');
  usageState.flush();
  const html = usageState.getSnapshot().bodyHtml;

  assert.match(html, /1,900<\/div><div class="usage-stat-lbl">Total tokens/);
  assert.match(html, /6<\/div><div class="usage-stat-lbl">Messages/);
  assert.match(html, /width:80%/);
  assert.match(html, /data-usage-period-placeholder/);
  assert.match(html, /October 2026/);
  assert.match(html, /data-date="2026-10-27"/);
  assert.equal(usageState.getSnapshot().period, 'month');
  usageState.__resetForTests();
});
