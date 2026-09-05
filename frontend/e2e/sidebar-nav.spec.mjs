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

test('Admin console is a standalone /admin page with no sidebar entry', async ({ page }) => {
  // The operator console is deliberately not advertised in the nav —
  // it is reached only through the standalone route.
  await expect(page.locator('#navAdmin')).toHaveCount(0);
  await page.evaluate(() => window.openNav('admin'));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('#adminPanel')).toBeVisible();
  // Unauthenticated (mock API has no admin session): the login form
  // renders instead of the console.
  await expect(page.locator('.admin-login')).toBeVisible();
});

test('Admin page hides the chat top-bar chrome', async ({ page }) => {
  // Simulate an active session: the chat runtime unhides the share /
  // find / model controls, which must all disappear on /admin.
  await page.evaluate(() => {
    for (const id of ['shareBtn', 'findBtn', 'chatModelWrap']) {
      document.getElementById(id)?.classList.remove('hidden');
    }
  });
  await page.evaluate(() => window.openNav('admin'));
  await expect(page.locator('#adminPanel')).toBeVisible();
  const displays = await page.locator('#shareBtn, #findBtn, #chatModelWrap, #modeSegmentedTop').evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).display),
  );
  expect(displays).toEqual(['none', 'none', 'none', 'none']);
  // Leaving the console drops the admin body class and restores chrome.
  await page.evaluate(() => window.openNav('library'));
  await expect(page.locator('#shareBtn')).toBeVisible();
});
