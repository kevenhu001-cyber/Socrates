import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('first conversation and reload presentation converge to the exact same UI structure', async ({ page }) => {
  let savedSession = null;

  await mockAuthedApp(page);
  page.on('console', (msg) => console.log('[PAGE]', msg.text()));
  page.on('pageerror', (err) => console.log('[PAGE ERROR]', err));

  // Register session routes AFTER mockAuthedApp so it takes precedence
  await page.route(/\/api\/(?:v2\/)?sessions(?:\/[^/?#]+)?(?:\?|$)/, async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'POST' || req.method() === 'PATCH') {
      const postData = req.postDataJSON() || {};
      if (!savedSession) {
        savedSession = {
          id: postData.id || 'conv-test-1111-2222-3333',
          title: postData.topic || 'First Conversation Test',
          topic: postData.topic,
          domain: postData.topic,
          mode: 'chat',
          phase: 'chat',
          messages: [],
          kbNodes: [],
        };
      }
      if (Array.isArray(postData.messages)) {
        for (const msg of postData.messages) {
          const idx = savedSession.messages.findIndex((m) => m.clientId && m.clientId === msg.clientId);
          if (idx >= 0) savedSession.messages[idx] = msg;
          else savedSession.messages.push(msg);
        }
      }
      Object.assign(savedSession, { ...postData, messages: savedSession.messages });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: savedSession.id, ...savedSession }),
      });
      return;
    }
    // GET /api/sessions/:id
    if (req.method() === 'GET' && savedSession && url.includes(savedSession.id)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedSession),
      });
      return;
    }
    // GET /api/sessions
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: savedSession ? [savedSession] : [] }),
    });
  });

  await page.route(/\/api\/(?:v2\/)?chat-turns(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        created: true,
        turn: {
          id: 'turn-1',
          sessionId: savedSession?.id || 'conv-test-1111-2222-3333',
          status: 'queued',
          toolCalls: [],
        },
      }),
    });
  });

  const sseBody = [
    'data: {"choices":[{"delta":{"content":"Quantum entanglement is "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"a physical phenomenon where pairs of particles remain connected."}}]}\n\n',
    'data: [DONE]\n\n',
  ].join('');

  await page.route(/\/api\/(?:v2\/)?(?:chat\/stream|minimax\/v1\/chat\/completions)(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  // Type into composer on landing screen
  const topicEditor = page.locator('#composerRoot .rich-composer-editor');
  await topicEditor.fill('What is quantum entanglement?');
  await topicEditor.press('Enter');

  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('#msgList .msg.user')).toHaveCount(1);
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);

  // Wait for stream to finish and settle
  await expect(page.locator('#msgList .msg.assistant .thinking-status')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Ensure save occurred
  await page.evaluate(() => window.saveCurrentSession && window.saveCurrentSession());
  await page.waitForTimeout(500);

  // Measure Live State
  const liveState = await page.evaluate(() => {
    const userMsg = document.querySelector('#msgList .msg.user');
    const userBody = userMsg?.querySelector('.msg-body');
    const asstMsg = document.querySelector('#msgList .msg.assistant');
    const asstBody = asstMsg?.querySelector('.msg-body');

    const getMetrics = (el) => {
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        tagName: el.tagName,
        innerHTML: el.innerHTML,
        hasP: Boolean(el.querySelector('p')),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        padding: cs.padding,
        margin: cs.margin,
        whiteSpace: cs.whiteSpace,
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
      };
    };

    return {
      sessionId: window.stateStore.read('currentSessionId'),
      userBody: getMetrics(userBody),
      asstBody: getMetrics(asstBody),
      chatViewVisible: !document.getElementById('chatView')?.classList.contains('hidden'),
      topicSetupHidden: document.getElementById('topicSetup')?.classList.contains('hidden'),
      conversationActive: document.body.dataset.conversationActive,
    };
  });

  // Verify live state
  expect(liveState.chatViewVisible).toBe(true);
  expect(liveState.topicSetupHidden).toBe(true);
  expect(liveState.conversationActive).toBe('true');
  expect(liveState.userBody.hasP).toBe(false);

  // Reload the page into the session
  await gotoAndSettle(page, `/?chat=${liveState.sessionId}`);
  await waitForAppShell(page);

  await expect(page.locator('#msgList .msg.user')).toHaveCount(1);
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);

  // Measure Reload State
  const reloadState = await page.evaluate(() => {
    const userMsg = document.querySelector('#msgList .msg.user');
    const userBody = userMsg?.querySelector('.msg-body');
    const asstMsg = document.querySelector('#msgList .msg.assistant');
    const asstBody = asstMsg?.querySelector('.msg-body');

    const getMetrics = (el) => {
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        tagName: el.tagName,
        innerHTML: el.innerHTML,
        hasP: Boolean(el.querySelector('p')),
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        padding: cs.padding,
        margin: cs.margin,
        whiteSpace: cs.whiteSpace,
        backgroundColor: cs.backgroundColor,
        borderRadius: cs.borderRadius,
      };
    };

    return {
      userBody: getMetrics(userBody),
      asstBody: getMetrics(asstBody),
      chatViewVisible: !document.getElementById('chatView')?.classList.contains('hidden'),
      topicSetupHidden: document.getElementById('topicSetup')?.classList.contains('hidden'),
      conversationActive: document.body.dataset.conversationActive,
    };
  });

  // Compare Live vs Reload!
  expect(reloadState.userBody.hasP).toBe(false);
  expect(reloadState.userBody.fontSize).toBe(liveState.userBody.fontSize);
  expect(reloadState.userBody.lineHeight).toBe(liveState.userBody.lineHeight);
  expect(reloadState.userBody.padding).toBe(liveState.userBody.padding);
  expect(reloadState.userBody.borderRadius).toBe(liveState.userBody.borderRadius);
  expect(reloadState.userBody.backgroundColor).toBe(liveState.userBody.backgroundColor);

  expect(reloadState.asstBody.fontSize).toBe(liveState.asstBody.fontSize);
  expect(reloadState.asstBody.lineHeight).toBe(liveState.asstBody.lineHeight);

  expect(reloadState.conversationActive).toBe(liveState.conversationActive);
  expect(reloadState.chatViewVisible).toBe(liveState.chatViewVisible);
  expect(reloadState.topicSetupHidden).toBe(liveState.topicSetupHidden);
});
