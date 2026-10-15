import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function openApp(page) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function delayStreamingBridge(page) {
  await page.evaluate(() => {
    const original = window.addStreamingMessage;
    window.__streamGate = new Promise((resolve) => { window.__releaseStreamGate = resolve; });
    window.addStreamingMessage = async (options) => {
      window.__firstRetry = options.onRetry;
      window.__waitingForStream = true;
      await window.__streamGate;
      return original(options);
    };
    window.attachments.push({ kind: 'text', name: 'submitted.txt', text: 'submitted attachment' });
  });
}

for (const surface of ['chat', 'topic']) {
  test(`${surface} send clears the draft and preserves next-turn attachments during a cold stream load`, async ({ page }) => {
    await openApp(page);
    if (surface === 'chat') {
      await page.evaluate(() => {
        window.stateStore.dispatch({ type: 'state/batch', patch: {
          phase: 'chat', topic: 'Feedback test', currentSessionId: '11111111-1111-4111-8111-111111111111',
        } });
        window.appMode = 'chat';
        window.__testActivateMainView('chatView');
      });
    }
    await delayStreamingBridge(page);
    const editor = page.locator('#composerRoot .rich-composer-editor').first();
    await editor.fill('Respond immediately');
    await page.evaluate((surface) => {
      window.__sendPromise = surface === 'chat'
        ? window.submitChatMessage(null, { blurAfterSend: true })
        : window.startSession();
    }, surface);
    await expect.poll(() => page.evaluate(() => !!window.__waitingForStream)).toBe(true);
    await expect(editor).toHaveText('');
    expect(await page.evaluate(() => window.attachments.length)).toBe(0);
    await expect(page.locator('#msgList .msg.user').last()).toContainText('Respond immediately');

    await page.evaluate(() => {
      window.attachments.push({ kind: 'text', name: 'next.txt', text: 'keep for the next turn' });
      window.__releaseStreamGate();
      return window.__sendPromise;
    });
    expect(await page.evaluate(() => window.attachments.map((entry) => entry.name))).toEqual(['next.txt']);
  });
}

test('first-turn placeholder retry sends the original text and attachment', async ({ page }) => {
  const requests = [];
  await openApp(page);
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"Ready"}}]}\n\ndata: [DONE]\n\n' });
  });
  await delayStreamingBridge(page);
  await page.locator('#composerRoot .rich-composer-editor').first().fill('Read my original notes');
  await page.evaluate(() => { window.__sendPromise = window.startSession(); });
  await expect.poll(() => page.evaluate(() => !!window.__waitingForStream)).toBe(true);
  await page.evaluate(() => { window.__releaseStreamGate(); return window.__sendPromise; });
  await expect.poll(() => requests.length).toBe(1);
  // Use the callback supplied to the real placeholder, including before an
  // API turn has replaced its loading/error chrome.
  await page.evaluate(() => window.__firstRetry());
  await expect.poll(() => requests.length).toBe(2);
  const user = requests[1].messages.filter((message) => message.role === 'user').pop();
  expect(JSON.stringify(user.content)).toContain('Read my original notes');
  expect(JSON.stringify(user.content)).toContain('submitted.txt');
});

test('home upload opens a file chooser, writing activates its template, and dismissal hides the row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openApp(page);
  await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, (route) => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'uploaded-notes', name: 'notes.txt', kind: 'text', mimeType: 'text/plain', size: 10 }),
  }));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-home-action="upload"]').click();
  await (await chooser).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Test notes') });
  await expect(page.locator('#composerAttachmentChips')).toContainText('notes.txt');
  await expect.poll(() => page.evaluate(() => window.attachments[0]?.fileId)).toBe('uploaded-notes');
  await page.locator('[data-home-action="write"]').click();
  await expect.poll(() => page.evaluate(() => window._activeTemplate?.extensionKey)).toBe('write');
  const row = page.locator('.home-quick-action').filter({ has: page.locator('[data-home-action="write"]') });
  await row.hover();
  await row.locator('[data-home-dismiss]').click();
  await expect(row).toBeHidden();
  await page.screenshot({ path: 'test-results/performance-home-shortcuts-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.home-quick-actions')).toBeHidden();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: 'test-results/performance-home-shortcuts-mobile.png' });
});
