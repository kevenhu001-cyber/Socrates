// e2e/composer-tools-compat.spec.mjs — Batch 3 of the React + TypeScript migration
// Spec: when the app boots with ?react=1, the Composer "+" tools menu is
// owned by React. The legacy entry point (toggleComposerTools) still drives
// open/close/positioning; React renders the capability workflows via a shared
// module store. Item clicks dispatch through the shared extension module.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('Composer tools menu React mode hydrates #composerToolsMenu eagerly', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  expect(await page.evaluate(() => '__socratesExtensionDispatch' in window)).toBe(false);

  // Eager creation: the menu element exists at boot without a DOM sentinel.
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeAttached();
  await expect(menu).not.toHaveAttribute('data-mounted-by', /.+/);
  await expect(menu).toHaveClass(/hidden/);

  // All workflow items rendered with the expected data-action values.
  /* Scoped to the desktop list: the menu renders both item sets and lets CSS
     pick one per breakpoint, so an unscoped query also returns the mobile
     rows. */
  const actions = await page.locator('#composerToolsMenu .composer-tools-desktop-items [data-composer-action]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-composer-action')),
  );
  expect(actions).toEqual(['upload', 'webSearch', 'explore', 'deepResearch', 'write', 'analyze', 'createImage', 'createSite', 'exam', 'skills']);
  const mobileActions = await page.locator('#composerToolsMenu .composer-tools-mobile-items [data-composer-action]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-composer-action')),
  );
  /* The phone sheet mirrors the reference's flat ordering: media/context
     first (camera, photos, upload, createImage), then search, then the
     remaining workflows. */
  expect(mobileActions).toEqual([
    'camera', 'photos', 'upload', 'createImage', 'webSearch', 'explore', 'deepResearch',
    'write', 'analyze', 'createSite', 'exam', 'skills', 'extensiveThinking',
  ]);
});

test('Composer tools menu highlights the active template ahead of mode flags', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window._activeTemplate = { extensionKey: 'write' };
    window.deepResearchOn = true;
  });
  await page.locator('#composerToolsBtn').click();

  const menu = page.locator('#composerToolsMenu .composer-tools-desktop-items');
  await expect(menu.locator('[data-composer-action="write"]')).toHaveClass(/is-active/);
  await expect(menu.locator('[data-composer-action="deepResearch"]')).not.toHaveClass(/is-active/);
});

test('Composer tools menu opens via legacy entry point and React mirrors state', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Open via the legacy window.toggleComposerTools(trigger, mode) — the
  // inline-onclick contract in index.html still uses this entry point.
  await page.evaluate(() => {
    const btn = document.getElementById('composerToolsBtn');
    if (btn && typeof window.toggleComposerTools === 'function') {
      window.toggleComposerTools(btn, 'topic');
    }
  });

  const menu = page.locator('#composerToolsMenu');
  await expect(menu).not.toHaveClass(/hidden/);

  // The legacy owner records mode and trigger state on the actual control.
  const trigger = page.locator('#composerToolsBtn');
  await expect(trigger).toHaveAttribute('data-composer-mode', 'topic');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  /* Expanded card: every workflow is visible at once with no disclosure. */
  const desktopItems = menu.locator('.composer-tools-desktop-items [data-composer-action]');
  await expect(desktopItems).toHaveCount(10);
  await expect(desktopItems.nth(0)).toContainText('Upload files');
  /* The menu carries no filter field, so the whole list is always shown and
     nothing can be narrowed away. */
  await expect(menu.locator('.composer-tools-footer-search')).toHaveCount(0);
  await expect(desktopItems.filter({ hasText: 'Generate exam' })).toHaveCount(1);
  await expect(menu.locator('.composer-tools-desktop-items .composer-tools-group-label').first())
    .toContainText(/Add context|添加资料/);
  await page.screenshot({
    path: 'test-results/visual-qa/composer-workflows-menu.png',
    fullPage: true,
  });

  // Clicking outside closes the menu and resets its active trigger.
  await page.locator('#sidebar').click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveClass(/hidden/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
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
    const btn = document.getElementById('composerToolsBtn');
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
    const btn = document.getElementById('composerToolsBtn');
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

  await expect(menu.locator('.composer-tools-desktop-items [data-composer-action]')).toHaveCount(10);
});

