import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('display preferences own their controls without data-action delegation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'dark'));
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const popover = page.locator('#displayPrefsPopover');
  expect(await popover.locator('[data-action], [data-action-input]').count()).toBe(0);
  await expect(page.locator('#themeToggle')).not.toHaveAttribute('data-action', /.+/);
  await expect(page.locator('#displayPrefsBtn')).not.toHaveAttribute('data-action', /.+/);

  await page.locator('#displayPrefsBtn').click();
  await expect(popover).toBeVisible();

  await page.locator('#displayPrefsFontSegs [data-font="1.375"]').click();
  await page.locator('#displayPrefsWidthSegs [data-width="1.7"]').click();
  await page.locator('#displayAccentColors .color-swatch[data-hue="210"]').click();
  await page.locator('#gridToggle').click();

  await page.locator('#displayPrefsBgDark').evaluate((input) => {
    input.value = '#123456';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#displayPrefsBgLight').evaluate((input) => {
    input.value = '#eeeeee';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(page.locator('#displayPrefsFontLabel')).toHaveText('XL');
  await expect(page.locator('#displayPrefsWidthLabel')).toHaveText('XL');
  await expect(page.locator('#gridToggle')).toHaveClass(/on/);
  await expect.poll(() => page.evaluate(() => ({
    display: JSON.parse(localStorage.getItem('socrates-display') || '{}'),
    hue: localStorage.getItem('socrates-accent-hue'),
    accentHex: localStorage.getItem('socrates-accent-hex'),
    accentToken: document.documentElement.style.getPropertyValue('--accent-000'),
  }))).toMatchObject({
    display: { font: 1.375, width: 1.7, darkBg: '#123456', lightBg: '#eeeeee', showGrid: true },
    hue: '210',
    accentHex: null,
    accentToken: '210 77% 62%',
  });

  await page.locator('#accentCustomInput').evaluate((input) => {
    input.value = '#336699';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => ({
    accentHex: localStorage.getItem('socrates-accent-hex'),
    hue: localStorage.getItem('socrates-accent-hue'),
  }))).toEqual({ accentHex: '#336699', hue: null });

  await page.locator('#displayPrefsBgDarkReset').click();
  await page.locator('#displayPrefsBgLightReset').click();
  await page.locator('#accentResetBtn').click();
  await expect.poll(() => page.evaluate(() => ({
    display: JSON.parse(localStorage.getItem('socrates-display') || '{}'),
    hue: localStorage.getItem('socrates-accent-hue'),
    accentHex: localStorage.getItem('socrates-accent-hex'),
  }))).toMatchObject({
    display: { darkBg: '', lightBg: '' },
    hue: '40',
    accentHex: null,
  });

  const modeBefore = await page.locator('html').getAttribute('data-mode');
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', modeBefore === 'dark' ? 'light' : 'dark');
  await expect(popover).toBeHidden();

  await page.locator('#displayPrefsBtn').click();
  await expect(popover).toBeVisible();
  await page.locator('#displayPrefsBtn').click();
  await expect(popover).toBeHidden();
});
