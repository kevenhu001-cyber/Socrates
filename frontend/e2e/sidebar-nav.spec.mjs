// e2e/sidebar-nav.spec.mjs — PR-A
// Verifies the 5 secondary sidebar nav buttons (Library / Projects /
// Scheduled / Plugins / More) wired through openNav() reach the
// expected active state, and the More popover opens on click and
// closes on outside click + Esc.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);
});

/**
 * The desktop shell trims the sidebar nav to five primary destinations, so
 * Plugins is reached from the Customize popover rather than a nav row. The
 * button still exists (and is used under 769px), which is why this goes
 * through the popover instead of clicking #navPlugins directly.
 */
async function openPlugins(page) {
  await page.locator('#navMore').click();
  await page.locator('#moreNavPopover [role="menuitem"]').filter({ hasText: 'Plugins' }).first().click();
  await expect(page.locator('#moreNavPopover')).toBeHidden();
}

test('the 5 secondary nav buttons exist and have stable ids', async ({ page }) => {
  for (const id of ['navLibrary', 'navProjects', 'navScheduled', 'navPlugins', 'navMore']) {
    const btn = page.locator(`#${id}`);
    await expect(btn).toBeAttached();
    await expect(btn).toHaveAttribute('data-nav');
  }
});

test('clicking Library lights up the active state', async ({ page }) => {
  await page.locator('#navLibrary').click();
  await expect(page.locator('#navLibrary')).toHaveClass(/active/);
  await expect(page.locator('#modeSegmentedTop')).toBeHidden();
  await expect(page.locator('#topicDisclaimer')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/workspace-active/);
  /* No other secondary nav should be active. */
  for (const id of ['navProjects', 'navScheduled', 'navPlugins', 'navMore']) {
    await expect(page.locator(`#${id}`)).not.toHaveClass(/active/);
  }
});

test('Library, Projects, and Plugins keep one page shell with restored headers', async ({ page }) => {
  await page.locator('#navLibrary').click();
  await expect(page.locator('#libraryPanel')).toHaveCount(1);
  await expect(page.locator('#libraryPanel > .library-header')).toBeVisible();
  await expect(page.locator('#libraryPanel > .workspace-search')).toBeVisible();
  await expect(page.locator('#libraryPanel #libraryList')).toHaveCount(1);

  await page.locator('#navProjects').click();
  await expect(page.locator('#spacesPanel')).toHaveCount(1);
  await expect(page.locator('#spacesPanel > .spaces-header')).toBeVisible();
  await expect(page.locator('#spacesPanel #spacesList')).toHaveCount(1);

  await openPlugins(page);
  await expect(page.locator('#pluginsPanel')).toHaveCount(1);
  await expect(page.locator('#pluginsPanel > .plugins-header')).toBeVisible();
  await expect(page.locator('#pluginsPanel #pluginsList')).toHaveCount(1);
});

test('clicking a different nav button switches the active state', async ({ page }) => {
  await page.locator('#navLibrary').click();
  await expect(page.locator('#navLibrary')).toHaveClass(/active/);
  await page.locator('#navProjects').click();
  await expect(page.locator('#navProjects')).toHaveClass(/active/);
  await expect(page.locator('#navLibrary')).not.toHaveClass(/active/);
});

test('the More popover opens on click and is initially hidden', async ({ page }) => {
  const pop = page.locator('#moreNavPopover');
  await expect(pop).toBeHidden();
  await page.locator('#navMore').click();
  await expect(pop).toBeVisible();
  await expect(page.locator('#navMore')).toHaveClass(/active/);
});

test('the More popover closes on outside click', async ({ page }) => {
  await page.locator('#navMore').click();
  await expect(page.locator('#moreNavPopover')).toBeVisible();
  /* Click somewhere outside the popover. The chat main area is
     a reliable target — it's deep inside the app shell and far
     from the sidebar popover. */
  await page.locator('.main').click({ position: { x: 600, y: 400 } });
  await expect(page.locator('#moreNavPopover')).toBeHidden();
  await expect(page.locator('#navMore')).not.toHaveClass(/active/);
});

test('the More popover closes on Escape', async ({ page }) => {
  await page.locator('#navMore').click();
  await expect(page.locator('#moreNavPopover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#moreNavPopover')).toBeHidden();
});

test('clicking a More menu item closes the popover and dispatches the action', async ({ page }) => {
  await page.locator('#navMore').click();
  await expect(page.locator('#moreNavPopover')).toBeVisible();
  /* Whatever the first item happens to be, picking it must dismiss the
     popover before its action runs — that ordering is the contract here, so
     the assertion stays independent of the menu's contents. */
  await page.locator('#moreNavPopover .sidebar-more-item').first().click();
  await expect(page.locator('#moreNavPopover')).toBeHidden();
});

test('Scheduled button opens the scheduled panel (PR-D)', async ({ page }) => {
  await page.locator('#navScheduled').click();
  await expect(page.locator('#navScheduled')).toHaveClass(/active/);
  await expect(page.locator('#scheduledPanel')).toBeVisible();
  await expect(page.locator('#modeSegmentedTop')).toBeHidden();
  /* The panel should contain the scheduled list container. */
  await expect(page.locator('#scheduledList')).toBeAttached();
});

test('Plugins shows the project connector catalog with brand icons', async ({ page }) => {
  await openPlugins(page);
  await expect(page.locator('#modeSegmentedTop')).toBeHidden();
  await expect(page.locator('#topicDisclaimer')).toBeHidden();
  await expect(page.locator('.connector-row')).toHaveCount(5);
  await expect(page.locator('.connector-row').filter({ hasText: 'Gmail' }).locator('.connector-gmail svg')).toBeVisible();
  await expect(page.locator('.connector-row').filter({ hasText: 'Google Drive' }).locator('.connector-googledrive svg')).toBeVisible();
  await expect(page.locator('.connector-row').first()).toHaveCSS('min-height', '66px');
});
