import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareChatWorkbench, textFrame, completeFrame } from './_chat-workbench.mjs';

test('Stop during a cold transport download prevents the request and a later send still works', async ({ page }) => {
  const report = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
  const transport = report.modules.find((item) => item.id === 'src/chat/streamAttempt.js');
  let release;
  let requested = false;
  let streamRequests = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  page.on('request', (request) => {
    if (/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/.test(request.url())) streamRequests += 1;
  });
  await page.route(`**/${transport.chunk}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await prepareChatWorkbench(page, { streamBody: textFrame('Fresh answer after cancellation.') + completeFrame() });
    const editor = page.locator('#composerRoot .rich-composer-editor').first();
    await editor.fill('Cancel this cold request');
    await page.evaluate(() => { window.__coldSend = window.submitChatMessage(); });
    await expect.poll(() => requested).toBe(true);
    const button = page.locator('#composerPrimaryBtn');
    await expect(button).toHaveAttribute('data-stop', '1');
    expect(streamRequests).toBe(0);
    await button.click();
    release();
    await page.evaluate(() => window.__coldSend);
    expect(streamRequests).toBe(0);
    await expect(button).not.toHaveAttribute('data-stop', '1');

    await editor.fill('Send the fresh turn');
    await button.click();
    await expect(page.locator('#msgList')).toContainText('Fresh answer after cancellation.');
    expect(streamRequests).toBe(1);
  } finally {
    release();
  }
});
