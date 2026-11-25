import { test, expect } from './_state-fixture.mjs';
import { readFileSync } from 'node:fs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function openApp(page) {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'feedback-file',
        name: 'attachment.txt',
        mimeType: 'text/plain',
        size: 10,
        kind: 'text',
      }),
    }),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function delayStreamingChunk(page) {
  const report = JSON.parse(
    readFileSync(new URL('../dist/.vite/entry-graph.json', import.meta.url), 'utf8'),
  );
  const streaming = report.modules.find((item) => item.id === 'src/chat/turn/streaming.ts');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(`**/${streaming.chunk}`, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  return { release, requested: () => requested };
}

async function attachTextFile(page, name, text) {
  await page.locator('#composerAttachInput').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(1);
}

for (const surface of ['chat', 'topic']) {
  test(`${surface} send clears the draft and preserves next-turn attachments during a cold stream load`, async ({
    page,
  }) => {
    await openApp(page);
    if (surface === 'chat') {
      await page.evaluate(() => {
        window.__socratesTestState.patch({
          session: {
            phase: 'chat',
            topic: 'Feedback test',
            currentSessionId: '11111111-1111-4111-8111-111111111111',
          },
        });
        window.__testActivateMainView('chatView');
      });
    }
    await attachTextFile(page, 'submitted.txt', 'submitted attachment');
    const editor = page.locator('#composerRoot .rich-composer-editor').first();
    await editor.fill('Respond immediately');
    const streaming = await delayStreamingChunk(page);
    try {
      await page.evaluate((surface) => {
        window.__sendPromise =
          surface === 'chat'
            ? window.submitChatMessage(null, { blurAfterSend: true })
            : window.startSession();
      }, surface);
      await expect.poll(streaming.requested).toBe(true);
      await expect(editor).toHaveText('');
      await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveCount(0);
      await expect(page.locator('#msgList .msg.user').last()).toContainText('Respond immediately');

      await attachTextFile(page, 'next.txt', 'keep for the next turn');
      streaming.release();
      await page.evaluate(() => window.__sendPromise);
      await expect(page.locator('#composerAttachmentChips .attachment-chip')).toHaveAttribute(
        'title',
        /next\.txt/,
      );
    } finally {
      streaming.release();
    }
  });
}

test('retrying a failed first turn sends the original text and attachment', async ({ page }) => {
  const requests = [];
  await openApp(page);
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await route.fulfill({ status: 400, json: { error: 'Temporary generation failure' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"Ready"}}]}\n\ndata: [DONE]\n\n',
    });
  });
  await attachTextFile(page, 'submitted.txt', 'submitted attachment');
  await page.locator('#composerRoot .rich-composer-editor').first().fill('Read my original notes');
  await page.evaluate(() => window.startSession());
  const failure = page.locator('#msgList .msg-error[role="alert"]').last();
  await expect(failure.locator('.msg-status-title')).toBeVisible();
  await expect(failure.locator('.msg-status-icon')).toBeVisible();
  const action = failure.locator('.msg-retry-btn');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(action).toBeVisible();
  const [cardBox, buttonBox] = await Promise.all([failure.boundingBox(), action.boundingBox()]);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  await action.click();
  await expect.poll(() => requests.length).toBe(2);
  const user = requests[1].messages.filter((message) => message.role === 'user').pop();
  expect(JSON.stringify(user.content)).toContain('Read my original notes');
  expect(JSON.stringify(user.content)).toContain('submitted.txt');
});

test('home upload and the writing template keep the mobile rail usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openApp(page);

  /* The landing composer's attach input is the home upload path. */
  await page.locator('#composerAttachInput').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Test notes'),
  });
  await expect(page.locator('#composerAttachmentChips')).toContainText('notes.txt');
  await expect(page.locator('#composerAttachmentChips .attachment-chip')).not.toHaveClass(
    /pending|error/,
  );

  /* Writing is a composer tool, not a separate home shortcut. */
  await page.locator('#composerToolsBtn').click();
  await page.locator('#composerToolsMenu [data-composer-action="write"]:visible').first().click();
  await expect
    .poll(() => page.evaluate(() => window.__socratesTestState.activeTemplate()?.extensionKey))
    .toBe('write');
  await page.screenshot({ path: 'test-results/performance-home-shortcuts-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  const composer = page.locator('#composerInputWrap');
  await expect(composer).toBeVisible();
  await expect(composer.locator('#composerToolsBtn')).toBeVisible();
  await expect(composer.locator('#composerMicBtn')).toBeVisible();
  await expect(composer.locator('#composerPrimaryBtn')).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: 'test-results/performance-home-shortcuts-mobile.png' });
});
