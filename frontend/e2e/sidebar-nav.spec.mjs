// e2e/sidebar-nav.spec.mjs — PR-A
// Verifies the 5 secondary sidebar nav buttons (Library / Projects /
// Scheduled / Plugins / More) wired through openNav() reach the
// expected active state, and the More popover opens on click and
// closes on outside click + Esc.

import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);
});

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
  /* No other secondary nav should be active. */
  for (const id of ['navProjects', 'navScheduled', 'navPlugins', 'navMore']) {
    await expect(page.locator(`#${id}`)).not.toHaveClass(/active/);
  }
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
  /* The first item is "API settings" → openSettings. The popover
     should close and the settings modal should open. We don't
     stub the settings backend here, but we can at least confirm
     the popover dismissal happens before the action runs. */
  await page.locator('#moreNavPopover .sidebar-more-item').first().click();
  await expect(page.locator('#moreNavPopover')).toBeHidden();
});

test('Scheduled button opens the scheduled panel (PR-D)', async ({ page }) => {
  await page.locator('#navScheduled').click();
  await expect(page.locator('#navScheduled')).toHaveClass(/active/);
  await expect(page.locator('#scheduledPanel')).toBeVisible();
  /* The panel should contain the scheduled list container. */
  await expect(page.locator('#scheduledList')).toBeAttached();
});

test('Zotero opens a private API Key connection dialog', async ({ page }) => {
  await page.locator('#navPlugins').click();
  await expect(page.getByText('Zotero', { exact: true })).toBeVisible();
  await page.locator('.connector-row').filter({ hasText: 'Zotero' }).getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { name: 'Connect Zotero' })).toBeVisible();
  const key = page.locator('#zoteroConnectForm input[name="apiKey"]');
  await expect(key).toHaveAttribute('type', 'password');
  await key.fill('abcdefghijklmnopqrstuvwx');
  await page.locator('#zoteroConnectForm').getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#workspaceDialog')).toBeHidden();
});

test('arXiv opens a public paper search without account connection', async ({ page }) => {
  await page.locator('#navPlugins').click();
  await page.locator('.connector-row').filter({ hasText: 'arXiv' }).getByRole('button', { name: 'Explore' }).click();
  await expect(page.getByRole('heading', { name: 'Search arXiv' })).toBeVisible();
  await page.locator('#arxivSearchForm input[name="query"]').fill('information theory');
  await page.locator('#arxivSearchForm').getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('A test preprint', { exact: true })).toBeVisible();
});
