import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test.beforeEach(async ({ page }) => {
  await prepareChatWorkbench(page);
});

test('Escape restores account trigger focus across repeated open and close', async ({ page }) => {
  const trigger = page.locator('.sidebar-account-trigger');
  const menu = page.locator('.sidebar-account-menu');
  for (let attempt = 0; attempt < 2; attempt++) {
    await trigger.click();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('Tab and outside pointer dismissal preserve the next focus destination', async ({ page }) => {
  const trigger = page.locator('.sidebar-account-trigger');
  const menu = page.locator('.sidebar-account-menu');
  await trigger.click();
  await page.keyboard.press('Tab');
  const destination = await page.locator(':focus').elementHandle();
  expect(await page.evaluate(() => document.activeElement !== document.body
    && !document.activeElement.closest('[role="menu"]'))).toBe(true);
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate((node) => document.activeElement === node, destination)).toBe(true);
  const outside = page.locator('#composerRoot .rich-composer-editor');
  await trigger.click();
  await outside.click();
  await expect(menu).toHaveCount(0);
  await expect(outside).toBeFocused();
});
