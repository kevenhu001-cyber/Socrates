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
    apiKeys: { providers: [
      { id: 'switcher-first', label: 'First model', model: 'first-v1', url: 'https://first.example/v1', hasKey: true, isActive: true },
      { id: 'switcher-second', label: 'Second model', model: 'second-v1', url: 'https://second.example/v1', hasKey: true, isActive: false },
    ] },
  });
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
     (ui/pressFeedback.ts restingRect). Compare against that resting box. */
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

test('phones name the model in a chip instead of an unlabelled settings glyph', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#topModelSwitcher')).toBeVisible();
  /* The chip carries the resolved model name; the brand lockup and the
     settings glyph are desktop/empty-state fallbacks. */
  await expect(page.locator('#topModelSwitcher .top-model-switcher-model')).toBeVisible();
  await expect(page.locator('#topModelSwitcher .top-model-switcher-model')).toHaveText(/\S/);
  await expect(page.locator('#topModelSwitcher .top-model-switcher-name')).toBeHidden();
  await expect(page.locator('#topModelSwitcher .top-model-switcher-settings')).toBeHidden();
  await expect(page.locator('#topModeSwitch')).toBeVisible();
  /* The chip must clear the centred mode switch rather than run under it. */
  const gap = await page.evaluate(() => {
    const tabs = document.getElementById('topModeSwitch').getBoundingClientRect();
    const model = document.getElementById('topModelSwitcher').getBoundingClientRect();
    return Math.round(model.left - tabs.right);
  });
  expect(gap).toBeGreaterThan(0);
  await page.locator('#topModelSwitcher').click();
  await expect(page.locator('.chat-config-pop')).toBeInViewport();
});

test('switcher exposes the React model label and composer effort stays in sync', async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort'))).toBe('high');
  await switcher.click();
  await expect(pop).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const effort = page.locator('#composerInputWrap .effort-picker');
  await expect(effort).toHaveAttribute('data-effort', 'high');
  await expect(effort).toBeVisible();
  await expect(effort.locator('.effort-value')).not.toBeEmpty();
  expect(await page.evaluate(() => typeof window.syncEffortUI)).toBe('undefined');
  await effort.locator('.effort-trigger').click();
  await expect(pop).toBeVisible();
  await expect(effort.locator('.effort-trigger')).toHaveAttribute('aria-expanded', 'true');
});
