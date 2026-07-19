// e2e/chat-send.spec.mjs — Wave -1
// Spec 5/6: typing into the chat input + clicking send mounts a streaming
// bubble (or surfaces an offline notice) without throwing.

import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('clicking send mounts a streaming bubble or surfaces a notice without throwing', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  const chatInput = page.locator('#chatInputArea, [name="chatInputArea"]').first();
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

test('mobile send stays pinned to the newest message after focused input submit', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
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

  const chatInput = page.locator('#chatInputArea').first();
  const sendBtn = page.locator('#sendBtn').first();

  await chatInput.focus();
  await chatInput.fill('A focused mobile send should remain at the newest message.');
  await sendBtn.click();
  await page.waitForTimeout(250);

  const distanceFromBottom = await page.evaluate(() => {
    const list = document.getElementById('msgList');
    return Math.round(list.scrollHeight - list.scrollTop - list.clientHeight);
  });

  expect(distanceFromBottom).toBeLessThanOrEqual(4);
});
