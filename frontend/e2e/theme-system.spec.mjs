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
      lobeLayout: styles.getPropertyValue('--lobe-color-bg-layout').trim(),
      lobeContainer: styles.getPropertyValue('--lobe-color-bg-container').trim(),
      lobeElevated: styles.getPropertyValue('--lobe-color-bg-elevated').trim(),
    };
  });
  expect(darkPalette.page).toBe('#000000');
  expect(darkPalette.sidebar).toBe('#0d0d0d');
  expect(darkPalette.raised).toBe('#0d0d0d');
  expect(darkPalette.surface).toBe('#1a1a1a');
  // Computed custom properties resolve var() aliases to the canonical value.
  expect(darkPalette.cgPage).toBe(darkPalette.page);
  expect(darkPalette.chatgptPage).toBe(darkPalette.page);
  expect(darkPalette.conversationPage).toBe(darkPalette.page);
  expect(darkPalette.legacyPage).toBe('0 0% 0%');
  expect(darkPalette.lobeLayout).toBe(darkPalette.page);
  expect(darkPalette.lobeContainer).toBe(darkPalette.raised);
  expect(darkPalette.lobeElevated).toBe(darkPalette.surface);

  await themeSegs.locator('[data-theme-option="system"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  const lightPalette = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      page: styles.getPropertyValue('--ui-bg-page').trim(),
      raised: styles.getPropertyValue('--ui-bg-raised').trim(),
      elevated: styles.getPropertyValue('--ui-bg-surface').trim(),
      text: styles.getPropertyValue('--ui-text-primary').trim(),
      border: styles.getPropertyValue('--ui-border-default').trim(),
    };
  });
  expect(lightPalette).toEqual({
    page: '#ffffff',
    raised: '#ffffff',
    elevated: '#ffffff',
    text: '#111111',
    border: '#e5e5e5',
  });

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');
});
