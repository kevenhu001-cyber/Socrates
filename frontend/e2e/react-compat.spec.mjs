import { expect, test } from '@playwright/test';

import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('React compatibility mode preserves the legacy application shell', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#topicInput, [name="topicInput"]').first()).toBeVisible();

  const compatibilityRoot = page.locator('#newReplyPill');
  await expect(compatibilityRoot).toHaveAttribute('data-react-migration-runtime', 'new-reply-pill');
  await expect(compatibilityRoot).toHaveText('↓ New reply');
  await expect(page.locator('#sendBtnContent')).toHaveAttribute(
    'data-react-migration-runtime',
    'send-button',
  );
  await expect(page.locator('#sendBtnContent .icon-arrow')).toHaveCount(1);

  await expect(page.locator('#msgList')).toHaveAttribute(
    'data-react-migration-runtime',
    'msg-list',
  );

  await page.evaluate(() => {
    window.setChatStopState(true);
    window.__socratesReactChatBridge.publish({
      type: 'stream-started',
      messageId: 'compat-send-button',
    });
  });
  await expect(page.locator('#sendBtn')).toHaveAttribute('data-stop', '1');
  await expect(page.locator('#sendBtnContent rect')).toHaveCount(1);

  await page.evaluate(() => {
    window.setChatStopState(false);
    window.__socratesReactChatBridge.publish({
      type: 'stream-finished',
      messageId: 'compat-send-button',
      textLength: 0,
    });
  });
  await expect(page.locator('#sendBtnContent path')).toHaveCount(1);
});

test('React compatibility mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await expect(page.locator('#newReplyPill')).toHaveAttribute('data-react-migration-runtime', 'new-reply-pill');
  await expect(page.locator('#sendBtnContent')).toHaveAttribute('data-react-migration-runtime', 'send-button');
  await expect(page.locator('#sidebarUserRow')).toHaveAttribute('data-react-migration-runtime', 'sidebar-user-row');
});

test('React chat store observes legacy message and stream lifecycle', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    const bridge = window.__socratesReactChatBridge;
    if (!bridge) throw new Error('React chat runtime bridge was not installed');

    window.__reactChatSnapshots = [bridge.getSnapshot()];
    window.__stopReactChatSnapshotCapture = bridge.subscribe(() => {
      window.__reactChatSnapshots.push(bridge.getSnapshot());
    });

    window.state.phase = 'chat';
    window.state.currentSessionId = '88888888-8888-4888-8888-888888888888';
    window.state.messages = [];
    bridge.publish({ type: 'state-synced', reason: 'e2e-setup' });
    window.addMessage('user', 'Observe the compatibility bridge.');

    const originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return originalFetch(input, init);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const payload = { choices: [{ delta: { content: 'Bridge response.' } }] };
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

    window.__reactChatStreamPromise = window.askChatTurn('Observe the compatibility bridge.');
  });

  await page.evaluate(() => window.__reactChatStreamPromise);

  await expect(page.locator('#sendBtn')).toHaveAttribute('data-stop', '0');
  await expect(page.locator('#sendBtnContent path')).toHaveCount(1);
  await expect(page.locator('#sendBtnContent rect')).toHaveCount(0);

  const result = await page.evaluate(() => {
    window.__stopReactChatSnapshotCapture?.();
    const snapshots = window.__reactChatSnapshots;
    return {
      events: snapshots.map((item) => item.lastEvent),
      final: window.__socratesReactChatBridge.getSnapshot(),
    };
  });

  expect(result.events).toContain('message-added');
  expect(result.events).toContain('stream-started');
  expect(result.events).toContain('stream-delta');
  expect(result.events).toContain('stream-finished');
  expect(result.final).toMatchObject({
    currentSessionId: '88888888-8888-4888-8888-888888888888',
    messageCount: 2,
    isStreaming: false,
    lastEvent: 'stream-finished',
    stream: {
      status: 'completed',
      textLength: 'Bridge response.'.length,
    },
  });
});
