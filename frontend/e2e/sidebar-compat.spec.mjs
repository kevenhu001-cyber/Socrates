// e2e/sidebar-compat.spec.mjs — Batch 2 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the sidebar nav buttons and
// recents filter chips are owned by React. Both navigation and filter
// state are held by typed stores and have no published snapshot aliases.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
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

  // Both state domains are typed stores; recents has no window snapshot.
  const bridges = await page.evaluate(() => ({
    nav: '__socratesSidebarNavBridge' in window,
    filter: typeof window.__socratesRecentsFilterBridge === 'object' && window.__socratesRecentsFilterBridge !== null,
  }));
  expect(bridges).toEqual({ nav: false, filter: false });
});

test('Sidebar React nav buttons navigate and reflect active state', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // React calls the typed navigation service directly.
  await page.locator('#navPlugins').click();
  await expect(page).toHaveURL(/\/plugins$/);

  // The Plugins button should now have the .active class (React re-renders).
  const pluginsBtn = page.locator('#navPlugins');
  await expect(pluginsBtn).toHaveClass(/active/);
});

test('typed recents filter updates while the compact drawer hides chips', async ({ page }) => {
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
  await page.evaluate(() => localStorage.setItem('socrates-recents-filter', 'algebra'));
  await page.reload();
  await waitForAppShell(page);

  // React should always render the "All" chip first.
  const allChip = page.locator('#recentsFilterChips .recents-filter-chip-btn[data-filter="all"]').first();
  await expect(allChip).toBeAttached();
  await expect(allChip).not.toHaveClass(/active/);

  await expect(allChip).toBeHidden();
  // Exercise the mounted control without making it visible in the drawer.
  await allChip.evaluate((button) => button.click());
  const filterAfter = await page.evaluate(() => localStorage.getItem('socrates-recents-filter'));
  expect(filterAfter).toBeNull();
  await expect(allChip).toHaveClass(/active/);
});

test('React recents chips refresh after project and session caches change', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(v2\/)?projects(?:\?|$)/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [{ id: 'project-algebra', name: 'Algebra project' }] }),
    });
  });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await expect(page.locator('#recentsFilterChips [data-filter="project:project-algebra"]')).toContainText('Algebra project');
  await page.evaluate(() => {
    window.SERVER_SESSIONS = [
      { id: 'session-1', tags: ['algebra', 'practice'] },
      { id: 'session-2', tags: ['algebra'] },
    ];
    window.renderRecents();
  });

  await expect(page.locator('#recentsFilterChips [data-filter="project:project-algebra"]')).toContainText('Algebra project');
  await expect(page.locator('#recentsFilterChips [data-filter="algebra"]')).toHaveCount(1);
  await expect(page.locator('#recentsFilterChips [data-filter="practice"]')).toHaveCount(1);
});

test('Recents fetches project filter data once while the request is pending', async ({ page }) => {
  let projectRequestCount = 0;
  let releaseProjects;
  const projectsGate = new Promise((resolve) => { releaseProjects = resolve; });

  await mockAuthedApp(page);
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/projects')) {
      projectRequestCount += 1;
      await projectsGate;
    }
    await route.fallback();
  });

  try {
    await gotoAndSettle(page, '/');
    await page.waitForLoadState('domcontentloaded');
    await waitForAppShell(page);
    await expect.poll(() => projectRequestCount).toBe(1);

    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => window.renderRecents());
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    }

    expect(projectRequestCount).toBe(1);
  } finally {
    releaseProjects();
  }
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
    nav: '__socratesSidebarNavBridge' in window,
    filter: typeof window.__socratesRecentsFilterBridge === 'object' && window.__socratesRecentsFilterBridge !== null,
  }));
  expect(installed).toEqual({ nav: false, filter: false });
});
