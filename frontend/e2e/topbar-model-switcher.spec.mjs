// e2e/topbar-model-switcher.spec.mjs — chatgpt.com-style header
// (docs/ref/chatgpt-parity.md): top-left "Socrates <model> ▾" opens the chat
// configuration menu left-aligned under it; mode tabs sit centered.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthedApp(page, {
    lang: 'zh',
    apiKeys: {
      providers: [
        {
          id: 'switcher-first',
          label: 'First model',
          model: 'first-v1',
          url: 'https://first.example/v1',
          hasKey: true,
          isActive: true,
        },
        {
          id: 'switcher-second',
          label: 'Second model',
          model: 'second-v1',
          url: 'https://second.example/v1',
          hasKey: true,
          isActive: false,
        },
      ],
    },
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
});

test('header is a 52px bar with the switcher at the top-left', async ({ page }) => {
  const g = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const bar = r('.top-bar');
    const sw = r('#topModelSwitcher');
    return {
      barH: bar.height,
      swLeft: sw.left - bar.left,
      swH: sw.height,
      swCy: sw.top + sw.height / 2 - bar.top,
    };
  });
  expect(Math.round(g.barH)).toBe(52);
  expect(Math.round(g.swH)).toBe(36);
  expect(Math.round(g.swCy)).toBe(26);
  expect(g.swLeft).toBeLessThanOrEqual(12);
  await expect(page.locator('#topModelSwitcher [data-part="model-brand"]')).toHaveText('Socrates');
});

test('switcher toggles the configuration menu below it and closes on outside click', async ({
  page,
}) => {
  const sw = page.locator('#topModelSwitcher');
  await sw.click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  await expect(sw).toHaveAttribute('aria-expanded', 'true');
  /* The click lands mid-press (styles/polish/press.css scales the switcher
     for ~270ms) while the popover is anchored to the switcher's resting box
     (legacy/pressFeedback.ts restingRect). Compare against that resting box. */
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

test('React model selection updates the top-bar label', async ({ page }) => {
  const switcher = page.locator('#topModelSwitcher');
  await expect(page.locator('#topModelSwitcherModel')).toHaveText('First model');
  await switcher.click();
  const pop = page.locator('.chat-config-pop');
  await pop.getByRole('option', { name: /Second model/ }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.locator('#topModelSwitcherModel')).toHaveText('Second model');
  await expect(switcher).toHaveAttribute('aria-label', /Second model/);
});

test('phones carry no header model chip; the composer effort control reaches the model list', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  /* 2026-11-18 reference (docs/ref/mobile-reference-2026-11-18.md): the phone
     header is sidebar glyph, centred mode switch and the temporary-chat
     glyph. The model chip is gone; the composer's effort control opens the
     same popover, whose heading leads back to the model list. */
  await expect(page.locator('#topModeSwitch')).toBeVisible();
  await expect(page.locator('#topModelSwitcher')).toBeHidden();
  await expect(page.locator('#mobileIncognitoBtn')).toBeVisible();
  const gap = await page.evaluate(() => {
    const tabs = document.getElementById('topModeSwitch').getBoundingClientRect();
    const trailing = document.getElementById('mobileIncognitoBtn').getBoundingClientRect();
    return Math.round(trailing.left - tabs.right);
  });
  expect(gap).toBeGreaterThan(0);
  await page.locator('#effortTrigger:visible').first().click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeInViewport();
  await pop.locator('.chat-config-effort-head').click();
  await expect(pop.getByRole('option').first()).toBeVisible();
});

test('switcher exposes the React model label and composer effort stays in sync', async ({
  page,
}) => {
  const switcher = page.locator('#topModelSwitcher');
  const model = (await page.locator('#topModelSwitcherModel').textContent())?.trim() || '';
  expect(model).not.toBe('');
  expect(await switcher.getAttribute('aria-label')).toContain(model);

  await switcher.click();
  const pop = page.locator('.chat-config-pop');
  await pop.locator('.chat-config-row:not([role="option"])').first().click();
  const slider = pop.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('End');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort')))
    .toBe('high');
  await switcher.click();
  await expect(pop).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const effort = page.locator('#composerInputWrap [data-composer-control=effort]');
  await expect(effort).toHaveAttribute('data-effort', 'high');
  await expect(effort).toBeVisible();
  await expect(effort.locator('[data-effort-value]')).not.toBeEmpty();
  expect(await page.evaluate(() => typeof window.syncEffortUI)).toBe('undefined');
  await effort.locator('#effortTrigger').click();
  await expect(pop).toBeVisible();
  await expect(effort.locator('#effortTrigger')).toHaveAttribute('aria-expanded', 'true');
});
