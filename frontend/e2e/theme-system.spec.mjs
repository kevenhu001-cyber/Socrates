import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('theme selector follows the operating system and persists explicit modes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-theme', 'system');
  });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  await page.locator('#displayPrefsBtn').click();
  const themeSegs = page.locator('#displayThemeSegs');
  await expect(themeSegs).toBeVisible();
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');

  await themeSegs.locator('[data-theme-option="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-theme'))).toBe('dark');
  const darkPalette = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      page: styles.getPropertyValue('--ui-bg-page').trim(),
      sidebar: styles.getPropertyValue('--ui-bg-sidebar').trim(),
      raised: styles.getPropertyValue('--ui-bg-raised').trim(),
      surface: styles.getPropertyValue('--ui-bg-surface').trim(),
      cgPage: styles.getPropertyValue('--cg-page').trim(),
      chatgptPage: styles.getPropertyValue('--chatgpt-page').trim(),
      conversationPage: styles.getPropertyValue('--conversation-page').trim(),
      legacyPage: styles.getPropertyValue('--bg-000').trim(),
    };
  });
  expect(darkPalette.page).toBe('#141414');
  expect(darkPalette.sidebar).toBe('#1e1e1e');
  expect(darkPalette.raised).toBe('#1c1c1c');
  expect(darkPalette.surface).toBe('#212121');
  // Supplied charcoal reference ramp (styles/themes.css).
  expect(darkPalette.cgPage).toBe(darkPalette.page);
  expect(darkPalette.chatgptPage).toBe(darkPalette.page);
  expect(darkPalette.conversationPage).toBe(darkPalette.page);
  expect(darkPalette.legacyPage).toBe('0 0% 8%');

  await themeSegs.locator('[data-theme-option="system"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');
});
