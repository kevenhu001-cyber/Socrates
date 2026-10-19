import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

const errorsByPage = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([]);
});

async function blockMenuRuntime(page) {
  const report = JSON.parse(readFileSync(new URL('../dist/.vite/entry-graph.json', import.meta.url), 'utf8'));
  const module = report.modules.find((item) => item.id === 'src/react/menu/FoundationMenu.tsx');
  expect(module).toBeTruthy();
  expect(report.chunks.find((chunk) => chunk.file === module.chunk).eager).toBe(false);
  const url = `/${module.chunk}`;
  let release;
  let started;
  const held = new Promise((resolve) => { release = resolve; });
  const requested = new Promise((resolve) => { started = resolve; });
  await page.route(`**${url}`, async (route) => {
    started();
    await held;
    await route.continue();
  });
  return {
    requested,
    release,
    async finish() {
      release();
      // Await evaluation too, so a late mount/focus steal cannot pass unnoticed.
      await page.evaluate((path) => import(path).then(() => undefined), url);
    },
  };
}

test('first click opens the menu after a delayed runtime load', async ({ page }) => {
  const loading = await blockMenuRuntime(page);
  await prepareChatWorkbench(page);
  const trigger = page.locator('.sidebar-account-trigger');
  await trigger.click();
  await loading.requested;
  await expect(trigger).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.sidebar-account-menu')).toHaveCount(0);
  loading.release();
  const menu = page.getByRole('menu', { name: 'Account', exact: true });
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('focus preload keeps the trigger and a cold ArrowUp opens at the last item', async ({ page }) => {
  const loading = await blockMenuRuntime(page);
  await prepareChatWorkbench(page);
  const trigger = page.locator('.sidebar-account-trigger');
  await trigger.focus();
  const original = await trigger.elementHandle();
  await loading.requested;
  await expect(trigger).toBeFocused();
  await expect(page.locator('.sidebar-account-menu')).toHaveCount(0);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
  await page.keyboard.press('ArrowUp');
  loading.release();
  const menu = page.getByRole('menu', { name: 'Account', exact: true });
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
});

for (const dismissal of ['Escape', 'Tab', 'outside']) {
  test(`${dismissal} cancels a pending menu without reopening or stealing focus`, async ({ page }) => {
    const loading = await blockMenuRuntime(page);
    await prepareChatWorkbench(page);
    const trigger = page.locator('.sidebar-account-trigger');
    await trigger.click();
    await loading.requested;
    if (dismissal === 'outside') await page.locator('#composerRoot .rich-composer-editor').click();
    else await page.keyboard.press(dismissal);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const destination = await page.locator(':focus').elementHandle();
    await loading.finish();
    await expect(page.locator('.sidebar-account-menu')).toHaveCount(0);
    expect(await page.evaluate((node) => document.activeElement === node, destination)).toBe(true);
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'Account', exact: true })).toBeVisible();
  });
}
