import { test } from './_state-fixture.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile drawer search focuses immediately and Escape restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const drawer = page.locator('#sidebar');
  const opener = page.locator('#sidebarOpenBtn');
  const searchButton = page.locator('#sidebarSearchBtn');
  const search = page.locator('#sidebarSearch');

  await expect(drawer).toHaveAttribute('inert', '');
  await opener.press('Enter');
  await expect(page.locator('#sidebarCloseBtn')).toBeFocused();
  await expect(drawer).not.toHaveAttribute('inert', '');

  const focusDuringClick = await searchButton.evaluate((button) => {
    button.click();
    return document.activeElement?.id;
  });
  expect(focusDuringClick).toBe('sidebarSearch');
  await search.fill('calculus');
  await search.press('Escape');
  await expect(search).toBeHidden();
  const searchRowHeight = await drawer
    .locator('.sidebar-search-row')
    .evaluate((row) => row.getBoundingClientRect().height);
  expect(searchRowHeight).toBe(0);
  await expect(searchButton).toBeFocused();
  await searchButton.press('Escape');
  await expect(drawer).toHaveAttribute('inert', '');
  await expect(opener).toBeFocused();

  await opener.click();
  const backdrop = page.locator('#sidebarBackdrop');
  await expect(backdrop).toHaveClass(/show/);
  await backdrop.click({ position: { x: 375, y: 400 } });
  await expect(drawer).toHaveAttribute('inert', '');
  await expect(opener).toBeFocused();
});

