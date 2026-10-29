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
  // The dark canvas is a near-black, never pure #000 — see the surface
  // ladder in styles/themes.css. The four rungs are four consecutive steps
  // of the Geist scale.
  expect(darkPalette.page).toBe('#0a0a0a');
  expect(darkPalette.sidebar).toBe('#1a1a1a');
  expect(darkPalette.raised).toBe('#1f1f1f');
  expect(darkPalette.surface).toBe('#292929');
  // Computed custom properties resolve var() aliases to the canonical value.
  expect(darkPalette.cgPage).toBe(darkPalette.page);
  expect(darkPalette.chatgptPage).toBe(darkPalette.page);
  expect(darkPalette.conversationPage).toBe(darkPalette.page);
  expect(darkPalette.legacyPage).toBe('0 0% 3.92%');
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
  /* The light ladder: the canvas is L2 (#fafafa) and the paper (L1,
     #ffffff) is what raised and overlay surfaces are cut from — so the
     composer and the menus read as lighter than the page they stand on. */
  expect(lightPalette).toEqual({
    page: '#fafafa',
    raised: '#ffffff',
    elevated: '#ffffff',
    text: '#171717',
    border: '#eaeaea',
  });

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');
});
