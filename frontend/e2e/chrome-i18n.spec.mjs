/*
 * chrome-i18n.spec.mjs — static shell chrome localization.
 *
 * The sidebar/display/topbar/composer toolbar tooltips and aria-labels are
 * part of the app shell (index.html), not a React surface. Before this spec
 * they were hard-coded English, so the default zh UI showed English tooltips
 * on hover and to screen readers. They now carry data-i18n-title / -aria /
 * -placeholder hooks resolved by applyI18n().
 *
 * This asserts the resolved *attribute values* after a real setLang switch,
 * i.e. what a user actually hovers / a screen reader announces, rather than
 * only that the hooks exist.
 */
import { test, expect } from '@playwright/test';
import { gotoAndSettle, setLang } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

const attr = (page, sel, name) => page.locator(sel).first().getAttribute(name);

test('static shell chrome localizes to Chinese', async ({ page }) => {
  await setLang(page, 'zh');

  expect(await attr(page, '#sidebarSearchBtn', 'title')).toBe('搜索对话');
  expect(await attr(page, '#sidebarSearchBtn', 'aria-label')).toBe('搜索对话');
  expect(await attr(page, '#themeToggle', 'title')).toBe('切换主题');
  expect(await attr(page, '#displayPrefsBtn', 'title')).toBe('显示设置');
  expect(await attr(page, '#displayPrefsBtn', 'aria-label')).toBe('显示设置');
  expect(await attr(page, '#gridToggle', 'aria-label')).toBe('切换背景网格');
  expect(await attr(page, '#composerToolsBtn', 'title')).toBe('添加工具与文件');
  expect(await attr(page, '#sidebarResizeHandle', 'aria-label')).toBe('拖动调整侧栏宽度');

  // Overlay containers carry the dialog name a screen reader announces.
  expect(await attr(page, '#cmdKOverlay', 'aria-label')).toBe('命令面板');
  expect(await attr(page, '#profileOverlay', 'aria-label')).toBe('账户');
  expect(await attr(page, '#usageOverlay', 'aria-label')).toBe('Token 用量');
  expect(await attr(page, '#shareOverlay', 'aria-label')).toBe('分享对话');

  // Display popover section labels are translated text nodes, not attributes.
  await expect(page.locator('.display-prefs-label span[data-i18n-key="sidebar.textSize"]')).toHaveText('文字大小');
  await expect(page.locator('.display-prefs-label span[data-i18n-key="sidebar.contentWidth"]')).toHaveText('内容宽度');
  await expect(page.locator('.display-prefs-label span[data-i18n-key="chrome.backgroundGrid"]')).toHaveText('背景网格');
});

test('static shell chrome localizes back to English', async ({ page }) => {
  await setLang(page, 'zh');
  await setLang(page, 'en');

  expect(await attr(page, '#sidebarSearchBtn', 'title')).toBe('Search chats');
  expect(await attr(page, '#themeToggle', 'title')).toBe('Toggle theme');
  expect(await attr(page, '#displayPrefsBtn', 'title')).toBe('Display settings');
  expect(await attr(page, '#composerToolsBtn', 'title')).toBe('Add tools and files');
  expect(await attr(page, '#cmdKOverlay', 'aria-label')).toBe('Command palette');
  await expect(page.locator('.display-prefs-label span[data-i18n-key="sidebar.textSize"]')).toHaveText('Text size');
});

test('auth gate default views localize', async ({ page }) => {
  // The gate is hidden in an authed mock; reveal it the same way the auth
  // module does, then assert the first screen a zh user actually sees.
  await page.evaluate(() => {
    window.showGate?.();
    window.showAuthSignin?.();
  });
  await expect(page.locator('#authGate')).toBeVisible();
  await setLang(page, 'zh');

  await expect(page.locator('#authSigninTab')).toHaveText('登录');
  await expect(page.locator('#authRegisterTab')).toHaveText('创建账户');
  await expect(page.locator('label[for="authSigninEmail"]')).toHaveText('邮箱');
  await expect(page.locator('label[for="authSigninPassword"]')).toHaveText('密码');
  await expect(page.locator('#authSigninView .auth-inline-link-right')).toHaveText('忘记密码？');
  await expect(page.locator('#authSigninBtn')).toHaveText('登录');
  await expect(page.locator('.auth-view-separator')).toHaveText('或');
  await expect(page.locator('#authGithubBtn')).toHaveText('使用 GitHub 继续');
  await expect(page.locator('.auth-code-login-link')).toHaveText('使用验证码登录');

  await page.locator('#authRegisterTab').click();
  await expect(page.locator('#authRegisterView .auth-lede')).toHaveText(
    '使用邮箱注册。我们会发送验证链接——无需记验证码。',
  );
  await expect(page.locator('#authRegisterBtn')).toHaveText('发送验证链接');

  // Secondary view: forgot-password (back to sign-in, then the reset entry).
  await page.locator('#authRegisterView .auth-foot a').click();
  await page.locator('#authSigninView .auth-inline-link-right').click();
  await expect(page.locator('#authForgotPasswordView .auth-title')).toHaveText('重置密码');
  await expect(page.locator('#authForgotPasswordView .auth-back-link')).toContainText('返回登录');
  await expect(page.locator('#authForgotBtn')).toHaveText('发送重置链接');
});

test('sidebar toggle copy localizes through the JS-managed path', async ({ page }) => {
  // #sidebarCloseBtn / #sidebarOpenBtn carry a state-dependent ⌘B hint and
  // are written by syncSidebarBtns(), not a static data-i18n hook. Assert the
  // JS path re-localizes on a language switch (socrates:langchange listener).
  await setLang(page, 'zh');
  await expect
    .poll(() => attr(page, '#sidebarCloseBtn', 'title'))
    .toMatch(/关闭侧栏|打开侧栏/);
  expect(await attr(page, '#sidebarCloseBtn', 'title')).not.toMatch(/Close|Open|Collapse|Expand/);

  await setLang(page, 'en');
  await expect
    .poll(() => attr(page, '#sidebarCloseBtn', 'title'))
    .toMatch(/Close sidebar|Open sidebar/);
});
