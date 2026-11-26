import { test } from './_state-fixture.mjs';
import { expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { rgbChannels } from './_lib.mjs';

const SESSION = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: '分析与学习计划',
  topic: '分析与学习计划',
  mode: 'chat',
  updatedAt: '2026-11-01T12:00:00Z',
};
const FILES = [
  {
    id: 'reference-image',
    name: 'chart-1(2).png',
    kind: 'image',
    size: 1024,
    uploadedAt: '2026-11-01T12:00:00Z',
  },
  {
    id: 'reference-doc',
    name: 'research-synthesis.md',
    kind: 'text',
    size: 2048,
    uploadedAt: '2026-11-01T12:00:00Z',
  },
];

async function openNav(page, id) {
  await page.evaluate((id) => document.getElementById(id)?.click(), id);
}

async function assertNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const mode of ['dark', 'light']) {
  test(`${mode}: reference phone surfaces retain density, hierarchy and usable controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 769 });
    await mockAuthedApp(page, { lang: 'zh' });
    await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), mode);
    await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, (route) =>
      route.fulfill({ json: { sessions: [SESSION] } }),
    );
    await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, (route) =>
      route.fulfill({ json: { files: FILES, hasMore: false } }),
    );
    await page.goto('/');
    await waitForAppShell(page);
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const frame = page.locator('#composerInputWrap [data-composer-frame]');
    await expect(frame).toBeVisible();
    const frameStyle = await frame.evaluate((el) => {
      const css = getComputedStyle(el);
      return { background: css.backgroundColor, radius: css.borderTopLeftRadius };
    });
    /* Sampled field tone and a stable 28px corner on the two-row composer. */
    expect(rgbChannels(frameStyle.background)).toEqual(
      mode === 'dark' ? [33, 33, 33] : [244, 244, 244],
    );
    expect(frameStyle.radius).toBe('28px');
    const composerBox = await page.locator('#composerInputWrap').boundingBox();
    expect(composerBox.x).toBe(16);
    expect(composerBox.width).toBe(358);
    /* The two-row composer remains the same height before and after focus. */
    expect(composerBox.height).toBe(86);
    expect(Math.round(769 - composerBox.y - composerBox.height)).toBe(24);
    /* The landing shortcut rail and the phone suggestion line were removed
       on 2026-11-16; the composer is the last thing on the landing now. */
    await expect(page.locator('#topicTitle')).toBeVisible();
    await expect(page.locator('#homeHero img')).toHaveCount(0);
    const hero = page.locator('#homeHero');
    const fullHeight = (await hero.boundingBox()).height;
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--keyboard-inset', '300px'),
    );
    await expect(page.locator('#topicTitle')).toBeInViewport();
    await expect.poll(async () => (await hero.boundingBox()).height).toBeLessThan(fullHeight);
    const [greetingBox, liftedComposer] = await Promise.all([
      page.locator('#topicTitle').boundingBox(),
      page.locator('#composerInputWrap').boundingBox(),
    ]);
    expect(greetingBox.y + greetingBox.height).toBeLessThan(liftedComposer.y);
    await page.evaluate(() => document.documentElement.style.removeProperty('--keyboard-inset'));
    await assertNoOverflow(page);
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-home.png`,
    });
    const editor = page.locator('#composerRoot .rich-composer-editor');
    await editor.fill('恢复主操作对比');
    await expect
      .poll(async () =>
        rgbChannels(
          await page
            .locator('#composerPrimaryBtn')
            .evaluate((el) => getComputedStyle(el).backgroundColor),
        ),
      )
      .toEqual(mode === 'dark' ? [237, 237, 237] : [13, 13, 13]);
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-color-action.png`,
    });
    await editor.fill('');

    await page.locator('#sidebarOpenBtn').click();
    await expect
      .poll(async () => Math.round((await page.locator('#sidebar').boundingBox()).x))
      .toBe(0);
    expect(Math.round((await page.locator('#sidebar').boundingBox()).width)).toBe(312);
    /* The Android reference uses a separate neutral drawer surface. */
    expect(
      rgbChannels(
        await page.locator('#sidebar').evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    ).toEqual(mode === 'dark' ? [33, 33, 33] : [245, 245, 245]);
    expect(
      await page.locator('#sidebar').evaluate((el) => getComputedStyle(el).boxShadow),
    ).not.toBe('none');
    const searchRow = page.locator('#sidebarSearchRow');
    /* Phones commit the row with display: none so the recents list never
       resizes frame by frame while the drawer opens. */
    await expect(searchRow).toBeHidden();
    await page.locator('#sidebarSearchBtn').click();
    await expect(searchRow).toBeVisible();
    await expect(page.locator('#sidebarSearch')).toBeVisible();
    await page.locator('#sidebarSearchBtn').click();
    await expect(searchRow).toBeHidden();
    const nav = page.locator('#sidebarNav');
    const rows = nav.locator('.sidebar-nav-btn:visible');
    const geometry = await rows.evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.id,
        height: node.getBoundingClientRect().height,
        y: node.getBoundingClientRect().y,
      })),
    );
    for (const row of geometry) expect(row.height).toBe(44);
    const actualOrder = [...geometry].sort((a, b) => a.y - b.y).map((row) => row.id);
    expect(actualOrder.indexOf('navLibrary')).toBeLessThan(actualOrder.indexOf('navScheduled'));
    expect(actualOrder.indexOf('navScheduled')).toBeLessThan(actualOrder.indexOf('navPlugins'));
    expect(actualOrder.filter((id) => id !== 'navSearch').slice(0, 4)).toEqual([
      'navProjects',
      'navLibrary',
      'navScheduled',
      'navPlugins',
    ]);
    expect(actualOrder).not.toContain('navNew');
    expect(actualOrder).toContain('navSearch');
    expect(actualOrder).not.toContain('navImages');
    expect(actualOrder).toEqual(geometry.map(({ id }) => id));
    const recent = page.locator('.recent-item').filter({ hasText: SESSION.title });
    await expect(recent).toBeVisible();
    expect((await recent.boundingBox()).height).toBe(44);
    await expect(recent.locator('.recent-item-glyph')).toBeHidden();
    await expect(page.locator('.sidebar-logo [data-part="brand-name"]')).toBeVisible();
    await expect(page.locator('#sidebarCloseBtn')).toBeVisible();
    const compose = page.locator('.sidebar-mobile-new-chat');
    const account = page.locator('.sidebar-account-trigger');
    await expect(compose).toBeInViewport();
    await expect(account).toBeInViewport();
    expect((await compose.boundingBox()).x).toBeLessThan((await account.boundingBox()).x);
    expect(
      rgbChannels(await compose.evaluate((el) => getComputedStyle(el).backgroundColor)),
    ).toEqual([47, 99, 233]);
    await expect(account.locator('.user-identity')).toBeHidden();
    const searchButton = page.locator('#sidebarSearchBtn');
    const searchBox = await searchButton.boundingBox();
    expect(searchBox.width).toBe(44);
    expect(searchBox.height).toBe(44);
    expect(
      await searchButton.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)),
    ).toBeGreaterThanOrEqual(22);
    await expect(page.locator('.recents-search-all')).toBeInViewport();
    /* The drawer account row uses the same 32px identity mark as the desktop
       rail (parity/sidebar.css), not the 44px touch target. */
    const avatar = await page.locator('#sidebarUserRow .user-avatar').boundingBox();
    expect(avatar.width).toBe(32);
    expect(avatar.height).toBe(32);
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-drawer.png`,
    });
    await recent.locator('.recent-item-overflow').click();
    const menu = page.locator('.recent-item-menu');
    await expect(menu).toBeInViewport();
    expect(await menu.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('20px');
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-session-menu.png`,
    });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await page.locator('.recents-search-all').click();
    await expect(page.locator('#cmdKOverlay')).toBeVisible();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#cmdKOverlay')).toBeHidden();
    await page.locator('#sidebarOpenBtn').click();
    await page.locator('#sidebarUserRow .sidebar-account-trigger').click();
    await page.locator('.sidebar-account-menu').getByRole('menuitem', { name: '设置' }).click();
    const settings = page.locator('#settingsPage');
    await expect(settings).toBeVisible();
    const title = await settings.locator('#settingsTitle').boundingBox();
    expect(title.x + title.width / 2).toBeCloseTo(195, 0);
    await expect(settings.locator('.settings-index-identity')).toContainText('smoke@example.test');
    await expect(settings.locator('.settings-index-group')).toHaveCount(3);
    const appearance = settings.getByRole('group', { name: '颜色模式' });
    await expect(appearance.getByRole('button')).toHaveCount(3);
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-settings.png`,
    });
    const nextMode = mode === 'light' ? 'dark' : 'light';
    const nextTheme = appearance.getByRole('button', {
      name: nextMode === 'light' ? '浅色' : '深色',
    });
    await nextTheme.click();
    await expect(nextTheme).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-mode', nextMode);
    await page.emulateMedia({ colorScheme: mode });
    const systemTheme = appearance.getByRole('button', { name: '跟随系统' });
    await systemTheme.click();
    await expect(systemTheme).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'system');
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    await settings.getByRole('button', { name: '搜索设置' }).click();
    const settingsSearch = settings.getByRole('searchbox');
    await expect(settingsSearch).toBeFocused();
    await settingsSearch.fill('连接');
    await expect(settings.locator('.settings-nav [data-section]:visible')).toHaveCount(1);
    await settings.locator('[data-section=apps]').click();
    await expect(settings.locator('.settings-pane:visible h2')).toHaveText('应用与连接');
    await settings.locator('#settingsMobileBack').click();
    await expect(settingsSearch).toHaveValue('连接');
    await settings.locator('#settingsCloseBtn').click();
    await expect(settings).toBeHidden();

    await openNav(page, 'navPlugins');
    await expect(page.locator('.plugin-directory')).toBeVisible();
    await expect(page.locator('#topModelSwitcher')).toBeHidden();
    expect((await page.locator('.plugin-directory-search').boundingBox()).height).toBeCloseTo(
      44,
      1,
    );
    await expect(page.locator('.plugin-directory-search input')).toHaveCSS('font-size', '16px');
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-plugins.png`,
    });

    await openNav(page, 'navLibrary');
    await expect(page.locator('.library-row')).toHaveCount(FILES.length);
    const selectedView = page.locator('.library-view-btn[aria-pressed="true"]');
    expect(await selectedView.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('999px');
    const primary = page.locator('.library-new-pill');
    await expect(primary).toHaveAttribute('aria-expanded', 'false');
    await primary.click();
    await expect(primary).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.library-new-menu')).toBeInViewport();
    await primary.click();
    await page.mouse.move(385, 5);
    await assertNoOverflow(page);
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-library.png`,
    });

    await page.setViewportSize({ width: 320, height: 568 });
    const search = await page.locator('.library-search-pill').boundingBox();
    expect(search.width).toBeGreaterThanOrEqual(130);
    expect(search.x + search.width).toBeLessThanOrEqual(304);
    await assertNoOverflow(page);
    await page.screenshot({
      path: `test-results/reference-alignment-${encodeURIComponent(mode)}-library-320.png`,
    });
    await page.locator('#sidebarOpenBtn').click();
    await page.getByRole('button', { name: '新建会话', exact: true }).click();
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await expect(page.locator('.library-row').first()).toBeHidden();
    await expect(page.locator('#topicTitle')).toBeVisible();

    // The phone cleanup must not remove desktop entry points.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openNav(page, 'navNew');
    /* The landing entries under the composer were removed on 2026-11-16;
       going back to a new chat now lands on the greeting plus the composer. */
    await expect(page.locator('#topicTitle')).toBeVisible();
    await page.evaluate(() => {
      if (document.getElementById('sidebar')?.classList.contains('collapsed'))
        window.__socratesTestState.actions.toggleSidebar();
    });
    await expect(page.locator('.sidebar-logo [data-part="brand-name"]')).toBeVisible();
    await assertNoOverflow(page);
  });
}
