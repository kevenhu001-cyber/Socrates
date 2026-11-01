import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

/* V1 visualization reliability: data the server accepts always draws, a
 * rejected call keeps a readable card with its data, and labelled code fences
 * are never executed as pages. */

const fence = (source) => '```openui\n' + source + '\n```';

test('alias payloads the server accepts draw real data instead of an empty axis', async ({ page }) => {
  const source = 'root = Col([v])\nv = Visualization("bar", "Alias payload", {"labels":["A","B","C"],"values":["3",5,4]}, "s")';
  await prepareChatWorkbench(page, { messages: [{ clientId: 'alias', role: 'assistant', type: 'assistant', rawText: fence(source), html: '' }] });
  const stage = page.locator('.intui-openui .visualization-stage').first();
  await expect(stage).toBeVisible();
  await expect.poll(() => stage.evaluate((el) => {
    const option = window.echarts?.getInstanceByDom(el)?.getOption();
    return option ? option.series[0].data.map((point) => (point && typeof point === 'object' ? point.value : point)) : null;
  })).toEqual([3, 5, 4]);
  await expect(page.locator('.intui-openui .visualization-stage-progress')).toHaveCount(0);
});

test('a rejected render_intelligent_ui call keeps a card with reason, table and repair', async ({ page }) => {
  const source = 'root = Col([v])\nv = Visualization("bar", "Class averages", {"categories":["One","Two"],"series":[{"name":"Math","data":["x","y"]}]}, "s")';
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'rejected', role: 'assistant', rawText: 'Here is the chart.', type: null,
    toolCalls: [{
      id: 'ui-failed', name: 'render_intelligent_ui', status: 'failed', textOffset: 0, output: '',
      error: 'OpenUI chart: Visualization "Class averages": payload.series.0.data: must contain at least one numeric value.',
      errorCode: 'invalid_tool_arguments',
      detail: { stage: 'visualization', nodeId: 'chart', truncated: false, visualizations: [{ template: 'bar', title: 'Class averages', stage: 'semantic', paths: ['payload.series.0.data'], issues: ['payload.series.0.data: must contain at least one numeric value.'] }] },
      input: { version: 1, nodes: [{ id: 'chart', type: 'openui', source }] },
      _run: { phase: 'failed' },
    }],
  }] });
  const card = page.locator('[data-viz-state="failed"]').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.viz-state-title')).toHaveText('Class averages');
  await expect(card).toContainText('The chart could not be drawn');
  await expect(card).toContainText('The chart has no data to draw.');
  const box = await card.boundingBox();
  expect(box.height).toBeGreaterThan(60);
  await card.getByRole('button', { name: 'View as table' }).click();
  await expect(card.locator('table tbody tr')).toHaveCount(2);
  await page.evaluate(() => {
    window.__vizRetries = [];
    document.addEventListener('tool-retry', (event) => window.__vizRetries.push(event.detail));
  });
  await card.getByRole('button', { name: 'Fix with AI' }).click();
  const prompt = await page.evaluate(() => window.__vizRetries[0]?.prompt || '');
  expect(prompt).toContain('render_intelligent_ui');
  expect(prompt).toContain('Class averages');
});

test('labelled JSX fences stay code and never run in the preview iframe', async ({ page }) => {
  const text = 'A component:\n\n```jsx\nexport function Card({ title, children }) {\n  return <div className="card"><h3>{title}</h3><div>{children}</div></div>;\n}\n```\n';
  await prepareChatWorkbench(page, { messages: [{ clientId: 'jsx', role: 'assistant', type: 'assistant', rawText: text, html: null }] });
  await expect(page.locator('#msgList pre code').first()).toContainText('export function Card');
  await expect(page.locator('#msgList iframe')).toHaveCount(0);
});
