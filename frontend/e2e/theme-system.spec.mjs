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
      raised: styles.getPropertyValue('--ui-bg-raised').trim(),
    };
  });
  expect(darkPalette.page).toBe('#000000');
  expect(darkPalette.raised).toBe('#131519');

  await themeSegs.locator('[data-theme-option="system"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');
});
