import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('top mode tabs select the clicked position without toggling the active tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('socrates-appmode', 'chat');
  });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const tabs = page.locator('#modeSegmentedTop');
  const chat = tabs.getByRole('tab', { name: '聊天' });
  const tutor = tabs.getByRole('tab', { name: '辅导' });

  await expect(chat).toHaveAttribute('aria-selected', 'true');
  await expect(tutor).toHaveAttribute('aria-selected', 'false');

  await chat.click();
  await expect.poll(() => page.evaluate(() => window.appMode)).toBe('chat');

  await tutor.click();
  await expect.poll(() => page.evaluate(() => window.appMode)).toBe('tutor');
  await expect(tutor).toHaveAttribute('aria-selected', 'true');

  await tutor.click();
  await expect.poll(() => page.evaluate(() => window.appMode)).toBe('tutor');

  await chat.click();
  await expect.poll(() => page.evaluate(() => window.appMode)).toBe('chat');
  await expect(chat).toHaveAttribute('aria-selected', 'true');
});

test('mode tabs reappear on the topic page after a conversation and new chat', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('socrates-appmode', 'chat');
  });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const tabs = page.locator('#modeSegmentedTop');
  await expect(tabs).toBeVisible();

  /* Start a conversation: the pill must hide while it is active. */
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  await editor.click();
  await editor.fill('测试主题');
  await page.locator('#startBtn').click();
  await expect(tabs).toBeHidden();

  /* Returning to the topic-input page via "new chat" restores the
     switch so the user can pick Chat or Tutor for the next session.
     resetApp() first asks to confirm the new session — accept it. */
  await page.locator('#navNew').click();
  await expect(page.locator('#confirmOkBtn')).toBeVisible();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('tab', { name: '聊天' })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: '辅导' })).toBeVisible();
});
