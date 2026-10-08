import { test, expect } from '@playwright/test';
import { ensureSidebarOpen } from './_universal-helpers.mjs';

/**
 * Universal App account menu (baseline `react/sidebar-chrome/SidebarFooter.tsx`):
 * the footer identity opens a menu with identity → Profile, Upgrade plan,
 * Personalization, Profile, Settings and Sign out (signed-in only); pressing
 * outside closes it. Help (the SPA keyboard cheatsheet) has no Universal
 * counterpart and is intentionally absent. Every call is mocked.
 */
test('universal account menu mirrors the baseline entries and closes outside', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let logoutCalls = 0;
  const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/v2/auth/me', (route) => route.fulfill(json({ user: { id: 'u1', email: 't@e.c', displayName: 'T', isGuest: false, tier: 'descartes' } })));
  await page.route('**/api/v2/auth/mobile/logout', (route) => { logoutCalls += 1; return route.fulfill(json({ ok: true })); });
  await page.route('**/api/v2/projects', (route) => route.fulfill(json({ projects: [] })));
  await page.route('**/api/v2/sessions?limit=50', (route) => route.fulfill(json({ sessions: [] })));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => route.fulfill(json({ sessions: [], nextCursor: null })));
  await page.route('**/api/v2/api-key', (route) => route.fulfill(json({ providers: [] })));
  await page.route('**/api/v2/creations/items/assistants', (route) => route.fulfill(json({ items: [] })));
  await page.route('**/api/v2/account/usage', (route) => route.fulfill(json({
    user: { id: 'u1', email: 't@e.c', displayName: 'T', tier: 'descartes' },
    plan: { name: 'Descartes' },
    usage: { sessionCount: 0, providerCount: 0, graphNodes: 0, beagleUsed: 0, beagleLimit: 1000000 },
  })));
  await page.context().route('https://topodrive.top/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Pricing</title>' }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await ensureSidebarOpen(page);

  const trigger = page.getByTestId('socrates-sidebar-account-trigger');
  const menu = page.getByTestId('socrates-sidebar-account-menu');
  await trigger.click();
  await expect(menu).toBeVisible();
  for (const name of ['Upgrade plan', 'Personalization', 'Profile', 'Settings', 'Sign out']) {
    await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole('menuitem', { name: 'Help', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('socrates-account-menu-identity')).toBeVisible();

  // The real outside boundary is the document, not the sidebar box: clicking
  // the transcript/main column must close the anchored menu as well.
  await page.locator('#socrates-main').click({ position: { x: 40, y: 160 } });
  await expect(menu).toHaveCount(0);

  // Sidebar-local outside press still closes through the same React backdrop.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.getByTestId('socrates-sidebar-account-backdrop').click({ position: { x: 20, y: 120 } });
  await expect(menu).toHaveCount(0);

  // Upgrade plan opens the same pricing page as the SPA link.
  await trigger.click();
  const popupPromise = page.waitForEvent('popup');
  await menu.getByRole('menuitem', { name: 'Upgrade plan', exact: true }).click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toContain('https://topodrive.top/pricing');
  await popup.close();
  await expect(menu).toHaveCount(0);

  // Profile opens Settings, where the Universal profile (email) lives.
  await ensureSidebarOpen(page);
  await trigger.click();
  await menu.getByRole('menuitem', { name: 'Profile', exact: true }).click();
  await expect(page.getByText('t@e.c')).toBeVisible();
  await page.getByRole('button', { name: 'Back to chat' }).click();

  // Sign out ends the session (POST /auth/mobile/logout) and returns to the auth gate.
  await ensureSidebarOpen(page);
  await trigger.click();
  await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 20000 });
  expect(logoutCalls).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
