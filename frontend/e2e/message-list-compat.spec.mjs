import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';

import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('message list renders user messages through React', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  /* App boots into topic-setup with chatView hidden. Bubble lives
     inside chatView; force it visible so Playwright sees the
     elements as visible. */
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
  });

  await expect(page.locator('#msgList')).not.toHaveAttribute('data-mounted-by', /.+/);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    window.addMessage('user', 'Hello from the message-list compat spec.');
  });

  const userBubble = page.locator(
    '[data-client-id^="msg-"].msg.user .msg-body',
  );
  await expect(userBubble).toHaveCount(1);
  await expect(userBubble).toContainText('Hello from the message-list compat spec.');

  const toolbar = page.locator('[data-client-id^="msg-"].msg.user .msg-toolbar');
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Copy"]')).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Edit message"]')).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Delete message"]')).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Regenerate response"]')).toHaveCount(0);
});

test('message list renders assistant messages with toolbar and model label', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
  });

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    /* Replicate the same finalize step addStreamingMessage → finish()
       takes (body.innerHTML gets set, html is computed via
       renderAssistantHTML). We push a finalized assistant entry so the
       React message list takes over. */
    window.addMessage('assistant', 'Sure — here is the answer.');
  });

  const assistantBubble = page.locator(
    '[data-client-id^="msg-"].msg.assistant .msg-body',
  );
  await expect(assistantBubble).toHaveCount(1);
  await expect(assistantBubble).toContainText('here is the answer');

  const toolbar = page.locator(
    '[data-client-id^="msg-"].msg.assistant .msg-toolbar',
  );
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Helpful"]')).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Not helpful"]')).toHaveCount(1);
  await expect(toolbar.locator('button.msg-toolbar-btn[aria-label="Regenerate response"]')).toHaveCount(1);
  await expect(toolbar.getByRole('button', { name: 'More actions', exact: true })).toHaveCount(1);
  await expect(toolbar.getByRole('menuitem', { name: 'Branch from here' })).toHaveCount(0);
});

test('message list snapshots react to message-added events', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
  });

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
  });

  await expect(page.locator('#msgList .msg')).toHaveCount(0);

  await page.evaluate(() => {
    window.addMessage('user', 'first');
    window.addMessage('assistant', 'second reply.');
    window.addMessage('user', 'third');
  });

  await expect(page.locator('#msgList .msg')).toHaveCount(3);
  await expect(page.locator('#msgList .msg.user')).toHaveCount(2);
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);
});

test('message list toolbar copy button reads rawText and triggers toast', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.__messageListSpecToast = null;
    const showToastMock = (msg) => { window.__messageListSpecToast = msg; };
    window.showToast = showToastMock;
    if (window.__socratesLegacy?.messages) window.__socratesLegacy.messages.showToast = showToastMock;
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    window.addMessage('user', 'copy me please');
  });

  const userBubble = page.locator('[data-client-id^="msg-"].msg.user').first();
  await userBubble.hover();
  await userBubble.locator('button.msg-toolbar-btn[aria-label="Copy"]').click();

  await expect.poll(async () => {
    return await page.evaluate(() => window.__messageListSpecToast || null);
  }).toMatch(/Copied|Copy/);
});

