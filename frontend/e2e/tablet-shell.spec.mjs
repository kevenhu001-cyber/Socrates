// e2e/tablet-shell.spec.mjs — tablet shell.
//
// 769–1024px used to open with a 278px sidebar, leaving a 509px column.
// Tablets now start on the 52px rail and keep the content width.
//
// The landing entry-point specs that lived here (the phone suggestion line,
// the tutor starter cards) were dropped on 2026-11-16, when the landing
// entries under the composer were removed: the landing is the greeting plus
// the composer.

import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('tablets boot on the 52px rail and keep the content width', async ({ page }) => {
  for (const width of [834, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await mockAuthedApp(page);
    await page.goto('/');
    await waitForAppShell(page);

    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    const boxes = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar').getBoundingClientRect();
      const inner = document.getElementById('mainInner').getBoundingClientRect();
      return { sidebarWidth: sidebar.width, contentWidth: inner.width };
    });
    expect(Math.round(boxes.sidebarWidth)).toBe(52);
    /* The old default was a 260–278px sidebar; the rail has to give that
       width back to the conversation column. */
    expect(boxes.contentWidth).toBeGreaterThan(width - 120);
  }
});

test('desktop still opens with the full sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
});