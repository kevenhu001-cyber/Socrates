import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test.beforeEach(async ({ page }) => {
  await prepareChatWorkbench(page);
});

test('account menu uses the shared overlay entrance anchored to its trigger edge', async ({ page }) => {
  await page.locator('.sidebar-account-trigger').click();
  const menu = page.locator('.sidebar-account-menu');
  await expect(menu).toBeVisible();

  const motion = await menu.evaluate((node) => {
    const style = getComputedStyle(node);
    const [rawX = '0', rawY = '0'] = style.transformOrigin.split(' ');
    const px = (raw, size) => (raw.endsWith('%') ? (Number.parseFloat(raw) / 100) * size : Number.parseFloat(raw));
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      placement: node.dataset.placement,
      align: node.dataset.align,
      originX: px(rawX, node.offsetWidth),
      originY: px(rawY, node.offsetHeight),
      width: node.offsetWidth,
      height: node.offsetHeight,
    };
  });

  expect(motion.animationName).toBe('ui-overlay-in');
  expect(motion.animationDuration).toBe('0.16s');
  expect(motion.placement).toBe('above');
  expect(motion.align).toBe('end');
  expect(motion.originX).toBeCloseTo(motion.width, 0);
  expect(motion.originY).toBeCloseTo(motion.height, 0);
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
