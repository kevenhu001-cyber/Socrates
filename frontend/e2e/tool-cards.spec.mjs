// Tool-card regression coverage: search results must remain visible after the
// response completes, and code execution must show its streamed output plus a
// generated image artifact.

import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLefQAAAABJRU5ErkJggg==',
  'base64',
);

test('tool cards show expanded web results, execution output, and image artifacts', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/files/plot-1/raw**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  });
  await page.route('**/api/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"search-1","name":"web_search","input":{"query":"Socrates learning"}}]\n\n',
      'event: tool_result\ndata: {"id":"search-1","ok":true,"status":"completed","output":"two sources","results":[{"title":"Trusted source","url":"https://example.test/source","snippet":"A concise result.","date":"2026-07-15"},{"title":"Unsafe source","url":"javascript:alert(1)","snippet":"Must not become executable."}]}\n\n',
      'event: tool_use\ndata: [{"id":"code-1","name":"code_interpreter","input":{"language":"python","code":"import matplotlib.pyplot as plt\\nprint(42)\\nplt.plot([0, 1])\\nplt.savefig(\u0027artifacts/plot.png\u0027)\\n# generated for the learner"}}]\n\n',
      'event: tool_progress\ndata: {"id":"code-1","phase":"ready","chunk":"","elapsedMs":5}\n\n',
      'event: tool_progress\ndata: {"id":"code-1","phase":"stdout","chunk":"answer: 42\\n","elapsedMs":12}\n\n',
      'event: tool_result\ndata: {"id":"code-1","ok":true,"status":"completed","output":"answer: 42\\n","stderr":"plot backend: ok","durationMs":15,"artifacts":[{"id":"plot-1","mimeType":"image/png"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Completed the requested work."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.state.phase = 'chat';
    window.state.currentSessionId = '11111111-1111-4111-8111-111111111111';
    window.state.messages = [{ clientId: 'user-1', role: 'user', rawText: 'Run the tools', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Run the tools');
  });

  const search = page.locator('.agent-tool-card.websearch').last();
  await expect(search).toHaveClass(/open/);
  await expect(search.locator('.web-search-results')).toBeVisible();
  await expect(search.locator('.wsr-title')).toHaveCount(2);
  await expect(search.locator('.wsr-title').first()).toHaveAttribute('href', 'https://example.test/source');
  await expect(search.locator('.wsr-title').nth(1)).toHaveAttribute('href', '#');

  const code = page.locator('.agent-tool-card.codeint').last();
  await expect(code).toHaveClass(/open/);
  await expect(code.locator('.agent-tool-code')).toContainText('plt.savefig');
  await expect(code.locator('.agent-tool-out')).toContainText('answer: 42');
  await expect(code.locator('.agent-tool-out')).toContainText('[stderr]');
  await expect(code.locator('img.exec-artifact-image')).toBeVisible();

  const header = code.locator('.agent-tool-head');
  await header.focus();
  await page.keyboard.press('Enter');
  await expect(code).not.toHaveClass(/open/);
  await page.keyboard.press('Enter');
  await expect(code).toHaveClass(/open/);

  // Compact layout must keep the card inside the viewport and preserve the
  // expanded result area on a phone-sized screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(search.locator('.web-search-results')).toBeVisible();
  const bounds = await code.boundingBox();
  expect(bounds && bounds.width).toBeLessThanOrEqual(390);
});
