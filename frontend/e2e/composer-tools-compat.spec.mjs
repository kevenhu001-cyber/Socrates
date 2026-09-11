// e2e/composer-tools-compat.spec.mjs — Batch 3 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the Composer "+" tools menu is
// owned by React. The legacy entry point (toggleComposerTools) still drives
// open/close/positioning; React renders the capability workflows via the
// typed bridge. Item clicks dispatch through the legacy window.* actions.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Composer tools menu React mode hydrates #composerToolsMenu eagerly', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Eager creation: the menu element exists at boot without a DOM sentinel.
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeAttached();
  await expect(menu).not.toHaveAttribute('data-mounted-by', /.+/);
  await expect(menu).toHaveClass(/hidden/);

  // Bridge installed.
  const installed = await page.evaluate(() => ({
    bridge: typeof window.__socratesComposerToolsBridge === 'object' && window.__socratesComposerToolsBridge !== null,
    isOpen: window.__socratesComposerToolsBridge?.getSnapshot().isOpen,
  }));
  expect(installed).toEqual({ bridge: true, isOpen: false });

  // All workflow items rendered with the expected data-action values.
  /* Scoped to the desktop list: the menu renders both item sets and lets CSS
     pick one per breakpoint, so an unscoped query also returns the mobile
     rows. */
  const actions = await page.locator('#composerToolsMenu .composer-tools-desktop-items [data-composer-action]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-composer-action')),
  );
  expect(actions).toEqual(['upload', 'write', 'explore', 'analyze', 'exam', 'skills']);
  const mobileActions = await page.locator('#composerToolsMenu .composer-tools-mobile-items [data-composer-action]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-composer-action')),
  );
  expect(mobileActions).toEqual([
    'camera', 'photos', 'upload', 'write',
    'explore', 'analyze', 'exam', 'skills', 'extensiveThinking',
  ]);
});

test('Composer tools menu opens via legacy entry point and React mirrors state', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Open via the legacy window.toggleComposerTools(trigger, mode) — the
  // inline-onclick contract in index.html still uses this entry point.
  await page.evaluate(() => {
    const btn = document.getElementById('topicComposerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'topic');
    }
  });

  const menu = page.locator('#composerToolsMenu');
  await expect(menu).not.toHaveClass(/hidden/);

  // Bridge snapshot reflects the open state + topic mode + trigger id.
  const snap = await page.evaluate(() => {
    const s = window.__socratesComposerToolsBridge?.getSnapshot();
    return s ? { isOpen: s.isOpen, mode: s.mode, triggerId: s.triggerId } : null;
  });
  expect(snap).toEqual({ isOpen: true, mode: 'topic', triggerId: 'topicComposerToolsBtn' });
  /* Expanded card: every workflow is visible at once with no disclosure. */
  const desktopItems = menu.locator('.composer-tools-desktop-items > .composer-tools-item');
  await expect(desktopItems).toHaveCount(6);
  await expect(desktopItems.nth(0)).toContainText('Upload files');
  /* Footer filter narrows the expanded list. */
  await menu.locator('.composer-tools-footer-search input').fill('exam');
  await expect(menu.locator('.composer-tools-desktop-items > .composer-tools-item')).toHaveCount(1);
  await expect(menu.locator('.composer-tools-desktop-items > .composer-tools-item').first()).toContainText('Generate exam');
  await menu.locator('.composer-tools-footer-search input').fill('');
  await expect(menu.locator('.composer-tools-desktop-items > .composer-tools-item')).toHaveCount(6);
  await page.screenshot({
    path: 'test-results/visual-qa/composer-workflows-menu.png',
    fullPage: true,
  });

  // Clicking outside closes the menu — the legacy document-level listener
  // still fires and closes via the bridge.
  await page.locator('#sidebar').click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveClass(/hidden/);

  const afterClose = await page.evaluate(() => {
    const s = window.__socratesComposerToolsBridge?.getSnapshot();
    return s?.isOpen ?? null;
  });
  expect(afterClose).toBe(false);
});

test('Composer tools menu items dispatch through legacy window.* actions', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Capture calls to composeAction (write) and toggleExtensionByKey (exam).
  await page.evaluate(() => {
    window.__composerCalls = [];
    window.__socratesLegacy.composer.composeAction = () => window.__composerCalls.push('write');
    window.__socratesLegacy.composer.openAttachmentPicker = () => window.__composerCalls.push('upload');
    window.__socratesLegacy.composer.toggleExtensionByKey = (key) => window.__composerCalls.push(key);
    window.__socratesLegacy.navigation.openPromptTemplatesModal = () => window.__composerCalls.push('skills');
  });

  // Open menu from the chat composer.
  await page.evaluate(() => {
    const btn = document.getElementById('chatComposerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'chat');
    }
  });
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).not.toHaveClass(/hidden/);

  // Click the "write" item (closes the menu via the legacy handler).
  await page.locator('#composerToolsMenu .composer-tools-desktop-items [data-composer-action="write"]').click();
  await expect(menu).toHaveClass(/hidden/);

  // Re-open and click the "exam" item.
  await page.evaluate(() => {
    const btn = document.getElementById('chatComposerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'chat');
    }
  });
  await expect(menu).not.toHaveClass(/hidden/);
  await page.locator('#composerToolsMenu .composer-tools-desktop-items [data-composer-action="exam"]').click();
  await expect(menu).toHaveClass(/hidden/);

  const calls = await page.evaluate(() => window.__composerCalls);
  expect(calls).toContain('write');
  expect(calls).toContain('exam');
});

