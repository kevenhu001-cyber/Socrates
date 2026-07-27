// Tool-card regression coverage: search results must remain visible after the
// response completes, and code execution must show its streamed output plus a
// generated image artifact.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLefQAAAABJRU5ErkJggg==',
  'base64',
);

test('tool activity is grouped by answer and reveals search, code, and artifacts on demand', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const longStdout = 'answer: 42\n' + Array.from({ length: 140 }, (_, i) => `line ${i + 1}: streamed diagnostic output`).join('\n');
  await mockAuthedApp(page);
  await page.route('**/api/**/files/plot-1/raw**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: ONE_PIXEL_PNG });
  });
  await page.route('**/api/**/chat/stream', async (route) => {
    const stream = [
      'event: tool_use\ndata: [{"id":"search-1","name":"web_search","input":{"query":"Socrates learning"}}]\n\n',
      'event: tool_result\ndata: {"id":"search-1","ok":true,"status":"completed","output":"two sources","results":[{"title":"Trusted source","url":"https://example.test/source","snippet":"A concise result.","date":"2026-07-15"},{"title":"Unsafe source","url":"javascript:alert(1)","snippet":"Must not become executable."}]}\n\n',
      'event: tool_use\ndata: [{"id":"code-1","name":"code_interpreter","input":{"language":"python","code":"import matplotlib.pyplot as plt\\nprint(42)\\nplt.plot([0, 1])\\nplt.savefig(\u0027artifacts/plot.png\u0027)\\n# generated for the learner"}}]\n\n',
      'event: tool_progress\ndata: {"id":"code-1","phase":"ready","chunk":"","elapsedMs":5}\n\n',
      'event: tool_progress\ndata: {"id":"code-1","phase":"stdout","chunk":"answer: 42\\n","elapsedMs":12}\n\n',
      'event: tool_result\ndata: ' + JSON.stringify({ id: 'code-1', ok: true, status: 'completed', output: longStdout, stderr: 'plot backend: ok', durationMs: 15, artifacts: [{ id: 'plot-1', mimeType: 'image/png' }] }) + '\n\n',
      'data: {"choices":[{"delta":{"content":"Completed the requested work."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
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

  const group = page.locator('.tool-run-group').last();
  await expect(group).toHaveAttribute('data-state', 'complete');
  await expect(group.locator('.tool-run-summary')).toContainText('Used tools');
  await expect(group.locator('.tool-run-list')).toBeHidden();
  await group.locator('.tool-run-summary').click();
  await expect(group.locator('.tool-run-list')).toBeVisible();

  const search = group.locator('.agent-tool-card.websearch').last();
  await expect(search).not.toHaveClass(/open/);
  await search.locator('.agent-tool-head').click();
  await expect(search).toHaveClass(/open/);
  await expect(search.locator('.web-search-results')).toBeVisible();
  await expect(search.locator('.wsr-header')).toContainText('2 sources for "Socrates learning"');
  await expect(search.locator('.wsr-title')).toHaveCount(2);
  await expect(search.locator('.wsr-title').first()).toHaveAttribute('href', 'https://example.test/source');
  await expect(search.locator('.wsr-title').nth(1)).toHaveAttribute('href', '#');
  await expect(search.locator('.wsr-title').nth(1)).toHaveClass(/is-disabled/);
  await expect(search.locator('.wsr-title').nth(1)).toHaveAttribute('tabindex', '-1');
  await expect(search).toHaveAttribute('data-tool-state', 'complete');
  await expect(search.locator('.agent-tool-status')).toContainText('Done');
  await expect(search.locator('.wsr-copy-all')).toBeVisible();
  await search.locator('.wsr-copy-all').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Trusted source - https://example.test/source');

  const code = group.locator('.agent-tool-card.codeint').last();
  await expect(code).not.toHaveClass(/open/);
  await code.locator('.agent-tool-head').click();
  await expect(code).toHaveClass(/open/);
  await expect(code.locator('.agent-tool-code')).toContainText('plt.savefig');
  await expect(code.locator('.agent-tool-out')).toContainText('answer: 42');
  await expect(code.locator('.agent-tool-out')).toContainText('[stderr]');
  await expect(code.locator('.agent-tool-output-text')).toHaveClass(/is-collapsed/);
  await expect(code.locator('[data-tool-copy="code"]')).toBeVisible();
  await expect(code.locator('[data-tool-copy="output"]')).toBeVisible();
  await code.locator('[data-tool-copy="code"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('plt.savefig');
  await expect(code.locator('[data-tool-copy="code"]')).toContainText('Copied');
  await code.locator('.agent-tool-output-toggle').click();
  await expect(code.locator('.agent-tool-output-text')).not.toHaveClass(/is-collapsed/);
  // P_artifact-single-mount — image artifacts render inline in the
  // message body (at-a-glance visibility), not inside the tool card.
  // Document-wide dedup means exactly one copy per fileId exists;
  // find it on the surrounding assistant bubble instead of the card.
  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble.locator('img.exec-artifact-image')).toBeVisible();

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

test('tool cards replay tool_call_delta frames that arrive before tool_use', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    const args = JSON.stringify({
      language: 'python',
      code: 'print("early delta")\nvalue = 7',
    });
    const stream = [
      'event: tool_call_delta\ndata: ' + JSON.stringify({
        index: 0,
        id: 'early-code',
        name: 'code_interpreter',
        arguments: args,
        final: true,
      }) + '\n\n',
      'event: tool_use\ndata: [{"id":"early-code","name":"code_interpreter","input":{}}]\n\n',
      'event: tool_result\ndata: ' + JSON.stringify({
        id: 'early-code',
        ok: true,
        status: 'completed',
        output: 'early delta output',
        durationMs: 10,
        artifacts: [],
      }) + '\n\n',
      'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.state.phase = 'chat';
    window.state.currentSessionId = '99999999-9999-4999-8999-999999999999';
    window.state.messages = [{ clientId: 'user-9', role: 'user', rawText: 'Run early delta tool', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Run early delta tool');
  });

  const group = page.locator('.tool-run-group').last();
  await group.locator('.tool-run-summary').click();
  const code = group.locator('.agent-tool-card.codeint').last();
  await expect(code).not.toHaveClass(/open/);
  await code.locator('.agent-tool-head').click();
  await expect(code).toHaveClass(/open/);
  await expect(code.locator('.agent-tool-code')).toContainText('print("early delta")');
  await expect(code.locator('.agent-tool-input')).toContainText('python');
  await expect(code.locator('.agent-tool-input')).toContainText('print("early delta")');
  await expect(code.locator('.agent-tool-code')).not.toHaveClass(/agent-tool-code-streaming/);
  await expect(code.locator('.agent-tool-out')).toContainText('early delta output');
});
