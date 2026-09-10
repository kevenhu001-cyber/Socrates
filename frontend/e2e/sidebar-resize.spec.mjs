// e2e/sidebar-resize.spec.mjs — regression for the drag-to-resize handle.
//
// sidebarResize.js writes `--app-sidebar-width` on <html>. A fixed
// `--app-sidebar-width: var(--cg-sidebar-width)` declaration on #appShell /
// .sidebar used to shadow that value, so dragging updated the variable but
// the rail stayed pinned at 260px. These assertions pin the contract:
// drag → variable → computed rail + main gutter, and the width persists.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function railMetrics(page) {
  return page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('.main');
    return {
      varValue: getComputedStyle(document.documentElement)
        .getPropertyValue('--app-sidebar-width').trim(),
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      mainPadLeft: Math.round(parseFloat(getComputedStyle(main).paddingLeft)),
      collapsed: sidebar.classList.contains('collapsed'),
    };
  });
}

test('sidebar resize handle drags the rail and persists the width', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const before = await railMetrics(page);
  expect(before.collapsed).toBe(false);
  expect(before.sidebarWidth).toBe(before.mainPadLeft);
  expect(before.varValue).toBe(`${before.sidebarWidth}px`);

  const handle = page.locator('#sidebarResizeHandle');
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY, { steps: 8 });
  await page.mouse.up();

  const after = await railMetrics(page);
  expect(after.sidebarWidth).toBe(before.sidebarWidth + 80);
  expect(after.mainPadLeft).toBe(after.sidebarWidth);
  expect(after.varValue).toBe(`${after.sidebarWidth}px`);

  const stored = await page.evaluate(() => localStorage.getItem('socrates-sidebar-width'));
  expect(Number(stored)).toBe(after.sidebarWidth);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  const restored = await railMetrics(page);
  expect(restored.sidebarWidth).toBe(after.sidebarWidth);
});

test('sidebar resize handle clamps to its min/max range', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const start = await railMetrics(page);
  const handle = page.locator('#sidebarResizeHandle');
  const box = await handle.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 5000, startY, { steps: 4 });
  await page.mouse.up();
  const maxed = await railMetrics(page);
  expect(maxed.sidebarWidth).toBe(480);
  expect(start.varValue).not.toBe('480px');

  await page.mouse.move(maxed.sidebarWidth - 4, startY);
  await page.mouse.down();
  await page.mouse.move(-5000, startY, { steps: 4 });
  await page.mouse.up();
  const min = await railMetrics(page);
  expect(min.sidebarWidth).toBe(200);
});
