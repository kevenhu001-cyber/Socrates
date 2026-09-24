// e2e/projects-directory.spec.mjs — Projects workspace page geometry.
//
// Contract: the directory header stays a compact single-line title plus a
// one-line description, the filter tab rail and its buttons keep reference
// proportions, and the search field/action stay inside the header row. The
// page must keep working in both the populated and empty states.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const PROJECTS = {
  projects: [
    { id: 'p1', name: 'Thesis research', description: 'Sources and drafts', updatedAt: '2026-09-20T10:00:00.000Z' },
    { id: 'p2', name: 'Exam prep', description: 'Practice questions', updatedAt: '2026-09-18T08:30:00.000Z' },
  ],
};

async function openProjects(page, { withProjects }) {
  await mockAuthedApp(page);
  if (withProjects) {
    await page.route(/\/api\/(v2\/)?projects(\?|$)/, (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROJECTS) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      }
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.click('#navProjects');
  await expect(page.locator('#projects-directory-title')).toBeVisible();
}

test('projects directory header, tabs, and search keep compact geometry', async ({ page }) => {
  await openProjects(page, { withProjects: true });
  await expect(page.locator('.project-row')).toHaveCount(PROJECTS.projects.length);

  const geometry = await page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    const desc = document.querySelector('.workspace-page-head p');
    const descStyle = desc ? getComputedStyle(desc) : null;
    return {
      head: box('.workspace-page-head'),
      descHeight: desc?.getBoundingClientRect().height ?? null,
      descWraps: desc && descStyle ? desc.scrollWidth > desc.clientWidth + 1 : null,
      search: box('.workspace-search-field'),
      tabs: box('.projects-filter-tabs'),
      tabButton: box('.projects-filter-tabs [role="tab"]'),
    };
  });

  /* Header: title + one-line description, not the old oversized block. */
  expect(geometry.head?.height ?? 0).toBeLessThanOrEqual(72);
  expect(geometry.descHeight ?? 99).toBeLessThanOrEqual(24);
  expect(geometry.descWraps).toBe(false);
  /* Search stays the compact field inside the header row. */
  expect(geometry.search?.width ?? 0).toBeGreaterThanOrEqual(200);
  expect(geometry.search?.width ?? 999).toBeLessThanOrEqual(280);
  expect(Math.abs((geometry.search?.y ?? 0) - (geometry.head?.y ?? 0))).toBeLessThanOrEqual(20);
  /* Tab rail and pills. */
  expect(geometry.tabs?.height ?? 0).toBeLessThanOrEqual(48);
  expect(geometry.tabButton?.height ?? 0).toBeLessThanOrEqual(36);
});

test('projects directory empty state keeps the same compact chrome', async ({ page }) => {
  await openProjects(page, { withProjects: false });
  const empty = page.locator('.projects-directory .workspace-empty');
  await expect(empty).toBeVisible();

  const tabsHeight = await page.locator('.projects-filter-tabs').evaluate((el) => el.getBoundingClientRect().height);
  expect(tabsHeight).toBeLessThanOrEqual(48);
  const titleBox = await page.locator('#projects-directory-title').boundingBox();
  expect(titleBox?.height ?? 0).toBeLessThanOrEqual(40);
});