test('Composer tools menu React mode always loads (no ?react=1 flag needed)', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeAttached();
  await expect(menu).not.toHaveAttribute('data-mounted-by', /.+/);

  const installed = await page.evaluate(
    () => typeof window.__socratesComposerToolsBridge === 'object' && window.__socratesComposerToolsBridge !== null,
  );
  expect(installed).toBe(true);
});

test('mobile plus menu opens without expanding the chat composer', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });

  const wrap = page.locator('#chatInputWrap');
  const plus = page.locator('#chatComposerToolsBtn');
  const before = await wrap.boundingBox();
  expect(before).not.toBeNull();

  await plus.click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).not.toHaveClass(/hidden/);
  const after = await wrap.boundingBox();
  expect(after).not.toBeNull();

  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
  await expect(plus).toBeFocused();
  await expect(wrap).not.toHaveCSS('min-height', '116px');

  const mobileMenuStyle = await menu.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      border: style.borderTopWidth,
      shadow: style.boxShadow,
      radius: style.borderTopLeftRadius,
      bottomRadius: style.borderBottomLeftRadius,
    };
  });
  // Mobile presents the menu as a floating card anchored above the plus
  // key: solid surface, full outline, drop shadow, 16px corners.
  expect(mobileMenuStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(mobileMenuStyle.border).toBe('1px');
  expect(mobileMenuStyle.shadow).not.toBe('none');
  expect(mobileMenuStyle.radius).toBe('16px');
  expect(mobileMenuStyle.bottomRadius).toBe('16px');
  // Wait for the entrance animation to settle before measuring geometry.
  await menu.evaluate((element) => Promise.all(element.getAnimations().map((a) => a.finished)));
  const sheetBox = await menu.boundingBox();
  expect(sheetBox).not.toBeNull();
  // Floating-card geometry at the 390px reference width: inset from the
  // left edge and lifted above the composer instead of a bottom sheet.
  expect(sheetBox.x).toBeGreaterThanOrEqual(6);
  expect(sheetBox.x).toBeLessThanOrEqual(12);
  expect(sheetBox.width).toBeGreaterThanOrEqual(260);
  expect(sheetBox.width).toBeLessThanOrEqual(290);
  expect(sheetBox.y + sheetBox.height).toBeLessThan(820);
  // The open-state class still owns dismissal state, but the card paints
  // no full-screen scrim behind itself.
  await expect(page.locator('body')).toHaveClass(/composer-tools-open/);
  expect(await page.locator('body').evaluate((element) => getComputedStyle(element, '::after').display)).toBe('none');
  await page.screenshot({
    path: 'test-results/visual-qa/composer-workflows-menu-mobile.png',
    fullPage: true,
  });
});

test('desktop workflow selection embeds a themed token in the editable content', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const plus = page.locator('#topicComposerToolsBtn');
  expect(await plus.count()).toBe(1);
  await plus.click();

  const menu = page.locator('#composerToolsMenu');
  const write = menu.locator('.composer-tools-desktop-items [data-composer-action="write"]');
  expect(await write.count()).toBe(1);
  await write.click();

  await expect(menu).toHaveClass(/hidden/);
  const editor = page.locator('#topicComposerRoot .rich-composer-editor');
  const token = editor.locator('.composer-extension-token');
  await expect(token).toBeVisible();
  const tokenBox = await token.boundingBox();
  expect(tokenBox).not.toBeNull();
  expect(tokenBox.height).toBeGreaterThanOrEqual(18);
  await expect(token.locator('.composer-extension-token-icon')).toHaveCSS('color', /rgb/);
  await expect(token.locator('.composer-extension-token-label')).toHaveCSS('color', /rgb/);
  // The workflow token is an inline node inside the editable content.
  expect(await token.evaluate((element) => element.closest('.rich-composer-editor')?.getAttribute('contenteditable'))).toBe('true');
  await expect.poll(() => page.evaluate(() => window.__socratesComposerController?.getMarkdown('topic') ?? null)).toBe('');

  // Dismissing the token clears the workflow itself, not just its styling.
  await token.locator('.composer-extension-token-remove').click();
  await expect(editor.locator('.composer-extension-token')).toHaveCount(0);
  await plus.click();
  await menu.locator('.composer-tools-desktop-items [data-composer-action="write"]').click();

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  const chatEditor = page.locator('#chatComposerRoot .rich-composer-editor');
  const chatToken = chatEditor.locator('.composer-extension-token');
  await expect(chatToken).toBeVisible();
  expect(await chatToken.evaluate((element) => element.closest('.rich-composer-editor')?.getAttribute('contenteditable'))).toBe('true');
  await page.screenshot({
    path: 'test-results/visual-qa/composer-workflow-selected-desktop.png',
    fullPage: true,
  });
});

test('composer plus menu lists only connected plugins', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(v2\/)?project-connectors(\?|$)/, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'oomol-project-connector',
        configured: true,
        connectors: [
          { id: 'github', name: 'GitHub', description: 'Repos.', capabilities: ['Repos'], authType: 'oauth', configured: true, connection: { status: 'connected' } },
          { id: 'notion', name: 'Notion', description: 'Pages.', capabilities: ['Pages'], authType: 'oauth', configured: true, connection: null },
        ],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.locator('#topicComposerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();

  // Connected plugin present; unconfigured plugin absent entirely.
  const github = menu.locator('[data-composer-plugin="github"]');
  await expect(github).toBeVisible();
  await expect(github.locator('.composer-plugin-mark svg')).toHaveCount(1);
  await expect(menu.locator('[data-composer-plugin="notion"]')).toHaveCount(0);

  // The row toggles the plugin selection and shows the check affordance.
  await github.click();
  await expect(github).toHaveClass(/is-selected/);
  await expect(github.locator('.composer-tools-check')).toHaveCount(1);
  await expect(github).toHaveAttribute('aria-pressed', 'true');
});
