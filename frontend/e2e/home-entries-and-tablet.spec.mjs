// e2e/home-entries-and-tablet.spec.mjs — landing entry points + tablet shell.
//
// 1. The phone landing surface used to end at the greeting and the capsule:
//    the quick-action row was hidden below 769px and the tutor starters only
//    rendered above it. Both now come back above the composer.
// 2. 769–1024px used to open with a 278px sidebar, leaving a 509px column.
//    Tablets now start on the 52px rail and keep the content width.

import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('phone landing shows the quick actions above the capsule', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);

  const rail = page.locator('#homeQuickActions');
  await expect(rail).toBeVisible();
  await expect(rail.locator('.home-quick-action')).toHaveCount(3);
  await expect(rail.locator('.home-quick-action[hidden]')).toHaveCount(0);

  /* The row sits above the composer, not under it, and does not run into the
     greeting either. */
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
    };
    return { rail: rect('#homeQuickActions'), composer: rect('#composerInputWrap'), greeting: rect('#topicTitle') };
  });
  expect(boxes.rail.bottom).toBeLessThanOrEqual(boxes.composer.top);
  expect(boxes.rail.top).toBeGreaterThanOrEqual(boxes.greeting.bottom);
  expect(boxes.rail.left).toBeGreaterThanOrEqual(16);

  /* Tapping a chip still reaches the composer extension behind it. Phones
     express the active tool as the chip's pressed state (the composer's own
     tool chip is a desktop affordance), so assert the state, not a chip. */
  const research = rail.locator('.home-quick-action-primary[data-home-action="research"]');
  await research.click();
  await expect(research).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.webSearchOn)).toBe(true);
});

test('phone tutor landing shows the starter cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);

  await page.locator('#topModeTutor').click();
  const starters = page.locator('#homeTutorStarters');
  await expect(starters).toBeVisible();
  await expect(starters.locator('.home-tutor-card')).toHaveCount(3);
  await expect(page.locator('#homeQuickActions')).toBeHidden();

  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { top: box.top, bottom: box.bottom, width: box.width } : null;
    };
    return { starters: rect('#homeTutorStarters'), composer: rect('#composerInputWrap') };
  });
  expect(boxes.starters.bottom).toBeLessThanOrEqual(boxes.composer.top);
});

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
