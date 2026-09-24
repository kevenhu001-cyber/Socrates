// e2e/sidebar-compat.spec.mjs — Batch 2 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the sidebar nav buttons and
// recents filter chips are owned by React. The legacy entry points
// (openNav, onRecentsFilterChipClick) still drive the behaviour; React
// renders the visible UI via the typed bridge.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Sidebar React mode hydrates #sidebarNav and #recentsFilterChips', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const nav = page.locator('#sidebarNav');
  await expect(nav).not.toHaveAttribute('data-mounted-by', /.+/);

  const chips = page.locator('#recentsFilterChips');
  await expect(chips).not.toHaveAttribute('data-mounted-by', /.+/);

  // Both bridges installed.
  const bridges = await page.evaluate(() => ({
    nav: typeof window.__socratesSidebarNavBridge === 'object' && window.__socratesSidebarNavBridge !== null,
    filter: typeof window.__socratesRecentsFilterBridge === 'object' && window.__socratesRecentsFilterBridge !== null,
  }));
  expect(bridges).toEqual({ nav: true, filter: true });

  // Nav snapshot reflects initial state (no active nav).
  const initialNav = await page.evaluate(() => {
    const s = window.__socratesSidebarNavBridge?.getSnapshot();
    return s ? { activeNav: s.activeNav, hasRevision: typeof s.revision === 'number' } : null;
  });
  expect(initialNav).toEqual({ activeNav: null, hasRevision: true });
});

test('Sidebar React nav buttons call window.openNav and reflect active state', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Intercept window.__socratesLegacy.navigation.openNav so we can confirm
  // React clicks dispatch through the typed bridge.
  await page.evaluate(() => {
    window.__openNavCalls = [];
    const original = window.__socratesLegacy.navigation.openNav;
    window.__socratesLegacy.navigation.openNav = (key) => {
      window.__openNavCalls.push(key);
      if (typeof original === 'function') original(key);
    };
  });

  // Click the Library nav button. The legacy `openLibrary()` calls into
  // the workspace route /library, so the button click should reach it.
  await page.locator('#navPlugins').click();

  const calls = await page.evaluate(() => window.__openNavCalls);
  expect(calls).toContain('plugins');

  // Bridge snapshot reflects the active nav.
  const after = await page.evaluate(() => {
    const s = window.__socratesSidebarNavBridge?.getSnapshot();
    return s?.activeNav;
  });
  expect(after).toBe('plugins');

  // The Plugins button should now have the .active class (React re-renders).
  const pluginsBtn = page.locator('#navPlugins');
  await expect(pluginsBtn).toHaveClass(/active/);
});

test('Sidebar React recents filter bridge remains wired while the compact drawer hides chips', async ({ page }) => {
  await mockAuthedApp(page);
  /* The reference drawer shows a flat recents list, so the legacy chips
     remain mounted for compatibility but are visually hidden. */
  await page.setViewportSize({ width: 420, height: 860 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await page.waitForTimeout(400);

  // Stub the chip-click handler on the bridge so we can capture the call.
  await page.evaluate(() => {
    window.__chipCalls = [];
    const original = window.__socratesLegacy.sessions.onRecentsFilterChipClick;
    window.__socratesLegacy.sessions.onRecentsFilterChipClick = (value) => {
      window.__chipCalls.push(value);
      if (typeof original === 'function') original(value);
    };
  });

  // React should always render the "All" chip first.
  const allChip = page.locator('#recentsFilterChips .recents-filter-chip-btn[data-filter="all"]').first();
  await expect(allChip).toBeAttached();
  await expect(allChip).toHaveClass(/active/);

  await expect(allChip).toBeHidden();
  // Dispatch through the mounted button to check the bridge without making
  // a hidden control user-facing again.
  await allChip.evaluate((button) => button.click());
  const calls = await page.evaluate(() => window.__chipCalls);
  expect(calls).toContain('all');

  // Bridge snapshot reflects the filter (clicking 'all' should clear it).
  const filterAfter = await page.evaluate(() => {
    const s = window.__socratesRecentsFilterBridge?.getSnapshot();
    return s?.filter;
  });
  expect(filterAfter).toBeNull();
});

test('Sidebar React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const nav = page.locator('#sidebarNav');
  await expect(nav).not.toHaveAttribute('data-mounted-by', /.+/);

  const chips = page.locator('#recentsFilterChips');
  await expect(chips).not.toHaveAttribute('data-mounted-by', /.+/);

  const installed = await page.evaluate(() => ({
    nav: typeof window.__socratesSidebarNavBridge === 'object' && window.__socratesSidebarNavBridge !== null,
    filter: typeof window.__socratesRecentsFilterBridge === 'object' && window.__socratesRecentsFilterBridge !== null,
  }));
  expect(installed).toEqual({ nav: true, filter: true });
});
