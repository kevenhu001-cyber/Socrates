import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.use({ hasTouch: true, isMobile: true });

const files = [
  { id: 'file-a', name: 'Very long research synthesis filename that must not push actions off the screen.md', kind: 'text', size: 1234, uploadedAt: '2026-10-01T12:00:00Z' },
  { id: 'file-b', name: 'chart.png', kind: 'image', size: 4567, uploadedAt: '2026-10-01T12:00:00Z' },
];

async function assertFits(frame) {
  await expect(frame).toBeVisible();
  await expect.poll(() => frame.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1;
  })).toBe(true);
}

for (const width of [320, 390, 430]) {
  test(`touch directories fit a ${width}px viewport and library controls work`, async ({ page }) => {
    await page.setViewportSize({ width, height: 680 });
    await mockAuthedApp(page, { lang: 'en' });
    await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, (route) =>
      route.fulfill({ json: { files, hasMore: false } }),
    );
    await page.route(/\/api\/(?:v2\/)?scheduled-tasks(?:\?|$)/, (route) =>
      route.fulfill({ json: { tasks: [{ id: 'task-mobile', title: 'Daily research briefing', prompt: 'Read papers', status: 'active', frequency: 'daily' }] } }),
    );
    await page.goto('/');
    await waitForAppShell(page);
    async function open(id, selector) {
      await page.locator('#sidebarOpenBtn').tap();
      await page.locator(id).tap();
      const frame = page.locator(selector);
      await assertFits(frame);
      return frame;
    }

    const library = await open('#navLibrary', '.library-directory');
    const search = library.locator('.library-search-pill input');
    await expect(search).toHaveCSS('font-size', '16px');
    await search.fill('chart');
    await expect(library.locator('.library-row')).toHaveCount(1);
    await search.fill('');
    await expect(library.locator('.library-row')).toHaveCount(2);
    const grid = library.locator('.library-view-btn').first();
    await grid.tap();
    await expect(library.locator('.library-list')).toHaveClass(/view-grid/);
    await expect(library.locator('.ui-collection-body')).toHaveCSS('display', 'grid');
    const rows = library.locator('.library-row');
    const first = await rows.first().boundingBox();
    const second = await rows.nth(1).boundingBox();
    expect(second.x).toBeGreaterThan(first.x);
    expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    await assertFits(library);
    await library.locator('.library-view-btn').last().tap();
    await expect(library.locator('.library-list')).toHaveClass(/view-list/);
    const more = rows.first().locator('.library-row-more-btn');
    await expect(more).toHaveCSS('height', '44px');
    await more.tap();
    const fileMenu = page.locator('.library-row-menu[role="menu"]');
    await expect(fileMenu).toBeInViewport();
    await expect(fileMenu.getByRole('menuitem')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(fileMenu).toBeHidden();
    await expect(more).toBeFocused();

    const projects = await open('#navProjects', '.projects-directory');
    await expect(projects.locator('.ui-page-search input')).toHaveCSS('font-size', '16px');
    const plugins = await open('#navPlugins', '.plugin-directory');
    await expect(plugins.locator('.plugin-directory-search input')).toHaveCSS('font-size', '16px');
    const scheduled = await open('#navScheduled', '.scheduled-directory');
    await expect(scheduled.locator('.ui-page-search input')).toHaveCSS('font-size', '16px');
    const task = scheduled.locator('.task-row').first();
    await expect(task).toBeVisible();
    await expect(task.locator('.task-inline-action').first()).toBeHidden();
    await task.locator('.task-more-btn').tap();
    const taskMenu = page.locator('.task-action-menu[role="menu"]');
    await expect(taskMenu).toBeInViewport();
    await expect(taskMenu.getByRole('menuitem')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(taskMenu).toBeHidden();
    await assertFits(scheduled);
  });
}
