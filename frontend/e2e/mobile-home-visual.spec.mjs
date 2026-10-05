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
  /* Empty-home mobile composer uses the reference's two-row 85px stack
     (editor on row 1, add/dictation/send controls on row 2). The height
     follows the owner's padding/row-gap/editor metrics — see
     docs/ref/mobile-reference-2026-10-04.md and the arithmetic in
     e2e/mobile-composer-reference.spec.mjs. */
  expect(geometry.composer?.height).toBe(85);
  expect(geometry.composer?.bottom).toBeLessThanOrEqual((geometry.viewportHeight ?? 844) - 16);
  /* The empty-state capsule pins to the bottom action band: its foot rests
     on the safe-area inset above the viewport bottom, not in the old
     centred band. */
  expect(geometry.composer?.bottom).toBeGreaterThanOrEqual((geometry.viewportHeight ?? 844) - 24);
  expect(geometry.topicFontSize).toBeGreaterThanOrEqual(16);
  expect(geometry.topicFontSize).toBeLessThanOrEqual(18);
  expect(geometry.composer?.y).toBeGreaterThan(550);
  /* The dark mobile canvas is the reference's true black — --ui-bg-page is
     #000 and the mobile layer pins .main-content to it. */
  expect(geometry.background).toBe('rgb(0, 0, 0)');
  expect(geometry.pageToken).toBe('#000000');

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

  /* The active-chat header uses the reference's one tactile navigation
     control plus two unframed utilities. Expose the session-only controls
     without invoking a networked share action so this remains visual QA. */
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
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        background: style.backgroundColor,
      } : null;
    };
    return {
      sidebar: measure('#sidebarOpenBtn'),
      modelSwitcher: measure('#topModelSwitcher'),
      newChat: measure('#mobileNewChatBtn'),
      find: measure('#findBtn'),
      share: measure('#shareBtn'),
      sidebarStatus: measure('.mobile-sidebar-status'),
      findIcon: measure('#findBtn svg'),
      shareIcon: measure('#shareBtn svg'),
      shareLabelVisible: Boolean(document.querySelector('#shareBtn .share-btn-label')?.getClientRects().length),
    };
  });
  /* This block deliberately flips body[data-conversation-active="true"]
     above, so the mobile header is in its in-conversation form. That state
     has two documented sizes (restore/chat-surface.css: "Landing top-bar
     buttons are 44px tactile chips; the in-conversation header keeps its
     existing 40px unframed utilities"), and this expectation was still
     asserting the landing size for #sidebarOpenBtn, so it failed at 40.
     #findBtn / #shareBtn are 44 in both states (fixes.css pins them on
     phone regardless of surface). */
  expect(headerVisual.sidebar?.width).toBe(40);
  expect(headerVisual.find?.width).toBe(44);
  expect(headerVisual.share?.width).toBe(44);
  expect(headerVisual.modelSwitcher?.width).toBeGreaterThan(0);
  expect(headerVisual.modelSwitcher?.right).toBeLessThanOrEqual(headerVisual.newChat?.x ?? 0);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const switcher = rect('#topModelSwitcher');
      const newChat = rect('#mobileNewChatBtn');
      return { switcherRight: switcher.right, newChatLeft: newChat.left, switcherWidth: switcher.width };
    });
    expect(boxes.switcherWidth).toBeGreaterThan(0);
    expect(boxes.switcherRight).toBeLessThanOrEqual(boxes.newChatLeft);
  }
  expect(headerVisual.find?.borderWidth).toBe('0px');
  expect(headerVisual.share?.borderWidth).toBe('0px');
  /* The reference header shows no always-on status dot next to the
     sidebar toggle, so it stays display:none on mobile. */
  expect(headerVisual.sidebarStatus?.width).toBe(0);
  expect(headerVisual.findIcon?.width).toBe(24);
  expect(headerVisual.shareIcon?.width).toBe(24);
  expect(headerVisual.shareLabelVisible).toBe(false);

  /* The supplied visual's app-owned region normalizes to roughly 390×756
     after removing browser chrome. Capture that exact comparison viewport
     outside the repo for the design-QA pass. */
  await page.evaluate(() => { document.body.dataset.conversationActive = 'false'; });
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
