import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile conversation home matches the Figma browser layout', async ({ page }) => {
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
  const composer = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');

  await expect(leftButton).toBeVisible();
  await expect(composer).toBeVisible();
  await expect(page.locator('#topicTitle')).toBeHidden();
  await expect(page.locator('#homeQuickActions')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null;
    };
    return {
      topbar: rect('.top-bar'),
      left: rect('#sidebarOpenBtn'),
      leftIcon: rect('#sidebarOpenBtn svg'),
      right: rect('#mobileNewChatBtn'),
      rightIcon: rect('#mobileNewChatBtn svg'),
      title: rect('#mobileModeTrigger'),
      composer: rect('#composerInputWrap'),
      plus: rect('#composerToolsBtn'),
      mic: rect('#composerMicBtn'),
      primary: rect('#composerPrimaryBtn'),
      carousel: rect('#homeQuickActions'),
      firstSuggestion: rect('#homeQuickActions .home-quick-action'),
      topicFontSize: parseFloat(getComputedStyle(document.querySelector('#composerRoot .rich-composer-editor')).fontSize),
      viewportHeight: window.innerHeight,
      background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
      pageToken: getComputedStyle(document.getElementById('appShell')).getPropertyValue('--ui-bg-page').trim(),
    };
  });

  /* Figma paints 24px glyphs in a 44px app bar. Browser controls retain a
     larger accessible hit box, so visual geometry is asserted on the SVG. */
  expect(geometry.topbar?.height).toBe(44);
  expect(geometry.left?.width).toBeGreaterThanOrEqual(40);
  expect(geometry.right?.width).toBe(44);
  expect(geometry.leftIcon?.width).toBe(24);
  expect(geometry.leftIcon?.height).toBe(24);
  expect(geometry.rightIcon?.width).toBe(24);
  expect(geometry.rightIcon?.height).toBe(24);
  expect(geometry.title?.height).toBe(44);

  /* Figma home bottom area: 203×72 suggestion cards, 24px gap to a 44px
     one-line composer. */
  expect(geometry.firstSuggestion?.width).toBe(203);
  expect(geometry.firstSuggestion?.height).toBe(72);
  expect(geometry.carousel?.width).toBeGreaterThanOrEqual(350);
  expect(geometry.composer?.width).toBeGreaterThanOrEqual(350);
  expect(geometry.composer?.height).toBe(44);
  expect(geometry.plus?.width).toBe(44);
  expect(geometry.mic?.width).toBe(24);
  expect(geometry.primary?.width).toBe(32);
  expect(geometry.composer?.bottom).toBeLessThanOrEqual((geometry.viewportHeight ?? 844) - 7);
  expect(geometry.composer?.bottom).toBeGreaterThanOrEqual((geometry.viewportHeight ?? 844) - 10);
  expect(geometry.topicFontSize).toBe(16);
  expect(geometry.composer?.y).toBeGreaterThan(650);
  expect(geometry.background).toBe('rgb(20, 20, 20)');
  expect(geometry.pageToken).toBe('#141414');

  await page.screenshot({ path: 'test-results/mobile-home-reference-collapsed.png', fullPage: true });

  /* Conversation header keeps the 44px track. The functional model switcher
     becomes the Figma-style title cluster; the actions stay accessible while
     their visible glyphs remain 24px. */
  const headerVisual = await page.evaluate(() => {
    document.body.dataset.conversationActive = 'true';
    document.getElementById('findBtn')?.classList.remove('hidden');
    document.getElementById('shareBtn')?.classList.remove('hidden');
    const measure = (selector) => {
      const el = document.querySelector(selector);
      const rect = el?.getBoundingClientRect();
      const style = el ? getComputedStyle(el) : null;
      return rect && style ? {
        x: rect.x,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        borderWidth: style.borderWidth,
        background: style.backgroundColor,
      } : null;
    };
    return {
      sidebar: measure('#sidebarOpenBtn'),
      sidebarIcon: measure('#sidebarOpenBtn svg'),
      modelSwitcher: measure('#topModelSwitcher'),
      newChat: measure('#mobileNewChatBtn'),
      newChatIcon: measure('#mobileNewChatBtn svg'),
      find: measure('#findBtn'),
      share: measure('#shareBtn'),
      sidebarStatus: measure('.mobile-sidebar-status'),
      findIcon: measure('#findBtn svg'),
      shareIcon: measure('#shareBtn svg'),
      shareLabelVisible: Boolean(document.querySelector('#shareBtn .share-btn-label')?.getClientRects().length),
    };
  });
  expect(headerVisual.sidebar?.width).toBeGreaterThanOrEqual(40);
  expect(headerVisual.newChat?.width).toBeGreaterThanOrEqual(40);
  expect(headerVisual.find?.width).toBeGreaterThanOrEqual(40);
  expect(headerVisual.share?.width).toBeGreaterThanOrEqual(40);
  expect(headerVisual.sidebarIcon?.width).toBe(24);
  expect(headerVisual.newChatIcon?.width).toBe(24);
  expect(headerVisual.modelSwitcher?.width).toBeGreaterThan(0);
  expect(headerVisual.modelSwitcher?.right).toBeLessThanOrEqual((headerVisual.newChat?.x ?? 0) + 1);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const switcher = rect('#topModelSwitcher');
      const right = document.querySelector('.top-bar-right').getBoundingClientRect();
      return { switcherRight: switcher.right, actionsLeft: right.left, switcherWidth: switcher.width };
    });
    expect(boxes.switcherWidth).toBeGreaterThan(0);
    expect(boxes.switcherRight).toBeLessThanOrEqual(boxes.actionsLeft + 1);
  }
  expect(headerVisual.find?.borderWidth).toBe('0px');
  expect(headerVisual.share?.borderWidth).toBe('0px');
  expect(headerVisual.sidebarStatus?.width).toBe(0);
  expect(headerVisual.findIcon?.width).toBe(24);
  expect(headerVisual.shareIcon?.width).toBe(24);
  expect(headerVisual.shareLabelVisible).toBe(false);

  /* Compare only the app-owned browser region, never synthesized iOS chrome. */
  await page.evaluate(() => { document.body.dataset.conversationActive = 'false'; });
  await page.setViewportSize({ width: 390, height: 756 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: 'test-results/socrates-mobile-reference-implementation.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);

  await page.evaluate(() => {
    localStorage.setItem('socrates-reasoning-effort', 'high');
    window.syncEffortUI?.();
  });
  await expect(composer.locator('.effort-picker')).toBeVisible();

  /* Focus is geometry-neutral. Actual multiline content promotes the same
     composer node into its feature-complete expanded state. */
  const beforeFocus = (await composer.boundingBox())?.height ?? 0;
  expect(Math.round(beforeFocus)).toBe(44);
  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  const afterFocus = (await composer.boundingBox())?.height ?? 0;
  expect(Math.abs(afterFocus - beforeFocus)).toBeLessThanOrEqual(2);
  await expect(composer.locator('.effort-picker')).toBeVisible();

  await editor.fill('This topic is deliberately long enough to wrap onto a second rendered line in the compact mobile field.');
  await expect.poll(async () => (await composer.boundingBox())?.height ?? 0)
    .toBeGreaterThan(beforeFocus + 24);
  await expect(composer.locator('.effort-picker')).toBeVisible();
  await expect(composer.locator('.mobile-mic-btn')).toHaveCount(1);
  await expect(composer.locator('.mobile-mic-btn')).toBeVisible();
  await expect(composer.locator('.composer-primary-btn')).toBeVisible();
  await expect(composer.locator('.composer-primary-btn')).toHaveAttribute('aria-label', 'Send');

  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action]')).not.toHaveCount(0);
  await expect(menu).toContainText('Camera');
  await expect(menu).toContainText('Photos');
  await expect(menu).toContainText('Upload files');
  await expect(menu).toContainText('Create image');
  await expect(menu).toContainText('Web search');
  await expect(menu.locator('.composer-tools-disclosure')).toHaveCount(0);
  const menuBox = await menu.boundingBox();
  expect(menuBox?.width).toBeLessThanOrEqual(260);
  expect(menuBox?.width).toBeGreaterThanOrEqual(244);

  await page.screenshot({ path: 'test-results/mobile-home-reference-menu.png', fullPage: true });

  await menu.getByRole('menuitem', { name: 'Think deeper' }).click();
  await expect(menu).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.extensiveThinkingOn === true)).toBe(true);

  await page.locator('#composerToolsBtn').click();
  const activeThinking = menu.getByRole('menuitem', { name: 'Think deeper' });
  await expect(activeThinking).toHaveClass(/is-active/);
  await expect(activeThinking.locator('.composer-tools-active-dot')).toBeVisible();
});