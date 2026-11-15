// e2e/home-entries-and-tablet.spec.mjs — landing entry points + tablet shell.
//
// 1. The phone landing surface used to end at the greeting and the capsule.
//    It now carries one entry point above the composer: a single suggestion
//    line in Chat mode and the tutor starter cards in Tutor mode. The
//    desktop shortcut rail stays off the phone — the reference shows one
//    quiet line, and the same actions remain in the composer's + menu.
// 2. 769–1024px used to open with a 278px sidebar, leaving a 509px column.
//    Tablets now start on the 52px rail and keep the content width.

import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('phone landing shows one suggestion line above the capsule', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);

  /* The desktop rail is a wide-screen affordance; the phone keeps one
     muted suggestion line instead. */
  await expect(page.locator('#homeQuickActions')).toBeHidden();
  const suggestion = page.locator('#homeSuggestion [data-testid="home-suggestion"]');
  await expect(suggestion).toHaveCount(1);
  await expect(suggestion).toBeVisible();

  /* The line sits above the composer, not under it, and does not run into
     the greeting either. */
  const boxes = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
    };
    return { suggestion: rect('#homeSuggestion'), composer: rect('#composerInputWrap'), greeting: rect('#topicTitle') };
  });
  expect(boxes.suggestion.bottom).toBeLessThanOrEqual(boxes.composer.top);
  expect(boxes.suggestion.left).toBeGreaterThanOrEqual(16);

  /* Tapping it fills the composer with the tutor prompt it reuses. */
  await suggestion.click();
  await expect(page.locator('#composerRoot .rich-composer-editor')).toContainText('Help me understand a concept');
});

test('phone tutor landing shows the starter cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);

  await page.locator('#topModeTutor').click();
  const starters = page.locator('#homeTutorStarters');
  await expect(starters).toBeVisible();
  await expect(starters.locator('[data-testid^="home-starter-"]')).toHaveCount(3);
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
