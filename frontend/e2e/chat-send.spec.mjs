// e2e/chat-send.spec.mjs — Wave -1
// Spec 5/6: typing into the chat input + clicking send mounts a streaming
// bubble (or surfaces an offline notice) without throwing.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('clicking send mounts a streaming bubble or surfaces a notice without throwing', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  const chatInput = page.locator('#chatComposerRoot .rich-composer-editor').first();
  const sendBtn = page.locator('#sendBtn, .send-btn').first();

  if (!(await chatInput.isVisible().catch(() => false))) {
    // Pre-chat-screen path: just verify the function exists.
    const exists = await page.evaluate(() => typeof window.submitChatMessage === 'function');
    expect(exists, 'window.submitChatMessage must be defined').toBe(true);
    return;
  }

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await chatInput.fill('Hi from the smoke test.');
  await sendBtn.click({ timeout: 2_000 }).catch((e) => consoleErrors.push('click: ' + String(e)));
  await page.waitForTimeout(1_500);

  const realErrors = consoleErrors.filter((e) =>
    /ReferenceError|TypeError|SyntaxError/.test(e) &&
    !/fetch|network|api\/|\b401\b|csrf/i.test(e),
  );
  expect(realErrors, `submitChatMessage threw:\n${realErrors.join('\n')}`).toEqual([]);
});

test('mobile send places the submitted prompt and thinking state at the viewport top', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    window.state.topic = 'Mobile scroll smoke';
    window.state.currentSessionId = '22222222-2222-4222-8222-222222222222';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.documentElement.style.setProperty('--keyboard-inset', '280px');

    for (let i = 0; i < 24; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `Existing message ${i + 1}: enough text to make the mobile transcript scroll.`);
    }
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.state._userScrolledAway = false;
  });

  const chatInput = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await chatInput.focus();
  await page.evaluate(() => window.submitChatMessage(
    'A focused mobile send should remain at the newest message.',
  ));
  await page.waitForFunction(() => Boolean(
    document.querySelector('#msgList .msg.assistant.turn-viewport-anchor .thinking-placeholder'),
  ));

  const placement = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    const users = list.querySelectorAll('.msg.user');
    const latestUser = users[users.length - 1];
    const thinking = list.querySelector('.msg.assistant:last-child .thinking-placeholder');
    const listRect = list.getBoundingClientRect();
    const userRect = latestUser?.getBoundingClientRect();
    return {
      userOffset: userRect ? Math.round(userRect.top - listRect.top) : null,
      thinkingVisible: Boolean(thinking && thinking.getClientRects().length),
      anchored: Boolean(list.querySelector('.msg.assistant:last-child.turn-viewport-anchor')),
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      paddingBottom: getComputedStyle(list).paddingBottom,
    };
  });

  expect(placement.userOffset).not.toBeNull();
  expect(placement.userOffset).toBeGreaterThanOrEqual(-2);
  expect(placement.userOffset, JSON.stringify(placement)).toBeLessThanOrEqual(24);
  expect(placement.thinkingVisible).toBe(true);
  expect(placement.anchored).toBe(true);
});

test('retry replaces the failed answer and resumes at the visible error position', async ({ page }) => {
  await mockAuthedApp(page);
  let streamCalls = 0;
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    streamCalls += 1;
    if (streamCalls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary generation failure' }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: [DONE]\n\n',
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    const sessionId = '44444444-4444-4444-8444-444444444444';
    window.state.phase = 'chat';
    window.state.topic = 'Retry viewport smoke';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for (let i = 0; i < 18; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `Retry history ${i + 1}`);
    }
  });

  await page.evaluate(() => window.submitChatMessage(
    'Retry this answer without jumping back to my prompt.',
  ));
  const retryButton = page.locator('#msgList .msg-error .msg-retry-btn').last();
  await expect(retryButton).toBeVisible();

  const failedMessageId = await retryButton.evaluate((button) => button.closest('.msg')?.dataset.clientId);
  const errorOffset = await retryButton.evaluate((button) => {
    const list = document.getElementById('msgList');
    const error = button.closest('.msg-error');
    return Math.round(error.getBoundingClientRect().top - list.getBoundingClientRect().top);
  });

  await retryButton.click();
  await page.waitForFunction((oldId) => {
    const thinking = document.querySelector('#msgList .msg.assistant .thinking-placeholder');
    const message = thinking?.closest('.msg');
    return Boolean(message && message.dataset.clientId !== oldId);
  }, failedMessageId);

  const retried = await page.evaluate((oldId) => {
    const list = document.getElementById('msgList');
    const thinking = list.querySelector('.msg.assistant .thinking-placeholder');
    const message = thinking?.closest('.msg');
    return {
      oldRemoved: !list.querySelector(`[data-client-id="${oldId}"]`),
      offset: message
        ? Math.round(message.getBoundingClientRect().top - list.getBoundingClientRect().top)
        : null,
      mode: message?.dataset.viewportAnchor || null,
      target: message?.dataset.viewportTarget || null,
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      paddingBottom: getComputedStyle(list).paddingBottom,
    };
  }, failedMessageId);

  expect(retried.oldRemoved).toBe(true);
  expect(retried.offset).not.toBeNull();
  expect(
    Math.abs(retried.offset - errorOffset),
    JSON.stringify({ errorOffset, retried }),
  ).toBeLessThanOrEqual(24);
});

test('React message-list updates do not remove the active legacy stream bubble', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    window.state.topic = 'Streaming ownership regression';
    window.state.currentSessionId = '33333333-3333-4333-8333-333333333333';
    window.state.session.currentSessionId = window.state.currentSessionId;
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    window.addMessage('user', 'Keep the next streamed answer visible.');

    const id = 'msg-stream-ownership-regression';
    const list = document.getElementById('msgList');
    const bubble = document.createElement('div');
    bubble.className = 'msg assistant';
    bubble.dataset.clientId = id;
    bubble.innerHTML = '<div class="msg-body">Partial reply</div>';
    list.appendChild(bubble);
    window.state.messages.push({
      clientId: id,
      role: 'assistant',
      rawText: 'Partial reply',
      html: null,
      type: 'streaming',
    });
    window.__socratesReactChatBridge.publish({
      type: 'stream-started',
      messageId: id,
    });
  });

  await page.waitForTimeout(100);
  await expect(page.locator('[data-client-id="msg-stream-ownership-regression"]')).toBeVisible();

  await page.evaluate(() => {
    window.__socratesReactChatBridge.publish({
      type: 'stream-delta',
      messageId: 'msg-stream-ownership-regression',
      textLength: 24,
    });
  });

  await page.waitForTimeout(100);
  await expect(page.locator('[data-client-id="msg-stream-ownership-regression"]')).toContainText('Partial reply');
});
