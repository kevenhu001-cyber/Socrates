import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('topic submit opens a stable chat with one user turn and one live assistant placeholder', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?chat-turns(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        created: true,
        turn: {
          id: '33333333-3333-4333-8333-333333333333',
          sessionId: '22222222-2222-4222-8222-222222222222',
          clientTurnId: 'topic-transition-test',
          status: 'queued',
          model: null,
          generation: 0,
          fullText: null,
          fullReasoning: null,
          toolCalls: [],
          usage: null,
          error: null,
        },
      }),
    });
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor');
  await topicEditor.fill('A stable first conversation turn');
  const startedAt = await page.evaluate(() => performance.now());
  await topicEditor.press('Enter');
  await expect(page.locator('#chatView')).toBeVisible();

  const visibleAfterMs = await page.evaluate((started) => performance.now() - started, startedAt);
  expect(visibleAfterMs).toBeLessThan(250);

  await expect(page.locator('#msgList .msg.user')).toHaveCount(1);
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);
  await expect(page.locator('#msgList .msg.assistant .thinking-placeholder')).toBeVisible();

  const first = await page.evaluate(() => window.stateStore.read('messages').map((message) => ({
    clientId: message.clientId,
    role: message.role,
    type: message.type,
  })));
  expect(first.map((message) => message.role)).toEqual(['user', 'assistant']);
  expect(first[1].type).toBe('streaming');

  await page.waitForTimeout(250);
  const settled = await page.evaluate(() => ({
    handoffPresent: Boolean(window.__socratesSyncCtl),
    messages: window.stateStore.read('messages').map((message) => ({
      clientId: message.clientId,
      role: message.role,
      type: message.type,
    })),
  }));
  expect(settled.handoffPresent).toBe(false);
  expect(settled.messages).toEqual(first);
});
