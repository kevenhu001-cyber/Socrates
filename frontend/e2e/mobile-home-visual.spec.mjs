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
  /* The desktop segmented pill is replaced under 640px by the compact
     "Chat ˅" dropdown, so that is the control to assert on here. */
  const modeTabs = page.locator('#modeSegmentedTop');
  const modeSwitch = page.locator('#mobileModeTrigger');
  const composer = page.locator('#topicInputWrap');
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');

  /* The two hardcoded starter cards were replaced by the shared "Ideas for
     you" list under the composer, which both breakpoints render. */
  await expect(page.locator('.mobile-starter-prompt')).toHaveCount(0);
  await expect(page.locator('.home-idea')).toHaveCount(3);
  await expect(leftButton).toBeVisible();
  await expect(modeTabs).toBeHidden();
  await expect(modeSwitch).toBeVisible();
  await expect(composer).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null;
    };
    return {
      left: rect('#sidebarOpenBtn'),
      right: rect('#mobileIncognitoBtn'),
      modeSwitch: rect('#mobileModeTrigger'),
      composer: rect('#topicInputWrap'),
      ideas: rect('.home-ideas'),
      /* .main is a transparent layout box; the painted surface is
         .main-content (the shell's page colour). */
      background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
    };
  });

  expect(geometry.left?.width).toBe(28);
  expect(geometry.left?.height).toBe(28);
  expect(geometry.right?.width).toBe(28);
  expect(geometry.modeSwitch?.width).toBeGreaterThanOrEqual(64);
  expect(geometry.modeSwitch?.height).toBeGreaterThanOrEqual(28);
  /* The landing composer is the middle band of a centred group, not a bar
     pinned to the bottom, so the assertion is on the group's ordering. */
  expect(geometry.composer?.width).toBeGreaterThanOrEqual(340);
  expect(geometry.composer?.height).toBeLessThanOrEqual(132);
  expect(geometry.ideas?.y).toBeGreaterThan(geometry.composer?.bottom ?? 0);
  expect(geometry.ideas?.bottom).toBeLessThanOrEqual(844);
  expect(geometry.background).toBe('rgb(19, 19, 19)');

  await page.screenshot({ path: 'test-results/mobile-home-reference-collapsed.png', fullPage: true });

  /* The landing composer ships its two-row layout up front — input above,
     run controls below — rather than growing into it on focus the way the
     chat composer does. Focus must therefore keep the geometry stable and
     leave every control reachable, which is what this asserts. */
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