test('message list toolbar action buttons dispatch to legacy window globals', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.__msgSpecEditCalls = [];
    window.__msgSpecFeedbackCalls = [];
    const editMock = (id) => { window.__msgSpecEditCalls.push(id); };
    const deleteMock = (id) => { window.__msgSpecEditCalls.push('del:'+id); };
    const regenMock = (id) => { window.__msgSpecEditCalls.push('regen:'+id); };
    const branchMock = (id) => { window.__msgSpecEditCalls.push('branch:'+id); };
    const feedbackMock = (id, rating) => { window.__msgSpecFeedbackCalls.push([id, rating]); };
    window.editUserMessage = editMock;
    window.deleteUserMessage = deleteMock;
    window.regenerateAssistantMessage = regenMock;
    window.branchFromMessage = branchMock;
    window.sendFeedback = feedbackMock;
    if (window.__socratesLegacy?.messages) {
      window.__socratesLegacy.messages.editUserMessage = editMock;
      window.__socratesLegacy.messages.deleteUserMessage = deleteMock;
      window.__socratesLegacy.messages.regenerateAssistantMessage = regenMock;
      window.__socratesLegacy.messages.branchFromMessage = branchMock;
      window.__socratesLegacy.messages.sendFeedback = feedbackMock;
    }
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '11111111-1111-4111-8111-111111111111' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    window.addMessage('user', 'edit and delete me');
  });

  const userBubble = page.locator('[data-client-id^="msg-"].msg.user').first();
  await userBubble.hover();
  await userBubble.locator('button.msg-toolbar-btn[aria-label="Edit message"]').click();
  await userBubble.locator('button.msg-toolbar-btn[aria-label="Delete message"]').click();

  const result = await page.evaluate(() => window.__msgSpecEditCalls);
  expect(result.length).toBe(2);
  expect(result[0]).toMatch(/^msg-/);
  expect(result[1]).toMatch(/^del:msg-/);

  /* Now an assistant message so feedback + regen + branch get exercised. */
  await page.evaluate(() => {
    window.addMessage('assistant', 'reply A');
    window.addMessage('assistant', 'reply B');
  });

  const assistantBubble = page.locator(
    '[data-client-id^="msg-"].msg.assistant',
  ).first();
  await assistantBubble.hover();
  await assistantBubble.locator('button.msg-toolbar-btn[aria-label="Regenerate response"]').click();
  await assistantBubble.locator('button.msg-toolbar-btn[aria-label="Helpful"]').click();
  await assistantBubble.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Branch from here', exact: true }).click();

  const assistantResult = await page.evaluate(() => ({
    edits: window.__msgSpecEditCalls,
    feedback: window.__msgSpecFeedbackCalls,
  }));
  expect(assistantResult.edits.some((e) => e.startsWith('regen:msg-'))).toBe(true);
  expect(assistantResult.edits.some((e) => e.startsWith('branch:msg-'))).toBe(true);
  expect(assistantResult.feedback).toHaveLength(1);
  expect(assistantResult.feedback[0][1]).toBe('up');
});

test('streaming bubble is removed at finish and React renders the finalized entry', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '22222222-2222-4222-8222-222222222222' });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    window.addMessage('user', 'kick off a stream');
  });

  await expect(page.locator('[data-client-id^="msg-"].msg.user')).toHaveCount(1);

  await page.evaluate(async () => {
    /* Mock the chat stream endpoint so the assistant streaming
       pipeline produces a single 'stream-final' frame. */
    const originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return originalFetch(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const payload = { choices: [{ delta: { content: 'stream-final' } }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
    /* Capture the in-flight ctl so the test can await its
       stream-finished completion before counting bubbles. */
    window.__msgSpecStreamPromise = window.askChatTurn('kick off a stream').catch(() => {});
  });

  await expect.poll(async () => {
    return await page.evaluate(() => Boolean(window.__msgSpecStreamPromise));
  }).toBe(true);
  /* Wait for the askChatTurn promise to settle (stream finished,
     React re-rendered). We allow a small slack because the cleanup
     handoff (legacy bubble removal + publish) happens in the same
     microtask as the bridge publish. */
  await page.evaluate(() => window.__msgSpecStreamPromise);
  await page.waitForTimeout(200);

  await expect(page.locator('[data-client-id^="msg-"].msg.user')).toHaveCount(1);
  await expect(page.locator('[data-client-id^="msg-"].msg.assistant')).toHaveCount(1);
  await expect(page.locator('[data-client-id^="msg-"].msg.assistant .msg-body')).toContainText('stream-final');
  await expect(page.locator('[data-client-id^="msg-"].msg.assistant .msg-toolbar button.msg-toolbar-btn[aria-label="Copy"]')).toHaveCount(1);
});

test('replacing the transcript host remounts its current messages and keeps later updates live', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [] });
    window.addMessage('user', 'Transcript survives host replacement.');
  });
  await expect(page.locator('#msgList .msg-body').first()).toContainText('Transcript survives host replacement.');
  await page.evaluate(() => {
    const host = document.getElementById('msgList');
    host.replaceWith(host.cloneNode(false));
    window.__socratesMountReactCompatibility();
    window.__socratesMountReactCompatibility();
  });
  await expect(page.locator('#msgList .msg.user')).toHaveCount(1);
  await expect(page.locator('#msgList')).toContainText('Transcript survives host replacement.');
  await page.evaluate(() => window.addMessage('user', 'Updates still reach the replacement.'));
  await expect(page.locator('#msgList .msg.user')).toHaveCount(2);
  await expect(page.locator('#msgList')).toContainText('Updates still reach the replacement.');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/transcript-host-replacement.png' });
});
