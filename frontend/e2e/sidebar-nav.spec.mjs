import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('sidebar exposes only the requested primary destinations', async ({ page }) => {
  const visibleIds = await page.locator('#sidebarNav > .sidebar-nav-btn').evaluateAll((buttons) =>
    buttons.filter((button) => getComputedStyle(button).display !== 'none').map((button) => button.id),
  );
  expect(visibleIds).toEqual([
    'navNew',
    'navProjects',
    'navLibrary',
    'navScheduled',
    'navPlugins',
    'navExam',
    'navSkills',
    'navAdmin',
  ]);

  for (const id of ['navMore']) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
  await expect(page.getByText('Customize', { exact: true })).toHaveCount(0);
});

test('Plugins is a direct sidebar destination', async ({ page }) => {
  await page.locator('#navPlugins').click();
  await expect(page.locator('#navPlugins')).toHaveClass(/active/);
  await expect(page.locator('#pluginsPanel')).toBeVisible();
  await expect(page.locator('.connector-row')).toHaveCount(5);
});

test('Exam is a direct sidebar destination', async ({ page }) => {
  await page.locator('#navExam').click();
  await expect(page.locator('#navExam')).toHaveClass(/active/);
  await expect(page.locator('#examView')).toBeVisible();
});

test('Skills & shortcuts opens directly without a Customize popover', async ({ page }) => {
  await page.locator('#navSkills').click();
  await expect(page.locator('#promptTemplatesOverlay')).toBeVisible();
  await expect(page.locator('#moreNavPopover')).toHaveCount(0);
});
