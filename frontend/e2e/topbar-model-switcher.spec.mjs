// e2e/topbar-model-switcher.spec.mjs — chatgpt.com-style header
// (docs/ref/chatgpt-parity.md): top-left "Socrates <model> ▾" opens the chat
// configuration menu left-aligned under it; mode tabs sit centered.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
});

test('header is a 52px bar with the switcher at the top-left', async ({ page }) => {
  const g = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const bar = r('.top-bar'); const sw = r('#topModelSwitcher');
    return { barH: bar.height, swLeft: sw.left - bar.left, swH: sw.height, swCy: sw.top + sw.height / 2 - bar.top };
  });
  expect(Math.round(g.barH)).toBe(52);
  expect(Math.round(g.swH)).toBe(36);
  expect(Math.round(g.swCy)).toBe(26);
  expect(g.swLeft).toBeLessThanOrEqual(12);
  await expect(page.locator('#topModelSwitcher .top-model-switcher-name')).toHaveText('Socrates');
});

test('switcher toggles the configuration menu below it and closes on outside click', async ({ page }) => {
  const sw = page.locator('#topModelSwitcher');
  await sw.click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  await expect(sw).toHaveAttribute('aria-expanded', 'true');
  /* The click lands mid-press (styles/polish/press.css scales the switcher
     for ~270ms) while the popover is anchored to the switcher's resting box
     (ui/pressFeedback.js restingRect). Compare against that resting box. */
  await expect(sw).not.toHaveClass(/\bis-press/);
  const [a, b] = await Promise.all([sw.boundingBox(), pop.boundingBox()]);
  expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(1);
  expect(b.y).toBeGreaterThan(a.y + a.height);

  await sw.click();
  await expect(pop).toHaveCount(0);
  await expect(sw).toHaveAttribute('aria-expanded', 'false');

  await sw.click();
  await expect(pop).toBeVisible();
  await page.mouse.click(1000, 700);
  await expect(pop).toHaveCount(0);
});

test('phones keep the switcher hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#topModelSwitcher')).toBeHidden();
});
