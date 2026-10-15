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
    window.appMode = 'chat';
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
  await expect(page.locator('#topicSetup')).toBeVisible();
});
