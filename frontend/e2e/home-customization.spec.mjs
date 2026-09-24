import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('landing greeting stays one static line regardless of the hour', async ({ page }) => {
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

  /* ChatGPT parity: no time-of-day, no name — one short line drawn from
     the greeting pool, in the ambient locale (en here). */
  const greeting = await page.locator('#topicTitle').textContent();
  expect([
    "What's the plan for today?",
    'What are we working on?',
    "What's on your mind?",
    'Where should we start?',
    'Ready when you are.',
    'What would you like to explore?',
    'How can I help?',
    "Let's get to it.",
  ]).toContain(greeting);
});

test('greeting keeps its size and stays visible when the composer is focused', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const read = () => page.locator('#topicTitle').evaluate((el) => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return { fontSize: style.fontSize, opacity: style.opacity, display: style.display, height: box.height };
  });
  const before = await read();
  await page.locator('#topicInputWrap .tiptap').click();
  await expect(page.locator('#topicInputWrap .tiptap')).toBeFocused();
  const after = await read();
  expect(after.fontSize).toBe(before.fontSize);
  expect(after.display).not.toBe('none');
  expect(parseFloat(after.opacity)).toBeGreaterThan(0.5);
  expect(after.height).toBeGreaterThan(0);
});

test('mobile greeting keeps its size and stays visible while typing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 769 });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const read = () => page.locator('#topicTitle').evaluate((el) => {
    const style = getComputedStyle(el);
    return { fontSize: style.fontSize, opacity: style.opacity, display: style.display, visibility: style.visibility };
  });
  const before = await read();
  await page.locator('#topicInputWrap .tiptap').click();
  await expect(page.locator('#topicInputWrap .tiptap')).toBeFocused();
  await page.waitForTimeout(350);
  const after = await read();
  expect(after.fontSize).toBe(before.fontSize);
  expect(after.display).not.toBe('none');
  expect(after.visibility).not.toBe('hidden');
  expect(parseFloat(after.opacity)).toBeGreaterThan(0.5);
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
