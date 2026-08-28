import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile conversation home matches the compact dark reference layout', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await page.waitForTimeout(350);

  const leftButton = page.locator('#sidebarOpenBtn');
  const modeTabs = page.locator('#modeSegmentedTop');
  const composer = page.locator('#topicInputWrap');
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');

  await expect(page.locator('.mobile-starter-prompt')).toHaveCount(2);
  await expect(leftButton).toBeVisible();
  await expect(modeTabs).toBeVisible();
  await expect(composer).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null;
    };
    return {
      left: rect('#sidebarOpenBtn'),
      right: rect('#mobileIncognitoBtn'),
      tabs: rect('#modeSegmentedTop'),
      composer: rect('#topicInputWrap'),
      background: getComputedStyle(document.querySelector('.main')).backgroundColor,
    };
  });

  expect(geometry.left?.width).toBe(44);
  expect(geometry.left?.height).toBe(44);
  expect(geometry.right?.width).toBe(44);
  expect(geometry.tabs?.width).toBeGreaterThanOrEqual(168);
  expect(geometry.tabs?.height).toBe(44);
  expect(geometry.composer?.width).toBeGreaterThanOrEqual(360);
  expect(geometry.composer?.height).toBeLessThanOrEqual(72);
  expect(geometry.composer?.bottom).toBeGreaterThanOrEqual(825);
  expect(geometry.background).toBe('rgb(0, 0, 0)');

  await page.screenshot({ path: 'test-results/mobile-home-reference-collapsed.png', fullPage: true });

  await editor.click();
  await expect.poll(async () => (await composer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(120);
  await expect(composer.locator('.effort-picker')).toBeVisible();
  await expect(composer.locator('.mobile-mic-btn')).toBeVisible();

  await page.locator('#topicComposerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.composer-tools-mobile-item')).toHaveCount(5);
  await expect(menu).toContainText('Camera');
  await expect(menu).toContainText('Photos');
  await expect(menu).toContainText('Files');
  await expect(menu).toContainText('Plugins');
  await expect(menu).toContainText('Think deeper');
  const menuBox = await menu.boundingBox();
  expect(menuBox?.width).toBeLessThanOrEqual(258);
  expect(menuBox?.width).toBeGreaterThanOrEqual(250);

  await page.screenshot({ path: 'test-results/mobile-home-reference-menu.png', fullPage: true });

  await menu.getByRole('menuitem', { name: 'Think deeper' }).click();
  await expect(menu).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.extensiveThinkingOn === true)).toBe(true);

  await page.locator('#topicComposerToolsBtn').click();
  const activeThinking = menu.getByRole('menuitem', { name: 'Think deeper' });
  await expect(activeThinking).toHaveClass(/is-active/);
  await expect(activeThinking.locator('.composer-tools-check')).toBeVisible();
});
