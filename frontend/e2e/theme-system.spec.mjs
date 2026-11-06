import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The production build minifies #ffffff to #fff; compare expanded hex so the
   assertion is about the colour, not the build's serialization. */
function hex6(value) {
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  return short ? `#${short[1].split('').map((channel) => channel + channel).join('')}` : value;
}

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
  // The dark canvas is the reference's pure #000 (Geist background-200, the
  // ladder's blackCanvas policy); rail / panel / elevated stay a consecutive
  // slice of the Geist scale.
  expect(hex6(darkPalette.page)).toBe('#000000');
  expect(hex6(darkPalette.sidebar)).toBe('#1a1a1a');
  expect(hex6(darkPalette.raised)).toBe('#1f1f1f');
  expect(hex6(darkPalette.surface)).toBe('#292929');
  // Computed custom properties resolve var() aliases to the canonical value.
  expect(hex6(darkPalette.cgPage)).toBe(hex6(darkPalette.page));
  expect(hex6(darkPalette.chatgptPage)).toBe(hex6(darkPalette.page));
  expect(hex6(darkPalette.conversationPage)).toBe(hex6(darkPalette.page));
  expect(darkPalette.legacyPage).toBe('0 0% 0%');
  expect(hex6(darkPalette.lobeLayout)).toBe(hex6(darkPalette.page));
  expect(hex6(darkPalette.lobeContainer)).toBe(hex6(darkPalette.raised));
  expect(hex6(darkPalette.lobeElevated)).toBe(hex6(darkPalette.surface));

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
  /* Paper-canvas policy (surface-ladder.baseline.json): the light canvas IS
     the paper, so page, raised and elevated share #ffffff; the rail
     (#fafafa) and panel (#f2f2f2) carry the separation. */
  expect({
    page: hex6(lightPalette.page),
    raised: hex6(lightPalette.raised),
    elevated: hex6(lightPalette.elevated),
    text: hex6(lightPalette.text),
    border: hex6(lightPalette.border),
  }).toEqual({
    page: '#ffffff',
    raised: '#ffffff',
    elevated: '#ffffff',
    text: '#171717',
    border: '#eaeaea',
  });

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(themeSegs.locator('[data-theme-option="system"]')).toHaveAttribute('aria-checked', 'true');
});
