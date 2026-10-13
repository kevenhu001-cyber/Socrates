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
  const composer = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');

  /* The landing surface intentionally has no hardcoded prompt suggestions. */
  await expect(page.locator('.mobile-starter-prompt')).toHaveCount(0);
  await expect(page.locator('.home-ideas, .chat-suggestions, #topicQuickActions')).toHaveCount(0);
  await expect(leftButton).toBeVisible();
  await expect(composer).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null;
    };
    return {
      left: rect('#sidebarOpenBtn'),
      right: rect('#mobileNewChatBtn'),
      composer: rect('#composerInputWrap'),
      topicFontSize: parseFloat(getComputedStyle(document.querySelector('#composerRoot .rich-composer-editor')).fontSize),
      viewportHeight: window.innerHeight,
      /* .main is a transparent layout box; the painted surface is
         .main-content (the shell's page colour). Dark mode uses a layered
         charcoal canvas so the shell has depth without pure black. */
      background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
      pageToken: getComputedStyle(document.getElementById('appShell')).getPropertyValue('--ui-bg-page').trim(),
    };
  });

  expect(geometry.left?.width).toBe(44);
  expect(geometry.left?.height).toBe(44);
  /* The new-chat action is a landing top-bar button, so it takes the same
     44px tactile chip as the hamburger (restore/chat-surface.css). */
  expect(geometry.right?.width).toBe(44);
  expect(geometry.composer?.width).toBeGreaterThanOrEqual(320);
  /* Empty-home mobile composer uses the current compact one-row 52px rail:
     add/editor/dictation/send share one line, and only multiline drafts,
     selected tools/plugins, or attachments expand the capsule. */
  expect(geometry.composer?.height).toBe(52);
  expect(geometry.composer?.bottom).toBeLessThanOrEqual((geometry.viewportHeight ?? 844) - 16);
  /* The empty-state capsule pins to the bottom action band: its foot rests
     on the safe-area inset above the viewport bottom, not in the old
     centred band. */
  expect(geometry.composer?.bottom).toBeGreaterThanOrEqual((geometry.viewportHeight ?? 844) - 24);
  expect(geometry.topicFontSize).toBeGreaterThanOrEqual(16);
  expect(geometry.topicFontSize).toBeLessThanOrEqual(18);
  expect(geometry.composer?.y).toBeGreaterThan(550);
  /* The mobile canvas shares the charcoal page token with the desktop shell. */
  expect(geometry.background).toBe('rgb(20, 20, 20)');
  expect(geometry.pageToken).toBe('#141414');

  /* P_greeting-mobile-center — the landing greeting must be visually
     centred horizontally on the viewport and sit just above the optical
     middle on phones. The previous absolute + dual left/right inset could
     land sub-pixel off when the parent's 16px padding and the viewport
     settled (URL-bar collapse, soft keyboard); the absolute box anchored
     at 40.5% of the surface always lands the line on the reference hero
     position regardless of those shifts. */
  const centering = await page.evaluate(() => {
    const greet = document.querySelector('#topicTitle.greeting');
    const box = greet?.getBoundingClientRect();
    const surface = document.getElementById('topicSetup')?.getBoundingClientRect();
    const style = greet ? getComputedStyle(greet) : null;
    return {
      x: box?.x,
      width: box?.width,
      centerY: box ? box.top + box.height / 2 : undefined,
      surfaceTop: surface?.top,
      surfaceHeight: surface?.height,
      viewportWidth: window.innerWidth,
      position: style?.position,
      textAlign: style?.textAlign,
    };
  });
  expect(centering.position, 'greeting is positioned against the live landing surface').toBe('absolute');
  expect(centering.textAlign).toBe('center');
  /* ±1px slack covers browser sub-pixel rendering and any safe-area
     asymmetry on the top-bar that does not propagate into the
     greeting's parent flex column. */
  expect(Math.abs(centering.x + centering.width / 2 - centering.viewportWidth / 2))
    .toBeLessThanOrEqual(1);
  const expectedCenterY = (centering.surfaceTop ?? 0) + (centering.surfaceHeight ?? 0) * 0.405;
  expect(Math.abs(centering.centerY - expectedCenterY))
    .toBeLessThanOrEqual(1);

  await page.screenshot({ path: 'test-results/mobile-home-reference-collapsed.png', fullPage: true });

  /* Active conversation chrome mirrors the supplied Android reference:
     one raised navigation circle on the left and one raised compose+overflow
     capsule on the right. Find/share stay functional behind the overflow. */
  const headerVisual = await page.evaluate(() => {
    window.toggleChatTopBarEls?.(true);
    document.body.dataset.conversationActive = 'true';
    const measure = (selector) => {
      const el = document.querySelector(selector);
      const rect = el?.getBoundingClientRect();
      const style = el ? getComputedStyle(el) : null;
      return rect && style ? {
        x: rect.x,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        display: style.display,
        borderWidth: style.borderWidth,
        background: style.backgroundColor,
      } : null;
    };
    return {
      sidebar: measure('#sidebarOpenBtn'),
      modelSwitcher: measure('#topModelSwitcher'),
      capsule: measure('.top-bar-right'),
      newChat: measure('#mobileNewChatBtn'),
      more: measure('#mobileConversationMoreBtn'),
      find: measure('#findBtn'),
      share: measure('#shareBtn'),
      sidebarStatus: measure('.mobile-sidebar-status'),
    };
  });
  expect(headerVisual.sidebar?.width).toBe(40);
  expect(headerVisual.newChat?.width).toBe(40);
  expect(headerVisual.more?.width).toBe(40);
  expect(headerVisual.capsule?.height).toBe(48);
  expect(headerVisual.capsule?.width).toBeGreaterThanOrEqual(88);
  expect(headerVisual.modelSwitcher?.width).toBe(0);
  expect(headerVisual.find?.display).toBe('none');
  expect(headerVisual.share?.display).toBe('none');
  /* The reference header shows no always-on status dot next to the
     sidebar toggle, so it stays display:none on mobile. */
  expect(headerVisual.sidebarStatus?.width).toBe(0);

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.evaluate(() => {
      const capsule = document.querySelector('.top-bar-right')?.getBoundingClientRect();
      const more = document.querySelector('#mobileConversationMoreBtn')?.getBoundingClientRect();
      return { capsuleRight: capsule?.right ?? 0, capsuleWidth: capsule?.width ?? 0, moreWidth: more?.width ?? 0 };
    });
    expect(boxes.moreWidth).toBe(40);
    expect(boxes.capsuleWidth).toBeGreaterThanOrEqual(88);
    expect(boxes.capsuleRight).toBeLessThanOrEqual(width - 14);
  }

  const more = page.locator('#mobileConversationMoreBtn');
  await more.click();
  const actionMenu = page.locator('#mobileConversationMoreMenu');
  await expect(actionMenu).toBeVisible();
  await expect(actionMenu.getByRole('menuitem', { name: /Find in conversation/i })).toBeVisible();
  await expect(actionMenu.getByRole('menuitem', { name: /Share/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(actionMenu).toBeHidden();

  /* The supplied visual's app-owned region normalizes to roughly 390×756
     after removing browser chrome. Capture that exact comparison viewport
     outside the repo for the design-QA pass. */
  await page.evaluate(() => {
    window.toggleChatTopBarEls?.(false);
    document.body.dataset.conversationActive = 'false';
  });
  await page.setViewportSize({ width: 390, height: 756 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: 'test-results/socrates-mobile-reference-implementation.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);

  /* The phone rail hides the effort chip only for the default level, so
     pick a non-default one here — otherwise there is no chip to track
     through focus and multiline growth, which is what this block checks.
     Set before the height baseline so any layout effect is absorbed. */
  await page.evaluate(() => {
    localStorage.setItem('socrates-reasoning-effort', 'high');
    window.syncEffortUI?.();
  });
  await expect(composer.locator('.effort-picker')).toBeVisible();

  /* Focus is geometry-neutral; the second row appears only after the draft
     actually renders on more than one line. */
  const beforeFocus = (await composer.boundingBox())?.height ?? 0;
  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  const afterFocus = (await composer.boundingBox())?.height ?? 0;
  expect(Math.abs(afterFocus - beforeFocus)).toBeLessThanOrEqual(2);
  /* The pill stays visible inside the idle capsule, like the reference. */
  await expect(composer.locator('.effort-picker')).toBeVisible();

  await editor.fill('This topic is deliberately long enough to wrap onto a second rendered line in the compact mobile field.');
  await expect.poll(async () => (await composer.boundingBox())?.height ?? 0)
    .toBeGreaterThan(beforeFocus + 36);
  await expect(composer.locator('.effort-picker')).toBeVisible();
  /* The landing composer mirrors the reference controls row: a dedicated
     dictation mic sits beside the voice/send primary. */
  await expect(composer.locator('.mobile-mic-btn')).toHaveCount(1);
  await expect(composer.locator('.mobile-mic-btn')).toBeVisible();
  await expect(composer.locator('.composer-primary-btn')).toBeVisible();
  await expect(composer.locator('.composer-primary-btn')).toHaveAttribute('aria-label', 'Send');

  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  /* Grouped mobile actions retain the common capture, file, create, and
     search workflows. */
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action]')).not.toHaveCount(0);
  await expect(menu).toContainText('Camera');
  await expect(menu).toContainText('Photos');
  await expect(menu).toContainText('Upload files');
  await expect(menu).toContainText('Create image');
  await expect(menu).toContainText('Web search');
  await expect(menu.locator('.composer-tools-disclosure')).toHaveCount(0);
  const menuBox = await menu.boundingBox();
  /* On phones the add-content menu is a floating card anchored above the
     composer, matching the mobile reference (~65% of the phone width). */
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
