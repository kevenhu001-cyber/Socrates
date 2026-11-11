import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function show(page, template, payload) {
  const spec = { version: 1, template, title: '$E=mc^2$', accessibilitySummary: 'Formula regression', payload };
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: [
    'event: tool_use\ndata: ' + JSON.stringify([{ id: 'math', name: 'render_intelligent_ui', input: {version:1,nodes:[{...spec,id:"visual",type:"visualization"}]} }]) + '\n\n',
    'event: tool_result\ndata: ' + JSON.stringify({ id: 'math', name: 'render_intelligent_ui', ok: true, status: 'completed', visualizations: [{...spec,nodeId:"visual",index:0}], output: 'Ready' }) + '\n\n',
    'data: [DONE]\n\n',
  ].join('') }));
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
  await expect(card.locator('h3 .katex')).toBeVisible();
  return card;
}

test('SVG chart formula labels are typeset', async ({ page }) => {
  const card = await show(page, 'bar', { categories: ['$x^2$', '$x^3$'], series: [{ name: 'n', data: [2, 3] }] });
  await expect(card.locator('svg foreignObject .katex').first()).toBeVisible();
  await card.screenshot({ path: 'test-results/visualization-math-chart.png' });
});

test('sandbox formulas rerender after local calculation without replacing controls', async ({ page }) => {
  const card = await show(page, 'interactive_simulation', { source: '<button id="inc">Increment</button><p id="result">$x^2=4$</p><script>let x=2;document.getElementById("inc").onclick=()=>{x++;document.getElementById("result").textContent="$x^2="+(x*x)+"$"}</script>' });
  const frame = card.frameLocator('iframe');
  await expect(frame.locator('#result math')).toBeVisible();
  await frame.locator('#inc').click();
  await expect(frame.locator('#result math')).toBeVisible();
  await expect(frame.locator('#result')).toContainText('9');
  await frame.locator('#inc').click();
  await expect(frame.locator('#result')).toContainText('16');
  await expect(frame.locator('#result math')).toBeVisible();
  await card.screenshot({ path: 'test-results/visualization-math-simulation.png' });
});

test('static SVG illustrations typeset LaTeX inside their sandbox', async ({ page }) => {
  const card = await show(page, 'svg_illustration', { source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160"><text x="30" y="80" font-size="24">$\\frac{a}{b}$</text></svg>' });
  await expect(card.frameLocator('iframe').locator('foreignObject math')).toBeVisible();
  await card.screenshot({ path: 'test-results/visualization-math-illustration.png' });
});
