import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const TURN_ID = 'restored-turn-1';

test('a completed detached turn is restored once after loading its session', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + SESSION_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SESSION_ID,
        topic: 'Detached turn recovery',
        title: 'Detached turn recovery',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [{
          id: 'recovery-user',
          clientId: 'recovery-user',
          role: 'user',
          rawText: 'What happened while I was away?',
          html: '<p>What happened while I was away?</p>',
        }],
        kbNodes: [],
        mistakes: [],
      }),
    });
  });
  await page.route(new RegExp('/api/(?:v2/)?chat-turns/' + TURN_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        turn: {
          id: TURN_ID,
          sessionId: SESSION_ID,
          clientTurnId: 'recovery-client-turn',
          status: 'completed',
          fullText: 'The answer finished while you were away.',
        },
        events: [],
      }),
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(({ sessionId, turnId }) => {
    localStorage.setItem(`socrates-pending-turn:${sessionId}`, JSON.stringify({
      turnId,
      clientTurnId: 'recovery-client-turn',
      sessionId,
      lastSeq: 0,
      updatedAt: Date.now(),
    }));
  }, { sessionId: SESSION_ID, turnId: TURN_ID });
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });

  await page.evaluate((sessionId) => window.loadSession(sessionId), SESSION_ID);

  const restoredAnswer = page.locator('#msgList .msg.assistant').filter({ hasText: 'The answer finished while you were away.' });
  await expect(restoredAnswer).toHaveCount(1);
  await expect.poll(() => page.evaluate((sessionId) =>
    localStorage.getItem(`socrates-pending-turn:${sessionId}`), SESSION_ID)).toBeNull();
});

test('a restored interrupted response retries through its React status control', async ({ page }) => {
  await mockAuthedApp(page);
  const sessionUrl = new RegExp('/api/(?:v2/)?sessions/' + SESSION_ID + '(?:\\?.*)?$');
  await page.route(sessionUrl, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SESSION_ID,
        topic: 'Interrupted answer recovery',
        title: 'Interrupted answer recovery',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        streamingText: 'A partial answer restored from the server.',
        messages: [{
          id: 'recovery-user',
          clientId: 'recovery-user',
          role: 'user',
          rawText: 'What happened while I was away?',
          html: '<p>What happened while I was away?</p>',
        }],
        kbNodes: [],
        mistakes: [],
      }),
    });
  });
  const retriedBodies = [];
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    retriedBodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline' }) });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((sessionId) => window.loadSession(sessionId), SESSION_ID);

  const recovered = page.locator('#msgList .msg.assistant').filter({ hasText: 'A partial answer restored from the server.' });
  await expect(recovered).toHaveAttribute('data-react-owned', '1');
  const retry = recovered.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  await retry.click();

  await expect(recovered).toHaveCount(0);
  await expect.poll(() => retriedBodies.length).toBe(1);
  expect(retriedBodies[0].messages.some((message) => message.content === 'What happened while I was away?')).toBe(true);
});
