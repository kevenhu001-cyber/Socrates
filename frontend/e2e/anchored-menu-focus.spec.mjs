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
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      placement: node.dataset.placement,
      align: node.dataset.align,
      originX: px(rawX, node.offsetWidth),
      originY: px(rawY, node.offsetHeight),
      width: node.offsetWidth,
      height: node.offsetHeight,
    };
  });

  expect(motion.animationName).toBe('none');
  expect(motion.transitionProperty).toBe('opacity, transform');
  expect(motion.transitionDuration).toBe('0.18s, 0.22s');
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

test('account menu opens from the keyboard and supports bounds and typeahead', async ({ page }) => {
  const trigger = page.locator('.sidebar-account-trigger');
  const menu = page.getByRole('menu', { name: 'Account', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-controls', await menu.getAttribute('id'));
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.type('Settings');
  await expect(menu.getByRole('menuitem', { name: 'Settings', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.settings-modal')).toBeVisible();
});

for (const variant of ['light', 'dark', 'mobile']) {
  test(`account menu stays within the ${variant} viewport`, async ({ page }, testInfo) => {
    if (variant === 'mobile') {
      await page.setViewportSize({ width: 390, height: 640 });
      // The resize handler closes the desktop drawer on a width change. Wait
      // for that commit before reopening through the real mobile control.
      await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
      await page.locator('#sidebarOpenBtn').click();
      await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
    }
    await page.evaluate((theme) => {
      if (document.documentElement.dataset.mode !== theme) window.toggleTheme();
    }, variant === 'dark' ? 'dark' : 'light');
    await page.locator('.sidebar-account-trigger').click();
    const menu = page.locator('.sidebar-account-menu');
    await expect(menu).toBeVisible();
    // Wait for entrance motion to finish before measuring the actual surface.
    await menu.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    const bounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds.x).toBeGreaterThanOrEqual(5);
    expect(bounds.y).toBeGreaterThanOrEqual(5);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 5);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 5);
    await expect(menu.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeInViewport();
    await testInfo.attach(`account-menu-${variant}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

test('a short viewport scrolls the account menu and keeps its last action reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 220 });
  const trigger = page.locator('.sidebar-account-trigger');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.locator('.sidebar-account-menu');
  await expect(menu).toBeVisible();
  await expect.poll(() => menu.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.keyboard.press('End');
  const last = menu.getByRole('menuitem').last();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
