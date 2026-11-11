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
  { spec: { ...S('radar', { indicators: [{ name: 'Speed', max: 10 }, { name: 'Power', max: 10 }, { name: 'Focus', max: 10 }], series: [{ name: 'x', data: [8, 6, 9] }, { name: 'y', data: [5, 9, 4] }] }), caption: 'Optional explanatory note.' }, content: 'svg *' },
  { spec: S('heatmap', { xCategories: ['Mon', 'Tue'], yCategories: ['AM', 'PM'], values: [[2, 4], [3, 1]] }), content: 'svg', tableRows: 2 },
  { spec: S('scatter', { xLabel: 'Hours', yLabel: 'Score', series: [{ name: 'Samples', data: [[1, 4], { x: 2, y: 7 }, [3, 6]] }] }), content: 'svg *', tableRows: 3 },
  { spec: S('boxplot', { categories: ['A', 'B'], series: [{ name: 'Scores', data: [[1, 2, 3, 4, 5], [2, 3, 4, 5, 8]] }] }), content: 'svg *', tableRows: 2 },
  { spec: S('function', { functions: [{ expression: 'sin(x)', label: 'Sine', domain: [-3, 3] }] }), content: 'svg *' },
  { spec: S('paper_chart', { categories: ['A', 'B'], series: [{ name: 'Trend', kind: 'line', data: [1, 2] }, { name: 'Counts', kind: 'bar', data: [3, 4] }, { name: 'Samples', kind: 'scatter', data: [4, 2] }] }), content: 'svg *', tableRows: 2 },
  { spec: S('flowchart', { nodes, edges }), content: 'svg *' },
  { spec: S('sequence', { nodes: [{ id: 'student', label: 'Student' }, { id: 'tutor', label: 'Tutor' }], edges: [{ from: 'student', to: 'tutor', label: 'asks' }] }), content: 'svg *' },
  { spec: S('state', { nodes: [{ id: 'idle', label: 'Idle' }, { id: 'ready', label: 'Ready' }], edges: [{ from: 'idle', to: 'ready', label: 'start' }] }), content: 'svg *' },
  { spec: S('tree', { nodes: [{ id: 'root', label: 'Root' }, { id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }], edges: [{ from: 'root', to: 'left' }, { from: 'root', to: 'right' }] }), content: 'svg *' },
  { spec: S('mindmap', { nodes: [{ id: 'root', label: 'Topic' }, { id: 'branch', label: 'Branch' }], edges: [{ from: 'root', to: 'branch' }] }), content: 'svg *' },
  { spec: S('timeline', { items: [{ label: 'Start', value: '1900', detail: 'x' }, { label: 'Finish', value: '1950', detail: 'y' }] }), content: 'svg *', tableRows: 2 },
  { spec: S('process', { items: [{ label: 'Collect' }, { label: 'Compare' }, { label: 'Decide' }] }), content: 'svg *', tableRows: 3 },
  { spec: S('comparison', { items: [{ label: 'Option A', value: 'Fast' }, { label: 'Option B', value: 'Simple' }] }), content: 'svg *', tableRows: 2 },
  { spec: S('number_line', { items: [{ label: 'Low', value: -2 }, { label: 'Zero', value: 0 }, { label: 'High', value: 3 }] }), content: 'svg *', tableRows: 3 },
  { spec: S('geometry', { shapes: [{ type: 'point', at: [0, 0], label: 'O' }, { type: 'segment', from: [0, 0], to: [3, 2], label: 'AB' }, { type: 'circle', center: [0, 0], radius: 2 }, { type: 'polygon', points: [[0, 0], [3, 0], [2, 2]], label: 'Triangle' }] }), content: 'svg *', tableRows: 4 },
  { spec: S('interactive_simulation', { source: '<div id="x">hi</div><script>document.getElementById("x").textContent="ok"</script>' }), content: 'iframe[data-ready="true"]' },
  { spec: S('svg_illustration', { source: '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#336699"/><circle cx="600" cy="400" r="160" fill="#fff"/></svg>' }), content: 'iframe[data-ready="true"]' },
  { spec: S('geometry_3d', { objects: [{ type: 'box' }, { type: 'sphere', position: [2, 0, 0] }] }), content: 'canvas' },
];

for (const { spec, content, tableRows } of CASES) {
  test('visualization template ' + spec.template + ' renders with the unified tool contract', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && /global-error/.test(m.text())) errors.push(m.text()); });
    await mockAuthedApp(page);
    await page.route('**/api/**/chat/stream', (route) => route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: tool_use\ndata: ' + JSON.stringify([{ id: 'v1', name: 'render_intelligent_ui', input: {version:1,nodes:[{...spec,id:"visual",type:"visualization"}]} }]) + '\n\n',
        'event: tool_result\ndata: ' + JSON.stringify({ id: 'v1', name: 'render_intelligent_ui', ok: true, status: 'completed', visualizations: [{...spec,nodeId:"visual",index:0}], output: 'Visualization ready', durationMs: 1 }) + '\n\n',
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
      window.__testActivateMainView('chatView');
      await window.askChatTurn('draw');
    });
    const card = page.locator('.visualization-card').last();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.locator('.visualization-stage ' + content).first()).toBeAttached({ timeout: 15000 });
    await expect(card.locator('.visualization-fallback')).toHaveCount(0);
    if (spec.template === 'heatmap') await card.screenshot({ path: 'test-results/visualization-heatmap.png' });
    if (spec.template === 'process') await card.screenshot({ path: 'test-results/visualization-process.png' });
    if (spec.template === 'number_line') await card.screenshot({ path: 'test-results/visualization-number-line.png' });
    if (spec.template === 'geometry') await card.screenshot({ path: 'test-results/visualization-geometry.png' });
    if (spec.caption) {
      await expect(card.locator('h3')).toHaveText(spec.title);
      await expect(card.locator('.visualization-header .visualization-caption')).toHaveCount(0);
      await expect(card.locator('.visualization-figure > .visualization-caption')).toHaveText(spec.caption);
    }
    if (spec.template === 'svg_illustration') {
      const illustration = card.frameLocator('iframe.visualization-extension').locator('svg[role="img"]');
      await expect(illustration).toHaveCount(1);
      await expect(illustration).toHaveAttribute('aria-label', spec.accessibilitySummary);
      const bounds = await illustration.evaluate((image) => {
        const rect = image.getBoundingClientRect();
        return { width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
      });
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
      expect(bounds.width).toBeLessThanOrEqual(bounds.viewportWidth + 1);
      expect(bounds.height).toBeLessThanOrEqual(bounds.viewportHeight + 1);
      await card.screenshot({ path: 'test-results/svg-illustration-fit.png' });
    }

    // Visuals are inline content. The retired workbench/table/download
    // toolbar is not part of the current surface contract.
    await expect(card.locator('[data-viz-action]')).toHaveCount(0);
    await expect(card.locator('.visualization-data')).toBeHidden();
    if (tableRows) await expect(card.locator('.visualization-data tbody tr')).toHaveCount(tableRows);
    expect(errors).toEqual([]);
  });
}
