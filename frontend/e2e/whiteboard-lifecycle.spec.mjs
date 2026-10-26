import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test('whiteboard roots render and dispose with their message output', async ({ page }) => {
  const errors = [];
  const externalRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== 'http://127.0.0.1:4173') externalRequests.push(url.href);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const spec = {
    version: 1, template: 'whiteboard', title: 'Lifecycle whiteboard', accessibilitySummary: 'One note in a whiteboard.',
    payload: { nodes: [{ id: 'first', label: 'Shared root lifecycle' }] },
  };
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'whiteboard-turn', role: 'assistant', type: 'assistant', rawText: 'A note for this conversation.',
    toolCalls: [{ id: 'whiteboard-tool', name: 'render_visualization', input: spec, status: 'completed', textOffset: 0, output: 'Ready' }],
  }] });
  const card = page.locator('.visualization-card');
  await expect(card.locator('.tl-container')).toBeVisible({ timeout: 20000 });
  await expect(card).toContainText('Shared root lifecycle');
  const note = page.getByTestId('canvas').getByText('Shared root lifecycle', { exact: true });
  const ink = await note.evaluate((node) => ({ paragraph: getComputedStyle(node).color, editor: getComputedStyle(node.parentElement).color }));
  expect(ink.paragraph).toBe(ink.editor);
  await card.screenshot({ path: 'test-results/whiteboard-palette-owner.png' });
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [] });
    window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'whiteboard-release' });
  });
  await expect(page.locator('.tl-container')).toHaveCount(0);
  await expect(page.locator('.visualization-card')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
