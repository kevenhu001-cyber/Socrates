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

test('header is a 48px bar with the switcher at the top-left', async ({ page }) => {
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
  /* The 2026-11-24 alignment pass settled the desktop bar at 48px with a
     32px switcher (docs/design/chatgpt-alignment.md §5). */
  expect(Math.round(g.barH)).toBe(48);
  expect(Math.round(g.swH)).toBe(32);
  expect(Math.round(g.swCy)).toBe(24);
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

test('model trigger and model choices stay in place while pressed', async ({ page }) => {
  for (const locator of [
    page.locator('#topModelSwitcher'),
    page.getByRole('option', { name: /First model/ }),
  ]) {
    const before = await locator.boundingBox();
    expect(before).not.toBeNull();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await expect(locator).toHaveClass(/is-pressed/);
    expect(await locator.boundingBox()).toEqual(before);
    await page.mouse.up();
  }
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

test('phones switch models from the composer and keep the mode tabs centred', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#topModelSwitcher')).toBeHidden();
  const modes = page.locator('#topModeSwitch');
  await expect(modes).toBeVisible();
  const tabs = await modes.boundingBox();
  expect(tabs.x + tabs.width / 2).toBeCloseTo(195, 0);

  await page.locator('#composerRoot .rich-composer-editor').focus();
  const effort = page.locator('#effortTrigger');
  await effort.click();
  const pop = page.locator('.chat-config-pop');
  await pop.getByRole('button', { name: /返回模型列表/ }).click();
  await pop.getByRole('option', { name: /Second model/ }).click();
  await expect(pop).toBeHidden();
  await expect(effort).toHaveAccessibleName(/Second model/);
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
  await page.locator('#composerRoot .rich-composer-editor').focus();
  await expect(effort).toBeVisible();
  await expect(effort.locator('[data-effort-value]')).not.toBeEmpty();
  expect(await page.evaluate(() => typeof window.syncEffortUI)).toBe('undefined');
  await effort.locator('#effortTrigger').click();
  await expect(pop).toBeVisible();
  await expect(effort.locator('#effortTrigger')).toHaveAttribute('aria-expanded', 'true');
});
