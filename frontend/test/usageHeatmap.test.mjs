import assert from 'node:assert/strict';
import test from 'node:test';
import { renderUsageHeatmap } from '../src/ui/usage.js';

test('usage heatmap keeps totals, period controls, limits, and monthly breakdown', () => {
  const body = { innerHTML: '' };
  renderUsageHeatmap({ entries: [
    { day: '2026-10-27', tokens: 1200, messages: 3 },
    { day: '2026-10-28', tokens: 600, messages: 2 },
    { day: '2026-09-30', tokens: 100, messages: 1 },
  ] }, body, { beagleUsed: 800, beagleLimit: 1000 }, 'month');

  assert.match(body.innerHTML, /1,900<\/div><div class="usage-stat-lbl">Total tokens/);
  assert.match(body.innerHTML, /6<\/div><div class="usage-stat-lbl">Messages/);
  assert.match(body.innerHTML, /width:80%/);
  assert.match(body.innerHTML, /data-usage-period="month">This month/);
  assert.match(body.innerHTML, /October 2026/);
  assert.match(body.innerHTML, /data-date="2026-10-27"/);
});
