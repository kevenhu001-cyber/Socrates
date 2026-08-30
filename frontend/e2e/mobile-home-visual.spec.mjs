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
  /* ChatGPT keeps the two mode tabs visible on the compact landing surface;
     the legacy dropdown remains mounted only for compatibility. */
  const modeTabs = page.locator('#modeSegmentedTop');
  const modeSwitch = page.locator('#mobileModeTrigger');
  const composer = page.locator('#topicInputWrap');
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');

  /* The landing surface keeps two lightweight suggestions directly above
     the bottom composer. Chat follow-ups live in a separate container and
     must not be counted as landing ideas. */
  await expect(page.locator('.mobile-starter-prompt')).toHaveCount(0);
  await expect(page.locator('.home-ideas .home-idea')).toHaveCount(2);
  await expect(page.locator('.home-ideas .home-idea:visible')).toHaveCount(2);
  await expect(leftButton).toBeVisible();
  await expect(modeTabs).toBeVisible();
  await expect(modeSwitch).toBeHidden();
  await expect(composer).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null;
    };
    return {
      left: rect('#sidebarOpenBtn'),
      right: rect('#mobileIncognitoBtn'),
      modeTabs: rect('#modeSegmentedTop'),
      composer: rect('#topicInputWrap'),
      ideas: rect('.home-ideas'),
      /* .main is a transparent layout box; the painted surface is
         .main-content (the shell's page colour). The dark workbench uses
         the same pure-black page treatment as the reference. */
      background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
      pageToken: getComputedStyle(document.getElementById('appShell')).getPropertyValue('--cowork-page').trim(),
    };
  });

  expect(geometry.left?.width).toBe(44);
  expect(geometry.left?.height).toBe(44);
  expect(geometry.right?.width).toBe(44);
  expect(geometry.modeTabs?.width).toBeGreaterThanOrEqual(168);
  expect(geometry.modeTabs?.height).toBeGreaterThanOrEqual(40);
  expect(geometry.composer?.width).toBeGreaterThanOrEqual(320);
  expect(geometry.composer?.height).toBeLessThanOrEqual(132);
  expect(geometry.ideas?.bottom).toBeLessThanOrEqual(geometry.composer?.y ?? 0);
  expect(geometry.ideas?.bottom).toBeLessThanOrEqual(820);
  expect(geometry.composer?.y).toBeGreaterThan(600);
  expect(geometry.composer?.y).toBeLessThan(820);
  expect(geometry.background).toBe('rgb(0, 0, 0)');
  expect(geometry.pageToken).toBe('0 0% 0%');

  await page.screenshot({ path: 'test-results/mobile-home-reference-collapsed.png', fullPage: true });

  /* The supplied visual's app-owned region normalizes to roughly 390×756
     after removing browser chrome. Capture that exact comparison viewport
     outside the repo for the design-QA pass. */
  await page.setViewportSize({ width: 390, height: 756 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: '/tmp/socrates-mobile-reference-implementation.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);

  /* Focus promotes the landing composer to the two-row layout shown in the
     reference focused capture while keeping every control reachable. */
  const beforeFocus = (await composer.boundingBox())?.height ?? 0;
  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  const afterFocus = (await composer.boundingBox())?.height ?? 0;
  expect(afterFocus).toBeGreaterThanOrEqual(beforeFocus);
  expect(afterFocus).toBeLessThanOrEqual(200);
  await expect(composer.locator('.effort-picker')).toBeVisible();
  await expect(composer.locator('.mobile-mic-btn')).toBeVisible();
  await expect(composer.locator('.start-btn')).toBeVisible();

  await page.locator('#topicComposerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.composer-tools-mobile-item')).toHaveCount(4);
  await expect(menu).toContainText('Camera');
  await expect(menu).toContainText('Photos');
  await expect(menu).toContainText('Files');
  await expect(menu).toContainText('Tools');
  await expect(menu.locator('.composer-tools-mobile-items > .composer-tools-mobile-item')).toHaveCount(4);
  await expect(menu.locator('#composerToolsMobileMore [data-composer-action="extensiveThinking"]')).toBeHidden();
  const menuBox = await menu.boundingBox();
  expect(menuBox?.width).toBeLessThanOrEqual(224);
  expect(menuBox?.width).toBeGreaterThanOrEqual(222);

  await page.screenshot({ path: 'test-results/mobile-home-reference-menu.png', fullPage: true });

  await menu.getByRole('menuitem', { name: 'Tools' }).click();
  await expect(menu.getByRole('menuitem', { name: 'Think deeper' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Think deeper' }).click();
  await expect(menu).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.extensiveThinkingOn === true)).toBe(true);

  await page.locator('#topicComposerToolsBtn').click();
  await menu.getByRole('menuitem', { name: 'Tools' }).click();
  const activeThinking = menu.getByRole('menuitem', { name: 'Think deeper' });
  await expect(activeThinking).toHaveClass(/is-active/);
  await expect(activeThinking.locator('.composer-tools-active-dot')).toBeVisible();
});
