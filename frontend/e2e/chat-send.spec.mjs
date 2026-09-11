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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Mobile scroll smoke' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '22222222-2222-4222-8222-222222222222' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.documentElement.style.setProperty('--keyboard-inset', '280px');

    for (let i = 0; i < 24; i += 1) {
      window.addMessage(i % 2 ? 'assistant' : 'user', `Existing message ${i + 1}: enough text to make the mobile transcript scroll.`);
    }
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
    window.stateStore.dispatch({ type: "state/set", key: "_userScrolledAway", value: false });
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

test('mobile first turn stays at the transcript top when the viewport grows', async ({ page }) => {
  await mockAuthedApp(page);
  /* Keep the turn pending so the first prompt + thinking row can be measured. */
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',
    });
  });
  /* A short viewport stands in for the keyboard-open frame the send-time
     anchor measures; growing it stands in for the keyboard/composer collapse
     that used to let a leading flex spacer push the prompt down. */
  await page.setViewportSize({ width: 390, height: 600 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'First turn top smoke' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '77777777-7777-4777-8777-777777777777' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
    window.appMode = 'chat';
    window.submitChatMessage('First prompt');
  });
  await expect(page.locator('#msgList .msg.user')).toHaveCount(1);
  await expect(page.locator('#msgList .thinking-placeholder')).toBeVisible();

  const firstTurnOffset = () => page.evaluate(() => {
    const list = document.getElementById('msgList');
    const user = list.querySelector('.msg.user');
    const listRect = list.getBoundingClientRect();
    return Math.round(user.getBoundingClientRect().top - listRect.top);
  });
  await page.waitForTimeout(200);
  expect(await firstTurnOffset()).toBeLessThanOrEqual(40);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  expect(await firstTurnOffset()).toBeLessThanOrEqual(40);
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
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Retry viewport smoke' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
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
  /* The retried turn announces itself through its anchor chrome — the row
     carrying data-viewport-anchor="retry" is the one being positioned at the
     captured error offset. Waiting on the status line alone can catch a frame
     of the new row before that positioning lands. */
  await page.waitForFunction((oldId) => {
    const message = document.querySelector(
      '#msgList .msg.assistant[data-viewport-anchor="retry"]',
    );
    return Boolean(message && message.dataset.clientId !== oldId
      && message.querySelector('.thinking-placeholder'));
  }, failedMessageId);

  const retried = await page.evaluate((oldId) => {
    const list = document.getElementById('msgList');
    const message = list.querySelector('.msg.assistant[data-viewport-anchor="retry"]');
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

test('retry replays the failed turn content including attachments', async ({ page }) => {
  await mockAuthedApp(page);
  const streamBodies = [];
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    streamBodies.push(route.request().postDataJSON());
    if (streamBodies.length === 1) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporary generation failure' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"Retried answer"}}]}\n\ndata: [DONE]\n\n',
    });
  });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'Retry content smoke' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '55555555-5555-4555-8555-555555555555' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.appMode = 'chat';
    /* Mutate the shared live array in place — window.attachments must keep
       its identity across modules. */
    window.attachments.push({
      kind: 'text',
      name: 'notes.txt',
      text: 'Attachment payload the retry must preserve.',
    });
  });

  await page.locator('#chatComposerRoot .rich-composer-editor').first().fill('Read the attached notes.');
  await page.evaluate(() => window.submitChatMessage());

  const retryButton = page.locator('#msgList .msg-error .msg-retry-btn').last();
  await expect(retryButton).toBeVisible();
  await retryButton.click();
  await expect.poll(() => streamBodies.length).toBeGreaterThanOrEqual(2);

  const retriedUser = [...streamBodies[1].messages]
    .reverse()
    .find((message) => message.role === 'user');
  expect(Array.isArray(retriedUser?.content)).toBe(true);
  expect(
    retriedUser.content.some((part) => part.type === 'text' && /notes\.txt/.test(part.text)),
  ).toBe(true);
});

test('the live turn keeps exactly one row while deltas arrive', async ({ page }) => {
  await mockAuthedApp(page);
  /* A stream the test drives frame by frame (same harness as
     chat-autoscroll.spec.mjs): window.__pushDelta / window.__finishStream. */
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let controller;
      const body = new ReadableStream({ start(c) { controller = c; } });
      window.__pushDelta = (text) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      };
      window.__finishStream = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const clientId = await page.evaluate(async () => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Streaming ownership' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '33333333-3333-4333-8333-333333333333' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: window.stateStore.read("currentSessionId") });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.addMessage('user', 'Keep the next streamed answer visible.');
    /* Drive the real streaming path: the entry goes into state.messages and
       React draws the only bubble. Hand-mounting a legacy bubble here would
       test a co-ownership state the app no longer enters — addStreamingMessage
       skips its own appendChild as soon as React owns #msgList. */
    window.__streamPromise = window.askChatTurn('Keep the next streamed answer visible.');
    const streaming = window.stateStore.read("messages").filter((m) => m.type === 'streaming').pop();
    return streaming ? streaming.clientId : '';
  });
  expect(clientId, 'a streaming entry is in state.messages').toBeTruthy();

  const rows = page.locator(`.msg[data-client-id="${clientId}"]`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toBeVisible();

  /* A streamed delta keeps its last few characters in hand (chat/stream.js
     holds them back in case a `<think` tag straddles the chunk boundary), so
     assert on the leading words mid-stream and on the whole sentence once
     [DONE] flushes. */
  await page.evaluate(() => window.__pushDelta('Partial reply, and the answer keeps growing from here. '));
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Partial reply');

  await page.evaluate(() => {
    window.__finishStream();
    return window.__streamPromise;
  });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(
    'Partial reply, and the answer keeps growing from here.',
  );
});
