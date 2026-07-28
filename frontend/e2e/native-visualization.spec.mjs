import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const lnSpec = {
  version: 1,
  template: 'function',
  title: 'y = ln(x)',
  caption: 'Natural logarithm',
  accessibilitySummary: 'The natural logarithm is defined for x greater than zero, has a vertical boundary at x equals zero, and passes through (1, 0).',
  payload: { functions: [{ expression: 'ln(x)', label: 'ln(x)' }], xLabel: 'x', yLabel: 'y' },
};

async function renderLn(page) {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: ' + JSON.stringify([{ id: 'visual-ln', name: 'render_visualization', input: lnSpec }]) + '\n\n',
      'event: tool_result\ndata: ' + JSON.stringify({ id: 'visual-ln', name: 'render_visualization', ok: true, status: 'completed', visualization: lnSpec, output: 'Visualization ready', durationMs: 1 }) + '\n\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'The curve is shown below.' } }] }) + '\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(async () => {
    window.state.phase = 'chat';
    window.state.currentSessionId = '99999999-9999-4999-8999-999999999999';
    window.state.messages = [{ clientId: 'user-ln', role: 'user', rawText: 'draw y = ln(x)', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('draw y = ln(x)');
  });
  /* P_inline-tools — live chat renders each tool call as a compact
     .tool-inline status row embedded in the message flow (the old
     .tool-run-summary card group only appears in detailed/history
     replay). The chart mounts in the anchored host right after the
     row, so waiting for the settled row is enough. */
  const row = page.locator('.tool-inline[data-tcid="visual-ln"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-state', 'done');
}

test('native function card renders an actual SVG curve for ln(x)', async ({ page }) => {
  await renderLn(page);
  const card = page.locator('.visualization-card').last();
  await expect(card).toBeVisible();
  await expect(card.locator('svg path')).not.toHaveCount(0);
  await expect(card).toContainText('y = ln(x)');
  await card.locator('[data-viz-action="table"]').click();
  await expect(card.locator('.visualization-table')).toBeVisible();
  await card.locator('[data-viz-action="reset"]').click();
});

test('native function card stays within a 390px mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await renderLn(page);
  await expect(page.locator('.visualization-card')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
