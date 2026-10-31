import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function boot(page) {
  await mockAuthedApp(page);
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__pageReadStarted = false;
    window.__pageReadAborted = false;
    window.fetch = (input, options) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!/\/fetch-batch/.test(url)) return nativeFetch(input, options);
      window.__pageReadStarted = true;
      // The deadline must also cover stalled JSON/transport implementations.
      options.signal.addEventListener('abort', () => { window.__pageReadAborted = true; });
      return new Promise(() => {});
    };
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/batch', patch: {
      phase: 'chat', topic: 'Preparation', currentSessionId: '11111111-1111-4111-8111-111111111111',
    } });
    window.__testActivateMainView('chatView');
  });
}

async function recordStreams(page) {
  const bodies = [];
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"Prepared reply"}}]}\n\ndata: [DONE]\n\n' });
  });
  return bodies;
}

async function sendLink(page) {
  await page.evaluate(() => { window.__preparePromise = window.submitChatMessage('Read https://example.com/page'); });
  await expect.poll(() => page.evaluate(() => window.__pageReadStarted)).toBe(true);
  await expect(page.locator('#msgList .msg.assistant .thinking-status')).toBeVisible();
}

test('fetched link previews render as part of the React message row', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?fetch-batch(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{
      ok: true,
      title: '<img src=x onerror="window.__linkPreviewXss = 1">Example article',
      content: 'x'.repeat(230),
      truncated: true,
      chars: 230,
    }] }) });
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/batch', patch: {
      phase: 'chat', topic: 'Link previews', currentSessionId: 'a2222222-2222-4222-8222-222222222222',
    } });
    window.__testActivateMainView('chatView');
    window.__linkPreviewXss = 0;
    window.submitChatMessage('Read https://example.com/article');
  });

  const card = page.locator('.msg.user .link-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.link-card-status')).toHaveText('excerpt · 230 chars');
  await expect(card.locator('.link-card-title')).toContainText('Example article');
  await expect(card.locator('.link-card-title img[onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__linkPreviewXss)).toBe(0);
});

test('a site mention without a URL renders the React missing-link hint', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/batch', patch: {
      phase: 'chat', topic: 'Link previews', currentSessionId: 'a3333333-3333-4333-8333-333333333333',
    } });
    window.__testActivateMainView('chatView');
    window.submitChatMessage('Can you read that website?');
  });
  await expect(page.locator('.msg.user .no-url-hint')).toContainText('No URL detected');
});

test('a stalled linked page cannot indefinitely delay the model request', async ({ page }) => {
  await boot(page);
  const bodies = await recordStreams(page);
  await sendLink(page);
  await expect.poll(() => bodies.length, { timeout: 5000 }).toBe(1);
  expect(await page.evaluate(() => window.__pageReadAborted)).toBe(true);
  expect(JSON.stringify(bodies[0].messages)).toContain('page retrieval timed out');
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('Prepared reply');
});

test('Stop during linked-page preparation aborts reading and prevents a late model request', async ({ page }) => {
  await boot(page);
  const bodies = await recordStreams(page);
  await sendLink(page);
  await page.locator('#composerPrimaryBtn[data-stop="1"]').click();
  await expect.poll(() => page.evaluate(() => window.__pageReadAborted)).toBe(true);
  await page.evaluate(() => window.__preparePromise);
  expect(bodies).toHaveLength(0);
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-stop', '0');
});

test('a newer send cancels the old page preparation and sends only the new turn', async ({ page }) => {
  await boot(page);
  const bodies = await recordStreams(page);
  await sendLink(page);
  await page.evaluate(() => window.submitChatMessage('Use this newer prompt instead'));
  await page.evaluate(() => window.__preparePromise);
  await expect.poll(() => bodies.length).toBe(1);
  expect(await page.evaluate(() => window.__pageReadAborted)).toBe(true);
  const lastUser = bodies[0].messages.filter((message) => message.role === 'user').pop();
  expect(lastUser.content).toBe('Use this newer prompt instead');
});


test('starting a new conversation cancels pending page reading without sending the old request', async ({ page }) => {
  await boot(page);
  const bodies = await recordStreams(page);
  await sendLink(page);
  await page.evaluate(() => { window.__resetPromise = window.resetApp({ confirmActiveSession: false }); });
  await page.locator('#confirmOkBtn').click();
  await page.evaluate(() => window.__resetPromise);
  await page.evaluate(() => window.__preparePromise);
  expect(await page.evaluate(() => window.__pageReadAborted)).toBe(true);
  expect(bodies).toHaveLength(0);
  expect(await page.evaluate(() => '_currentSessionId' in window)).toBe(false);
  expect(await page.evaluate(() => '__SOCRATES_RELEASE_TAG__' in window)).toBe(false);
  await expect(page.locator('#topicSetup')).toBeVisible();
});

test('a follow-up during a normal stream queues until the current answer finishes', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.renderRecents());
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    window.__normalStreamRequests = 0;
    window.fetch = (input, options) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, options);
      window.__normalStreamRequests += 1;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"The current answer is still streaming."}}]}\n\n'));
          const finish = () => {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          };
          if (window.__normalStreamRequests === 1) window.__finishNormalStream = finish;
          else finish();
        },
      });
      return Promise.resolve(new Response(stream, {
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
    window.submitChatMessage('Start a normal answer');
  });
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('The current answer');
  expect(await page.evaluate(() => '_activeChatAbort' in window)).toBe(false);
  await page.evaluate(() => window.submitChatMessage('Follow-up after this answer'));
  await expect(page.locator('.composer-queue-banner')).toContainText('Follow-up after this answer');
  expect(await page.evaluate(() => window.__normalStreamRequests)).toBe(1);
  await page.evaluate(() => window.__finishNormalStream());
  await expect.poll(() => page.evaluate(() => window.__normalStreamRequests)).toBe(2);
  await expect(page.locator('.composer-queue-banner')).toHaveCount(0);
});
