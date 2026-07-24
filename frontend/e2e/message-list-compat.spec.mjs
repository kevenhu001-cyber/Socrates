import { expect, test } from '@playwright/test';

import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('message list renders user messages through React', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  /* App boots into topic-setup with chatView hidden. Bubble lives
     inside chatView; force it visible so Playwright sees the
     elements as visible. */
  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
  });

  await expect(page.locator('#msgList')).toHaveAttribute(
    'data-react-migration-runtime',
    'msg-list',
  );

  await page.evaluate(() => {
    const bridge = window.__socratesReactChatBridge;
    if (!bridge) throw new Error('React chat runtime bridge was not installed');
    window.state.phase = 'chat';
    window.state.currentSessionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'msg-list-spec' });
    window.addMessage('user', 'Hello from the message-list compat spec.');
  });

  const userBubble = page.locator(
    '[data-client-id^="msg-"].msg.user .msg-body',
  );
  await expect(userBubble).toHaveCount(1);
  await expect(userBubble).toContainText('Hello from the message-list compat spec.');

  const toolbar = page.locator('[data-client-id^="msg-"].msg.user .msg-toolbar');
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar.locator('[data-action="copy"]')).toHaveCount(1);
  await expect(toolbar.locator('[data-action="edit"]')).toHaveCount(1);
  await expect(toolbar.locator('[data-action="delete"]')).toHaveCount(1);
  await expect(toolbar.locator('[data-action="regenerate"]')).toHaveCount(0);
});

test('message list renders assistant messages with toolbar and model label', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
  });

  await page.evaluate(() => {
    const bridge = window.__socratesReactChatBridge;
    if (!bridge) throw new Error('bridge missing');
    window.state.phase = 'chat';
    window.state.currentSessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'msg-list-assistant' });
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
  await expect(toolbar.locator('[data-action="thumbs-up"]')).toHaveCount(1);
  await expect(toolbar.locator('[data-action="thumbs-down"]')).toHaveCount(1);
  await expect(toolbar.locator('[data-action="regenerate"]')).toHaveCount(1);
  await expect(toolbar.locator('[data-action="branch"]')).toHaveCount(1);
});

test('message list snapshots react to message-added events', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
  });

  await page.evaluate(() => {
    const bridge = window.__socratesReactChatBridge;
    if (!bridge) throw new Error('bridge missing');
    window.state.phase = 'chat';
    window.state.currentSessionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'msg-list-bridge-2' });
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
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    window.__messageListSpecToast = null;
    window.showToast = (msg) => { window.__messageListSpecToast = msg; };
    const bridge = window.__socratesReactChatBridge;
    window.state.phase = 'chat';
    window.state.currentSessionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'msg-list-copy' });
    window.addMessage('user', 'copy me please');
  });

  const userBubble = page.locator('[data-client-id^="msg-"].msg.user').first();
  await userBubble.hover();
  await userBubble.locator('[data-action="copy"]').click();

  await expect.poll(async () => {
    return await page.evaluate(() => window.__messageListSpecToast || null);
  }).toMatch(/Copied|Copy/);
});

test('message list toolbar action buttons dispatch to legacy window globals', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    window.__msgSpecEditCalls = [];
    window.__msgSpecFeedbackCalls = [];
    window.editUserMessage = (id) => { window.__msgSpecEditCalls.push(id); };
    window.deleteUserMessage = (id) => { window.__msgSpecEditCalls.push('del:'+id); };
    window.regenerateAssistantMessage = (id) => { window.__msgSpecEditCalls.push('regen:'+id); };
    window.branchFromMessage = (id) => { window.__msgSpecEditCalls.push('branch:'+id); };
    window.sendFeedback = (id, rating) => { window.__msgSpecFeedbackCalls.push([id, rating]); };
    const bridge = window.__socratesReactChatBridge;
    window.state.phase = 'chat';
    window.state.currentSessionId = '11111111-1111-4111-8111-111111111111';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'msg-list-toolbar-actions' });
    window.addMessage('user', 'edit and delete me');
  });

  const userBubble = page.locator('[data-client-id^="msg-"].msg.user').first();
  await userBubble.hover();
  await userBubble.locator('[data-action="edit"]').click();
  await userBubble.locator('[data-action="delete"]').click();

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
  await assistantBubble.locator('[data-action="regenerate"]').click();
  await assistantBubble.locator('[data-action="thumbs-up"]').click();
  await assistantBubble.locator('[data-action="branch"]').click();

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
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    const bridge = window.__socratesReactChatBridge;
    window.state.phase = 'chat';
    window.state.currentSessionId = '22222222-2222-4222-8222-222222222222';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'msg-list-stream-handoff' });
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
  await expect(page.locator('[data-client-id^="msg-"].msg.assistant .msg-toolbar [data-action="copy"]')).toHaveCount(1);
});
