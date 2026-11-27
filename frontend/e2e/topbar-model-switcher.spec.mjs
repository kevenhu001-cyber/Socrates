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
          capabilities: { isReasoning: true, supportsInstant: true },
        },
        {
          id: 'switcher-second',
          label: 'Second model',
          model: 'second-v1',
          url: 'https://second.example/v1',
          hasKey: true,
          isActive: false,
          capabilities: { isReasoning: false },
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
  /* The 2026-11-27 menu pass keeps the 48px bar but gives the switcher the
     reference's 36px pill so it matches the composer's control rung. */
  expect(Math.round(g.barH)).toBe(48);
  expect(Math.round(g.swH)).toBe(36);
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
  await page.locator('#composerToolsBtn').click();
  await page.locator('#composerToolsMenu [data-composer-action=reasoningEffort]').click();
  const pop = page.locator('.chat-config-pop');
  await pop.getByRole('button', { name: /返回模型列表/ }).click();
  await pop.getByRole('option', { name: /Second model/ }).click();
  await expect(pop).toBeHidden();
  await page.locator('#composerToolsBtn').click();
  await page.locator('#composerToolsMenu [data-composer-action=reasoningEffort]').click();
  await pop.getByRole('button', { name: /返回模型列表/ }).click();
  await expect(pop.getByRole('option', { name: /Second model/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await pop.getByRole('button', { name: /速度/ }).click();
  await pop.getByRole('button', { name: /返回模型列表.*速度/ }).click();
  await expect(pop.getByRole('option', { name: /Second model/ })).toBeVisible();
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
  await expect(page.locator('#composerInputWrap [data-composer-control=effort]')).toBeVisible();
  await expect(page.locator('#effortTrigger')).toContainText(/高|High/);
  expect(await page.evaluate(() => typeof window.syncEffortUI)).toBe('undefined');
  await page.locator('#effortTrigger').click();
  await expect(pop.getByRole('slider')).toHaveAttribute('aria-valuetext', /高|High/);
});

test('phone tools menu opens the model list directly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#composerRoot .rich-composer-editor').focus();
  await page.locator('#composerToolsBtn').click();
  await page.locator('#composerToolsMenu [data-composer-action="model"]').click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop.getByRole('option', { name: /First model/ })).toBeVisible();
  await expect(pop.getByRole('slider')).toHaveCount(0);
  await pop.getByRole('option', { name: /Second model/ }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.locator('#topModelSwitcherModel')).toHaveText('Second model');
});

test('phone model menu stays above the composer after a viewport resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#composerRoot .rich-composer-editor').focus();
  const trigger = page.locator('#composerToolsBtn');
  await trigger.click();
  await page.locator('#composerToolsMenu [data-composer-action=reasoningEffort]').click();
  const pop = page.locator('.chat-config-pop');
  await pop.getByRole('button', { name: /返回模型列表/ }).click();
  for (const height of [844, 600, 500]) {
    await page.setViewportSize({ width: 390, height });
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([trigger.boundingBox(), pop.boundingBox()]);
        if (!a || !b) return false;
        return (
          b.y >= 0 && b.x >= 0 && b.x + b.width <= 391 && Math.abs(a.y - b.y - b.height - 8) <= 2
        );
      })
      .toBe(true);
  }
});

test('model menu uses canonical icons, visible divider and selected keyboard focus', async ({
  page,
}) => {
  const trigger = page.locator('#topModelSwitcher');
  await trigger.focus();
  await trigger.press('Enter');
  const pop = page.locator('.chat-config-pop');
  const active = pop.locator('[role="option"][aria-selected="true"]');
  await expect(active).toBeFocused();
  const geometry = await pop.evaluate((menu) => {
    const selected = menu.querySelector('[role="option"][aria-selected="true"]');
    const divider = menu.querySelector('.chat-config-divider');
    const glyph = menu.querySelector('.chat-config-value svg');
    return {
      radius: getComputedStyle(menu).borderTopLeftRadius,
      divider: divider?.getBoundingClientRect().height,
      selectedWidth: selected?.getBoundingClientRect().width,
      menuWidth: menu.getBoundingClientRect().width,
      officialChevron: glyph?.getAttribute('data-icon-source'),
    };
  });
  expect(geometry.radius).toBe('16px');
  expect(geometry.divider).toBe(1);
  expect(geometry.menuWidth).toBe(300);
  expect(geometry.selectedWidth).toBeGreaterThan((geometry.menuWidth ?? 0) - 24);
  expect(geometry.officialChevron).toBe('openai-apps-sdk');
  await expect(pop.locator('.chat-config-section-label')).toHaveText('模型');
  await expect(active).toContainText('可深度思考，也可直接回答');
  await expect(pop.getByRole('option', { name: /Second model/ })).toContainText('直接回答');
  await pop.locator('.chat-config-row:not([role="option"])').first().click();
  await expect(pop.locator('.chat-config-back')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(active).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('speed panel returns to the models and focuses the saved speed when reopened', async ({
  page,
}) => {
  await page.locator('#topModelSwitcher').press('Enter');
  const pop = page.locator('.chat-config-pop');
  const speed = pop.getByRole('button', { name: /^速度/ });
  await speed.press('Enter');
  await expect(pop.getByRole('option', { name: /^标准/ })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(pop.getByRole('button', { name: /返回模型列表.*速度/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pop.getByRole('option', { name: /First model/ })).toBeFocused();

  await speed.press('Enter');
  await pop.getByRole('option', { name: /^快速/ }).press('Enter');
  await expect(speed).toContainText('快速');
  await speed.press('Enter');
  const fast = pop.getByRole('option', { name: /^快速/ });
  await expect(fast).toHaveAttribute('aria-selected', 'true');
  await expect(fast).toBeFocused();
});
