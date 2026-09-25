import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* One card per renderer family, driven through the real tool-event path.
   Each must render content without a fallback, without raising the global
   error banner, and only expose card actions that actually work. */
const S = (template, payload) => ({ version: 1, template, title: 'T ' + template, accessibilitySummary: 'summary ' + template, payload });
const nodes = [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Middle' }, { id: 'c', label: 'End' }];
const edges = [{ from: 'a', to: 'b', label: 'go' }, { from: 'b', to: 'c' }];
const CASES = [
  { spec: S('radar', { categories: ['a', 'b', 'c', 'd'], series: [{ name: 'x', data: [1, 2, 3, 4] }] }), content: 'svg *', actions: ['table', 'reset', 'download', 'fullscreen'] },
  { spec: S('flowchart', { nodes, edges }), content: 'svg *', actions: ['table', 'download', 'fullscreen'] },
  { spec: S('timeline', { items: [{ label: '1900', detail: 'x' }, { label: '1950', detail: 'y' }] }), content: 'svg *', actions: ['table', 'download', 'fullscreen'], tableRows: 2 },
  { spec: S('interactive_simulation', { source: '<div id="x">hi</div><script>document.getElementById("x").textContent="ok"</script>' }), content: 'iframe[data-ready="true"]', actions: ['fullscreen'] },
  { spec: S('geometry_3d', { objects: [{ type: 'box' }, { type: 'sphere', position: [2, 0, 0] }] }), content: 'canvas', actions: ['reset', 'download', 'fullscreen'] },
];

for (const { spec, content, actions, tableRows } of CASES) {
  test('visualization template ' + spec.template + ' renders and its actions work', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && /global-error/.test(m.text())) errors.push(m.text()); });
    await mockAuthedApp(page);
    await page.route('**/api/**/chat/stream', (route) => route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: tool_use\ndata: ' + JSON.stringify([{ id: 'v1', name: 'render_visualization', input: spec }]) + '\n\n',
        'event: tool_result\ndata: ' + JSON.stringify({ id: 'v1', name: 'render_visualization', ok: true, status: 'completed', visualization: spec, output: 'Visualization ready', durationMs: 1 }) + '\n\n',
        'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Shown.' } }] }) + '\n\n',
        'data: [DONE]\n\n',
      ].join(''),
    }));
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await page.evaluate(async () => {
      window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
      window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '99999999-9999-4999-8999-999999999999' });
      window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [{ clientId: 'u', role: 'user', rawText: 'draw', html: null }] });
      document.getElementById('topicSetup').classList.add('hidden');
      document.getElementById('chatView').classList.remove('hidden');
      await window.askChatTurn('draw');
    });
    const card = page.locator('.visualization-card').last();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator('.visualization-stage ' + content).first()).toBeAttached({ timeout: 15000 });
    await expect(card.locator('.visualization-fallback')).toHaveCount(0);

    const visible = await card.locator('[data-viz-action]').evaluateAll((els) => els.filter((b) => !b.hidden).map((b) => b.dataset.vizAction));
    expect(visible).toEqual(actions);
    if (actions.includes('table')) {
      await card.locator('[data-viz-action="table"]').click();
      await expect(card.locator('.visualization-table')).toBeVisible();
      if (tableRows) await expect(card.locator('.visualization-table tbody tr')).toHaveCount(tableRows);
    }
    if (actions.includes('reset')) await card.locator('[data-viz-action="reset"]').click();
    if (actions.includes('download')) {
      const download = page.waitForEvent('download');
      await card.locator('[data-viz-action="download"]').click();
      expect((await download).suggestedFilename()).toMatch(/\.(png|svg)$/);
    }
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
  });
}
