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
  const tutor = tabs.getByRole('tab', { name: '工作' });

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