test('mobile conversation home matches the compact dark reference layout', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed'))
      window.__socratesTestState.actions.toggleSidebar?.();
  });
  await page.waitForTimeout(350);

  const leftButton = page.locator('#sidebarOpenBtn');
  const landingNewChat = page.locator('#mobileNewChatBtn');
  const composer = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');

  /* The landing surface intentionally has no hardcoded prompt suggestions. */
  await expect(page.locator('.mobile-starter-prompt')).toHaveCount(0);
  await expect(page.locator('.home-ideas, .chat-suggestions, #topicQuickActions')).toHaveCount(0);
  await expect(leftButton).toBeVisible();
  await expect(landingNewChat).toBeHidden();
  await expect(composer).toBeVisible();

  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box
        ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom }
        : null;
    };
    return {
      left: rect('#sidebarOpenBtn'),
      composer: rect('#composerInputWrap'),
      topicFontSize: parseFloat(
        getComputedStyle(document.querySelector('#composerRoot .rich-composer-editor')).fontSize,
      ),
      viewportHeight: window.innerHeight,
      /* .main is a transparent layout box; the painted surface is
         .main-content (the shell's canonical page colour). */
      background: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
      pageToken: getComputedStyle(document.getElementById('appShell'))
        .getPropertyValue('--ui-bg-page')
        .trim(),
    };
  });

  expect(geometry.left?.width).toBe(44);
  expect(geometry.left?.height).toBe(44);
  expect(geometry.composer?.width).toBeGreaterThanOrEqual(320);
  /* The current phone target is a stable two-row frame, including idle. */
  expect(geometry.composer?.height).toBe(92);
  expect(geometry.composer?.bottom).toBeLessThanOrEqual((geometry.viewportHeight ?? 844) - 16);
  /* The empty-state capsule pins to the bottom action band: its foot rests
     on the safe-area inset above the viewport bottom, not in the old
     centred band. */
  expect(geometry.composer?.bottom).toBeGreaterThanOrEqual((geometry.viewportHeight ?? 844) - 24);
  expect(geometry.topicFontSize).toBeGreaterThanOrEqual(16);
  expect(geometry.topicFontSize).toBeLessThanOrEqual(18);
  expect(geometry.composer?.y).toBeGreaterThan(550);
  /* The mobile canvas shares the pure-black reference page token with desktop. */
  expect(geometry.background).toBe('rgb(0, 0, 0)');
  expect(geometry.pageToken).toBe('#000');

  /* Center the greeting in the live space above the bottom composer. */
  const centering = await page.evaluate(() => {
    const greet = document.querySelector('#topicTitle');
    const box = greet.getBoundingClientRect();
    const hero = document.getElementById('homeHero').getBoundingClientRect();
    return {
      x: box.x,
      width: box.width,
      centerY: box.top + box.height / 2,
      heroCenterY: hero.top + hero.height / 2,
      viewportWidth: window.innerWidth,
      textAlign: getComputedStyle(greet).textAlign,
      mark: getComputedStyle(greet, '::before').backgroundImage,
    };
  });
  expect(centering.textAlign).toBe('center');
  expect(centering.mark).toBe('none');
  /* ±1px slack covers browser sub-pixel rendering and any safe-area
     asymmetry on the top-bar that does not propagate into the
     greeting's parent flex column. */
  expect(
    Math.abs(centering.x + centering.width / 2 - centering.viewportWidth / 2),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(centering.centerY - centering.heroCenterY)).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: 'test-results/mobile-home-reference-collapsed.png',
    fullPage: true,
  });

  /* The active-chat header uses the reference's one tactile navigation
     control plus two unframed utilities. Expose the session-only controls
     without invoking a networked share action so this remains visual QA. */
  await page.evaluate(() => {
    document.body.dataset.conversationActive = 'true';
    window.__testShowConversationActions(true);
  });
  /* 顶栏由 store 驱动，React 异步提交后查找/分享按钮才出现；等它们渲染完成再测量。 */
  await expect
    .poll(() =>
      page.evaluate(() =>
        [
          document.querySelector('#findBtn')?.getBoundingClientRect().width ?? 0,
          document.querySelector('#shareBtn')?.getBoundingClientRect().width ?? 0,
        ].every((width) => width > 0),
      ),
    )
    .toBe(true);
  const headerVisual = await page.evaluate(() => {
    const measure = (selector) => {
      const el = document.querySelector(selector);
      const rect = el?.getBoundingClientRect();
      const style = el ? getComputedStyle(el) : null;
      return rect && style
        ? {
            x: rect.x,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            borderStyle: style.borderStyle,
            borderWidth: style.borderWidth,
            background: style.backgroundColor,
          }
        : null;
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
      shareLabelVisible: Boolean(
        document.querySelector('#shareBtn .share-btn-label')?.getClientRects().length,
      ),
    };
  });
  /* This block deliberately flips body[data-conversation-active="true"]
     above, so the mobile header is in its in-conversation form. That state
     has two documented sizes ("Landing top-bar buttons are 44px tactile
     chips; the in-conversation header keeps its existing 40px unframed
     utilities"), and this expectation was still asserting the landing size
     for #sidebarOpenBtn, so it failed at 40. #findBtn / #shareBtn are 44 in
     both states. */
  expect(headerVisual.sidebar?.width).toBe(40);
  expect(headerVisual.find?.width).toBe(44);
  expect(headerVisual.share?.width).toBe(44);
  /* In-conversation the phone header has no room for the model chip: the
     centred mode switch (152px) plus new-chat, find and share (128px) already
     fill a 390px bar, and the chip used to paint under the switch. Model
     configuration stays one tap away in the composer's effort pill, which
     opens the same popover. */
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const switcher = rect('#topModelSwitcher');
      const newChat = rect('#mobileNewChatBtn');
      return {
        switcherRight: switcher.right,
        newChatLeft: newChat.left,
        switcherWidth: switcher.width,
      };
    });
    expect(boxes.switcherWidth).toBe(0);
  }
  expect(headerVisual.find?.borderWidth).toBe('0px');
  expect(headerVisual.share?.borderWidth).toBe('0px');
  /* The reference header shows no always-on status dot next to the
     sidebar toggle, so it stays display:none on mobile. */
  expect(headerVisual.sidebarStatus?.width).toBe(0);
  expect(headerVisual.findIcon?.width).toBe(20);
  expect(headerVisual.shareIcon?.width).toBe(20);
  expect(headerVisual.shareLabelVisible).toBe(false);

  /* The supplied visual's app-owned region normalizes to roughly 390×756
     after removing browser chrome. Capture that exact comparison viewport
     outside the repo for the design-QA pass. */
  await page.evaluate(() => {
    document.body.dataset.conversationActive = 'false';
  });
  await page.setViewportSize({ width: 390, height: 756 });
  await page.waitForTimeout(180);
  await page.screenshot({
    path: 'test-results/socrates-mobile-reference-implementation.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);

  /* Set a non-default effort to exercise reactive preference updates. */
  await page.evaluate(() => {
    localStorage.setItem('socrates-reasoning-effort', 'high');
    window.dispatchEvent(
      new CustomEvent('socrates:chat-preferences', {
        detail: { effort: 'high', speed: 'standard' },
      }),
    );
  });
  await expect(composer.locator('[data-composer-control=effort]')).toBeVisible();

  /* Focus leaves both rows in place. */
  const beforeFocus = (await composer.boundingBox())?.height ?? 0;
  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  const afterFocus = (await composer.boundingBox())?.height ?? 0;
  expect(Math.abs(afterFocus - beforeFocus)).toBeLessThanOrEqual(1);
  /* The pill stays visible inside the idle capsule, like the reference. */
  await expect(composer.locator('[data-composer-control=effort]')).toBeVisible();

  await editor.fill(
    'This topic is deliberately long enough to wrap onto a second rendered line in the compact mobile field.',
  );
  await expect
    .poll(async () => (await composer.boundingBox())?.height ?? 0)
    .toBeGreaterThan(beforeFocus + 12);
  await expect(composer.locator('[data-composer-control=effort]')).toBeVisible();
  /* The landing composer mirrors the reference controls row: a dedicated
     dictation mic sits beside the voice/send primary. */
  await expect(composer.locator('#composerMicBtn')).toHaveCount(1);
  await expect(composer.locator('#composerMicBtn')).toBeVisible();
  await expect(composer.locator('[data-composer-control=send]')).toBeVisible();
  await expect(composer.locator('[data-composer-control=send]')).toHaveAttribute(
    'aria-label',
    'Send',
  );

  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  /* Grouped mobile actions retain the common capture, file, create, and
     search workflows. */
  await expect(menu.locator('.composer-tools-mobile-items [data-composer-action]')).not.toHaveCount(
    0,
  );
  await expect(menu).toContainText('Camera');
  await expect(menu).toContainText('Photos');
  await expect(menu).toContainText('Local files');
  await expect(menu).toContainText('Create image');
  await expect(menu).toContainText('Web search');
  await expect(menu.locator('.composer-tools-disclosure')).toHaveCount(0);
  /* The phone add-content menu is a full-width bottom sheet. */
  const viewport = page.viewportSize();
  await expect(menu).toHaveAttribute('data-menu-side', 'sheet');
  await expect
    .poll(async () => {
      const box = await menu.boundingBox();
      return box && [Math.round(box.width), Math.round(box.x), Math.round(box.y + box.height)];
    })
    .toEqual([viewport.width, 0, viewport.height]);
  const menuBox = await menu.boundingBox();
  expect(menuBox?.y ?? -1).toBeGreaterThanOrEqual(0);

  await page.screenshot({ path: 'test-results/mobile-home-reference-menu.png', fullPage: true });

  /* "Think deeper" is a toggle, so the tools menu gives it the checkable
     menu item role (aria-checked) rather than the plain one. */
  await menu.getByRole('menuitemcheckbox', { name: 'Think deeper' }).click();
  await expect(menu).toBeHidden();

  await page.locator('#composerToolsBtn').click();
  const activeThinking = menu.getByRole('menuitemcheckbox', { name: 'Think deeper' });
  await expect(activeThinking).toHaveClass(/is-active/);
  await expect(activeThinking.locator('.composer-tools-active-check')).toBeVisible();
});
