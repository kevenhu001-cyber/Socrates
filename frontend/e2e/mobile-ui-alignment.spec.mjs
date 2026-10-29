import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function boot(page, { width = 390, height = 769, theme = 'light', sessions = [] } = {}) {
  await page.setViewportSize({ width, height });
  await mockAuthedApp(page, { lang: 'zh', user: { displayName: 'Socrates Tester', tier: 'descartes' } });
  await page.addInitScript(value => localStorage.setItem('socrates-theme', value), theme);
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, route => route.fulfill({ json: { sessions } }));
  await page.route(/\/api\/(?:v2\/)?projects(?:\?|$)/, route => route.fulfill({ json: { projects: [
    { id: 'math', name: '数学学习' }, { id: 'writing', name: '写作计划' },
  ] } }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of ['light', 'dark']) {
  test(`phone home and drawer align with the supplied reference (${theme})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await boot(page, { theme, sessions: [
      { id: 'study-1', title: '理解导数与变化率', mode: 'chat', updatedAt: new Date().toISOString() },
      { id: 'study-2', title: '整理本周复习计划', mode: 'chat', updatedAt: new Date().toISOString() },
      { id: 'study-3', title: '练习函数与图像', mode: 'chat', updatedAt: new Date().toISOString() },
    ] });
    const tabs = page.locator('#topModeSwitch');
    await expect(tabs).toBeVisible();
    await expect(tabs).toHaveAttribute('data-slot', 'tabs');
    await expect(tabs.locator('[data-slot="tabs-list"]')).toBeVisible();
    await expect(page.locator('#topModeTutor')).toHaveAttribute('data-slot', 'tabs-trigger');
    const rect = await tabs.boundingBox();
    expect(Math.abs(rect.x + rect.width / 2 - 195)).toBeLessThanOrEqual(1);
    await expect(page.locator('#mobileMode')).toBeHidden();
    await expect(page.locator('#mobileNewChatBtn')).toBeHidden();
    const composer = page.locator('.rich-composer-editor');
    await composer.fill('保留我的学习问题');
    await page.locator('#topModeTutor').click();
    await expect(page.locator('#topModeTutor')).toHaveAttribute('aria-selected', 'true');
    await expect(composer).toContainText('保留我的学习问题');
    await page.locator('#topModeChat').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#topModeTutor')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#topModeChat')).toHaveAttribute('aria-selected', 'true');
    await composer.fill('');
    await page.screenshot({ path: `test-results/ui-alignment-${encodeURIComponent(theme)}-home.png` });
    await page.locator('#topModelSwitcher').click();
    await expect(page.locator('.chat-config-pop')).toBeInViewport();
    await page.keyboard.press('Escape');
    await page.locator('#sidebarOpenBtn').click();
    await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox()).width)).toBe(254);
    await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox()).x)).toBe(0);
    const order = await page.locator('#sidebarNav .sidebar-nav-btn:visible').evaluateAll(nodes => nodes
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(node => node.id));
    expect(order).toEqual(['navNew', 'navLibrary', 'navProjects', 'navScheduled', 'navPlugins', 'navSites', 'navMore']);
    const projects = await page.locator('#navProjects').boundingBox();
    const create = await page.locator('.sidebar-project-create').boundingBox();
    expect(create.x).toBeGreaterThanOrEqual(projects.x + projects.width);
    await expect(page.locator('#navProjects [data-i18n-key]')).toBeVisible();
    await expect(page.locator('#sidebarFooter .sidebar-footer-actions')).toBeHidden();
    await page.screenshot({ path: `test-results/ui-alignment-${encodeURIComponent(theme)}-drawer.png` });
    await page.locator('.sidebar-account-trigger').click();
    await expect(page.locator('.sidebar-account-menu')).toBeInViewport();
    await expect(page.locator('.sidebar-account-menu')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `test-results/ui-alignment-${encodeURIComponent(theme)}-account.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('.sidebar-account-trigger')).toBeFocused();
    await page.locator('#recentsMoreBtn').click();
    await expect(page.locator('.recents-organize-menu')).toBeInViewport();
    await expect(page.locator('.recents-organize-menu')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `test-results/ui-alignment-${encodeURIComponent(theme)}-organize.png` });
    await page.keyboard.press('Escape');
    await expect(page.locator('#recentsMoreBtn')).toBeFocused();
    await page.locator('.sidebar-project-create').click();
    await expect(page.locator('#projectForm')).toBeVisible();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await expect(page.locator('#navProjects button')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('project organization survives reload, respects search and retains the archive entry', async ({ page }) => {
  const now = new Date().toISOString();
  const sessions = [
    { id: 'a', title: '函数与导数', projectId: 'math', mode: 'chat', updatedAt: now },
    { id: 'b', title: '写作提纲', projectId: 'writing', mode: 'chat', updatedAt: now },
    { id: 'c', title: '临时想法', projectId: null, mode: 'chat', updatedAt: now },
  ];
  await boot(page, { sessions });
  await page.locator('#sidebarOpenBtn').click();
  await expect(page.locator('.recent-item')).toHaveCount(3);
  await page.locator('#recentsMoreBtn').click();
  const menu = page.locator('.recents-organize-menu');
  await expect(menu.getByRole('menuitemradio', { name: '按列表' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: '分项目显示' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.recents-project-label')).toHaveText(['数学学习', '写作计划', '其他聊天']);
  await expect(page.locator('#recentsMoreBtn')).toBeFocused();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  if (await page.locator('#sidebar').evaluate(node => node.classList.contains('collapsed'))) {
    await page.locator('#sidebarOpenBtn').click();
  }
  await expect(page.locator('.recents-project-label')).toHaveText(['数学学习', '写作计划', '其他聊天']);
  await page.evaluate(() => window.setLang('en'));
  await expect(page.locator('.recents-project-label')).toHaveText(['数学学习', '写作计划', 'Other chats']);
  await page.locator('#sidebarSearchBtn').click();
  await page.locator('#sidebarSearch').fill('导数');
  await expect(page.locator('.recent-item')).toHaveCount(1);
  await expect(page.locator('.recents-project-label')).toHaveText(['数学学习']);
  await page.locator('#sidebarSearch').fill('');
  await page.locator('#recentsMoreBtn').click();
  const selected = menu.getByRole('menuitemradio').nth(1);
  await expect(selected).toHaveAttribute('aria-checked', 'true');
  await expect(selected).toBeFocused();
  await menu.getByRole('menuitemradio', { name: 'As a list' }).click();
  await expect(page.locator('.recents-project-label')).toHaveCount(0);
  await expect(page.locator('.recent-item')).toHaveCount(3);
  await page.locator('#recentsMoreBtn').click();
  await menu.getByRole('menuitem', { name: 'Archived sessions' }).click();
  await expect(page.locator('#storageModalOverlay')).toBeVisible();
});

test('compact phone menus and enlarged text stay inside the viewport', async ({ page }) => {
  await boot(page, { width: 320, height: 568 });
  await page.locator('#sidebarOpenBtn').click();
  await page.locator('#recentsMoreBtn').click();
  await expect(page.locator('.recents-organize-menu')).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.locator('.sidebar-account-trigger').click();
  await expect(page.locator('.sidebar-account-menu')).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.locator('#sidebarCloseBtn').click();
  await page.evaluate(() => document.documentElement.style.setProperty('--app-font-scale', '1.5'));
  await expect(page.locator('#topModeSwitch')).toBeInViewport();
  const overlap = await page.evaluate(() => {
    const tabs = document.getElementById('topModeSwitch').getBoundingClientRect();
    const model = document.getElementById('topModelSwitcher').getBoundingClientRect();
    return { overlaps: tabs.right > model.left, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  expect(overlap).toEqual({ overlaps: false, overflow: 0 });
});
