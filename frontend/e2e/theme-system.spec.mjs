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
      background: styles.getPropertyValue('--background').trim(),
      sidebarRole: styles.getPropertyValue('--sidebar').trim(),
      card: styles.getPropertyValue('--card').trim(),
      popover: styles.getPropertyValue('--popover').trim(),
      cgPage: styles.getPropertyValue('--cg-page').trim(),
      chatgptPage: styles.getPropertyValue('--chatgpt-page').trim(),
      conversationPage: styles.getPropertyValue('--conversation-page').trim(),
      legacyPage: styles.getPropertyValue('--bg-000').trim(),
      lobeLayout: styles.getPropertyValue('--lobe-color-bg-layout').trim(),
      lobeContainer: styles.getPropertyValue('--lobe-color-bg-container').trim(),
      lobeElevated: styles.getPropertyValue('--lobe-color-bg-elevated').trim(),
    };
  });
  // Legacy surface roles must resolve through the active shadcn semantic
  // palette instead of pinning an application-specific hex scale.
  expect(darkPalette.page).toBe(darkPalette.background);
  expect(darkPalette.sidebar).toBe(darkPalette.sidebarRole);
  expect(darkPalette.raised).toBe(darkPalette.card);
  expect(darkPalette.surface).toBe(darkPalette.card);
  expect(darkPalette.lobeElevated).toBe(darkPalette.popover);
  // Computed custom properties resolve var() aliases to canonical values.
  expect(darkPalette.cgPage).toBe(darkPalette.page);
  expect(darkPalette.chatgptPage).toBe(darkPalette.page);
  expect(darkPalette.conversationPage).toBe(darkPalette.page);
  expect(darkPalette.legacyPage).toMatch(/^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/);
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
      background: styles.getPropertyValue('--background').trim(),
      card: styles.getPropertyValue('--card').trim(),
      popover: styles.getPropertyValue('--popover').trim(),
      foreground: styles.getPropertyValue('--foreground').trim(),
      borderRole: styles.getPropertyValue('--border').trim(),
    };
  });
  expect(lightPalette.page).toBe(lightPalette.background);
  expect(lightPalette.raised).toBe(lightPalette.card);
  expect(lightPalette.elevated).toBe(lightPalette.popover);
  expect(lightPalette.text).toBe(lightPalette.foreground);
  expect(lightPalette.border).toBe(lightPalette.borderRole);

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');
});