test('mobile plus menu opens without expanding the chat composer', async ({ page }) => {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.__testActivateMainView('chatView');
  });

  const wrap = page.locator('#composerInputWrap');
  const plus = page.locator('#composerToolsBtn');
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
  // Phones present the menu as a bottom sheet: full width, pinned to the
  // viewport edge, rounded on the top corners. (The bottom corners sit below
  // the viewport edge, so only the top radius is visible.)
  expect(mobileMenuStyle.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(mobileMenuStyle.border).toBe('1px');
  expect(mobileMenuStyle.shadow).not.toBe('none');
  expect(mobileMenuStyle.radius).toBe('20px');
  // Wait for the entrance animation to settle before measuring geometry.
  await menu.evaluate((element) => Promise.all(element.getAnimations().map((a) => a.finished)));
  const sheetBox = await menu.boundingBox();
  expect(sheetBox).not.toBeNull();
  // Sheet geometry at the 390px reference width: flush with both edges and
  // the bottom of the viewport, tall enough to show most of the list.
  expect(sheetBox.x).toBeGreaterThanOrEqual(-1);
  expect(sheetBox.x).toBeLessThanOrEqual(1);
  expect(sheetBox.width).toBeGreaterThanOrEqual(389);
  expect(sheetBox.width).toBeLessThanOrEqual(390);
  expect(Math.abs(sheetBox.y + sheetBox.height - 844)).toBeLessThanOrEqual(1);
  expect(sheetBox.height).toBeLessThanOrEqual(844 * 0.78 + 1);
  // The open-state class still owns dismissal state, and the sheet dims the
  // page behind itself so the tap-outside target is visible.
  await expect(page.locator('body')).toHaveClass(/composer-tools-open/);
  expect(await page.locator('body').evaluate((element) => getComputedStyle(element, '::after').display)).toBe('block');
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

  const plus = page.locator('#composerToolsBtn');
  expect(await plus.count()).toBe(1);
  await plus.click();

  const menu = page.locator('#composerToolsMenu');
  const write = menu.locator('.composer-tools-desktop-items [data-composer-action="write"]');
  expect(await write.count()).toBe(1);
  await write.click();

  await expect(menu).toHaveClass(/hidden/);
  const editor = page.locator('#composerRoot .rich-composer-editor');
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
    window.__testActivateMainView('chatView');
  });
  const chatEditor = page.locator('#composerRoot .rich-composer-editor');
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

  await page.locator('#composerToolsBtn').click();
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
  await expect(github).toHaveAttribute('role', 'menuitemcheckbox');
  await expect(github).toHaveAttribute('aria-checked', 'true');
  const remove = page.locator('.composer-plugin-chip-remove');
  await expect(remove).toHaveAttribute('aria-label', 'Remove GitHub');
  await page.evaluate(() => window.setLang('zh'));
  await expect(github).toHaveAttribute('aria-label', 'GitHub：已添加');
  await expect(remove).toHaveAttribute('aria-label', '移除 GitHub');
  await page.evaluate(() => window.setLang('en'));
  await expect(remove).toHaveAttribute('aria-label', 'Remove GitHub');
});

test('composer plugin catalog exposes a retry after a failed request', async ({ page }) => {
  await mockAuthedApp(page);
  let requestCount = 0;
  await page.route(/\/api\/(?:v2\/)?project-connectors(?:\?|$)/, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        connectors: [
          { id: 'github', name: 'GitHub', description: 'Repository context.', capabilities: ['Repositories'], authType: 'oauth', configured: true, connection: { status: 'connected' } },
        ],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.locator('#composerToolsBtn').click();

  const menu = page.locator('#composerToolsMenu');
  await expect(menu.locator('.composer-tools-plugin-state')).toContainText(/could not be loaded|加载失败/);
  await menu.getByRole('menuitem', { name: /Try again|重试/ }).click();
  await expect(menu.locator('[data-composer-plugin="github"]')).toBeVisible();
  expect(requestCount).toBe(2);
});

test('a pending plugin retry survives closing and reopening the tools menu', async ({ page }) => {
  await mockAuthedApp(page);
  let requestCount = 0;
  let releaseRetry;
  const retryGate = new Promise((resolve) => { releaseRetry = resolve; });
  await page.route(/\/api\/(?:v2\/)?project-connectors(?:\?|$)/, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({ status: 503, json: { error: 'offline' } });
      return;
    }
    await retryGate;
    await route.fulfill({ json: {
      configured: true,
      connectors: [{ id: 'github', name: 'GitHub', connection: { status: 'connected' } }],
    } });
  });
  try {
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    const trigger = page.locator('#composerToolsBtn');
    const menu = page.locator('#composerToolsMenu');
    await trigger.click();
    await menu.getByRole('menuitem', { name: /Try again|重试/ }).click();
    await expect.poll(() => requestCount).toBe(2);
    await trigger.click();
    await expect(menu).toBeHidden();
    await trigger.click();
    await expect(menu.locator('.composer-tools-plugin-state')).toContainText(/Loading connected apps|正在加载/);
    releaseRetry();
    await expect(menu.locator('[data-composer-plugin="github"]')).toBeVisible();
    expect(requestCount).toBe(2);
  } finally {
    releaseRetry();
  }
});
