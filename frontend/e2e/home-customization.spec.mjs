import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('IP time zone drives the personalized greeting', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T01:00:00Z'));
  await mockAuthedApp(page, {
    user: {
      id: 'timezone-user',
      name: 'Jiacheng Hu',
      email: 'jiacheng@example.test',
      timeZone: 'Asia/Shanghai',
    },
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await expect(page.locator('#topicTitle')).toHaveText('Good morning, Jiacheng!');
});

test('display settings change theme, text scale, and content width', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const before = await page.locator('#topicInputWrap').boundingBox();
  const beforeTitleSize = await page.locator('#topicTitle').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  await page.locator('#displayPrefsBtn').click();
  await page.locator('#displayPrefsFontSegs [data-font="1.375"]').click();
  await page.locator('#displayPrefsWidthSegs [data-width="1.7"]').click();
  await page.locator('#displayThemeSegs [data-theme-option="light"]').click();

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('#displayPrefsFontLabel')).toHaveText('XL');
  await expect(page.locator('#displayPrefsWidthLabel')).toHaveText('XL');
  const after = await page.locator('#topicInputWrap').boundingBox();
  const afterTitleSize = await page.locator('#topicTitle').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(after?.width ?? 0).toBeGreaterThan((before?.width ?? 0) + 250);
  expect(afterTitleSize).toBeGreaterThan(beforeTitleSize * 1.2);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('socrates-display') || '{}'))).toMatchObject({
    font: 1.375,
    width: 1.7,
  });
});

test('light conversation is readable and find opens at the upper right', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.getElementById('findBtn')?.classList.remove('hidden');
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Readability check' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: 'light-conversation-test' });
    window.addMessage('user', 'Hello');
    window.addMessage('assistant', 'A readable answer with strong contrast.');
    window.syncConversationActive?.();
  });
  await expect(page.locator('body')).toHaveAttribute('data-conversation-active', 'true');
  await expect(page.locator('#msgList .msg.assistant')).toContainText('strong contrast');

  const colors = await page.evaluate(() => {
    const value = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
    return {
      page: value('.main-content', 'backgroundColor'),
      topBar: value('.top-bar', 'backgroundColor'),
      text: value('#msgList .msg.assistant .msg-body', 'color'),
    };
  });
  expect(colors.topBar).toBe(colors.page);
  expect(colors.text).not.toBe(colors.page);

  await page.locator('#findBtn').click();
  await expect(page.locator('#findBar')).toBeVisible();
  const findBox = await page.locator('#findBar').boundingBox();
  const composerBox = await page.locator('#chatInputWrap').boundingBox();
  expect(findBox?.y ?? 999).toBeLessThan(100);
  expect(findBox?.x ?? 0).toBeGreaterThan(900);
  expect((findBox ? findBox.y + findBox.height : 999) + 200).toBeLessThan(composerBox?.y ?? 0);
});
