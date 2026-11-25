import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('display preferences keep one quick theme entry and defer the rest to Settings', async ({
  page,
}) => {
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

  /* The footer popover is a quick theme switcher. Typography, width, grid and
     background colours live only in Settings → Display. */
  await expect(popover.locator('#displayPrefsFontSegs, #displayPrefsWidthSegs')).toHaveCount(0);
  await expect(
    popover.locator('#gridToggle, #displayPrefsBgDark, #displayPrefsBgLight'),
  ).toHaveCount(0);
  await expect(popover.locator('#displayThemeSegs')).toBeVisible();
  await expect(popover.getByRole('button', { name: 'All display settings' })).toBeVisible();

  await page.locator('#displayThemeSegs [data-theme-option="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  const modeBefore = await page.locator('html').getAttribute('data-mode');
  await page.locator('#themeToggle').click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-mode',
    modeBefore === 'dark' ? 'light' : 'dark',
  );
  await expect(popover).toBeHidden();

  await page.locator('#displayPrefsBtn').click();
  await expect(popover).toBeVisible();
  await page.locator('#displayPrefsBtn').click();
  await expect(popover).toBeHidden();

  await page.locator('#navMore').click();
  await page.getByRole('menuitem', { name: 'Display & theme' }).click();
  await expect(popover).toBeVisible();
  await expect(page.locator('#navMore')).toHaveAttribute('aria-expanded', 'false');

  await popover.getByRole('button', { name: 'All display settings' }).click();
  await expect(popover).toBeHidden();
  await expect(page.locator('#settingsPage')).toBeVisible();
  await expect(page.locator('#settingsPage')).toContainText('Display');
});
