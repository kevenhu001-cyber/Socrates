import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { rgbChannels } from './_lib.mjs';

const SESSION = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: '分析与学习计划', topic: '分析与学习计划', mode: 'chat', updatedAt: '2026-11-01T12:00:00Z' };
const FILES = [
  { id: 'reference-image', name: 'chart-1(2).png', kind: 'image', size: 1024, uploadedAt: '2026-11-01T12:00:00Z' },
  { id: 'reference-doc', name: 'research-synthesis.md', kind: 'text', size: 2048, uploadedAt: '2026-11-01T12:00:00Z' },
];

async function openNav(page, id) {
  await page.evaluate(id => document.getElementById(id)?.click(), id);
}

async function assertNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const mode of ['dark', 'light']) {
  test(`${mode}: reference phone surfaces retain density, hierarchy and usable controls`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 769 });
    await mockAuthedApp(page, { lang: 'zh' });
    await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, route => route.fulfill({ json: { sessions: [SESSION] } }));
    await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, route => route.fulfill({ json: { files: FILES, hasMore: false } }));
    await page.goto('/');
    await waitForAppShell(page);
    await page.evaluate(async mode => {
      document.documentElement.dataset.mode = mode;
      await document.fonts.ready;
    }, mode);

    const frame = page.locator('#composerInputWrap [data-composer-frame]');
    await expect(frame).toBeVisible();
    const frameStyle = await frame.evaluate(el => {
      const css = getComputedStyle(el);
      return { background: css.backgroundColor, radius: css.borderTopLeftRadius };
    });
    /* Dark: the reference question box is the #1b1b1b field tone between
       the pure-black canvas and the panel rung; menus keep #292929. Light:
       the white paper on the #fcfcfc canvas. Corner: 26px (circle fit). */
    expect(rgbChannels(frameStyle.background)).toEqual(mode === 'dark' ? [27, 27, 27] : [255, 255, 255]);
    expect(frameStyle.radius).toBe('26px');
    const composerBox = await page.locator('#composerInputWrap').boundingBox();
    expect(composerBox.x).toBe(16);
    expect(composerBox.width).toBe(358);
    expect(composerBox.height).toBe(86);
    expect(Math.round(769 - composerBox.y - composerBox.height)).toBe(24);
    /* The desktop shortcut rail stays off the phone; the reference shows a
       single suggestion line above the composer instead (emoji + one
       muted, truncated line). */
    await expect(page.locator('.home-quick-actions')).toBeHidden();
    const suggestion = page.locator('#homeSuggestion [data-testid="home-suggestion"]');
    await expect(suggestion).toHaveCount(1);
    await expect(suggestion).toBeVisible();
    const suggestionBox = await suggestion.boundingBox();
    expect(suggestionBox.y + suggestionBox.height).toBeLessThanOrEqual(composerBox.y);
    expect(await suggestion.locator('.home-suggestion-text').evaluate(el => {
      const css = getComputedStyle(el);
      return { whiteSpace: css.whiteSpace, overflow: css.textOverflow, clipped: el.scrollWidth > el.clientWidth };
    })).toEqual({ whiteSpace: 'nowrap', overflow: 'ellipsis', clipped: true });
    await expect(page.locator('#topicTitle')).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-home.png` });
    const editor = page.locator('#composerRoot .rich-composer-editor');
    await editor.fill('恢复彩色主操作');
    await expect.poll(async () => rgbChannels(await page.locator('#composerPrimaryBtn').evaluate(el => getComputedStyle(el).backgroundColor)))
      .toEqual([61, 102, 192]);
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-color-action.png` });
    await editor.fill('');

    await page.locator('#sidebarOpenBtn').click();
    await expect.poll(async () => Math.round((await page.locator('#sidebar').boundingBox()).x)).toBe(0);
    expect(rgbChannels(await page.locator('#sidebar').evaluate(el => getComputedStyle(el).backgroundColor)))
      .toEqual(mode === 'dark' ? [0, 0, 0] : [252, 252, 252]);
    const searchRow = page.locator('#sidebarSearchRow');
    expect((await searchRow.boundingBox()).height).toBe(0);
    await page.locator('#sidebarSearchBtn').click();
    await expect(page.locator('#sidebarSearch')).toBeVisible();
    await page.locator('#sidebarSearchBtn').click();
    await expect.poll(async () => (await searchRow.boundingBox()).height).toBe(0);
    const nav = page.locator('#sidebarNav');
    const rows = nav.locator('.sidebar-nav-btn:visible');
    const geometry = await rows.evaluateAll(nodes => nodes.map(node => ({
      id: node.id, height: node.getBoundingClientRect().height, y: node.getBoundingClientRect().y,
    })));
    /* Reference drawer: 36px rows at 14px. */
    for (const row of geometry) expect(row.height).toBe(36);
    const actualOrder = [...geometry].sort((a, b) => a.y - b.y).map(row => row.id);
    expect(actualOrder.indexOf('navLibrary')).toBeLessThan(actualOrder.indexOf('navScheduled'));
    expect(actualOrder.indexOf('navScheduled')).toBeLessThan(actualOrder.indexOf('navPlugins'));
    expect(actualOrder.indexOf('navPlugins')).toBeLessThan(actualOrder.indexOf('navProjects'));
    if (actualOrder.includes('navImages')) expect(actualOrder.indexOf('navImages')).toBeLessThan(actualOrder.indexOf('navLibrary'));
    const recent = page.locator('.recent-item').filter({ hasText: SESSION.title });
    await expect(recent).toBeVisible();
    expect((await recent.boundingBox()).height).toBe(36);
    /* Reference drawer lockup: wordmark + ⌄ on the left, search and the
       sidebar glyph (not ×) on the right. */
    await expect(page.locator('.sidebar-logo [data-part="brand-name"]')).toBeVisible();
    await expect(page.locator('.sidebar-logo [data-part="brand-caret"]')).toBeVisible();
    await expect(page.locator('#sidebarCloseBtn')).toBeVisible();
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-drawer.png` });
    await recent.locator('.recent-item-overflow').click();
    const menu = page.locator('.recent-item-menu');
    await expect(menu).toBeInViewport();
    expect(await menu.evaluate(el => getComputedStyle(el).borderRadius)).toBe('20px');
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-session-menu.png` });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await openNav(page, 'navPlugins');
    await expect(page.locator('.plugin-directory')).toBeVisible();
    await expect(page.locator('#topModelSwitcher')).toBeHidden();
    expect((await page.locator('.plugin-directory-search').boundingBox()).height).toBeCloseTo(36, 1);
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-plugins.png` });

    await openNav(page, 'navLibrary');
    await expect(page.locator('.library-row')).toHaveCount(FILES.length);
    const selectedView = page.locator('.library-view-btn[aria-pressed="true"]');
    expect(await selectedView.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');
    const primary = page.locator('.library-new-pill');
    await expect(primary).toHaveAttribute('aria-expanded', 'false');
    await primary.click();
    await expect(primary).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.library-new-menu')).toBeInViewport();
    await primary.click();
    await page.mouse.move(385, 5);
    await assertNoOverflow(page);
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-library.png` });

    await page.setViewportSize({ width: 320, height: 568 });
    const search = await page.locator('.library-search-pill').boundingBox();
    expect(search.width).toBeGreaterThanOrEqual(130);
    expect(search.x + search.width).toBeLessThanOrEqual(304);
    await assertNoOverflow(page);
    await page.screenshot({ path: `test-results/reference-alignment-${encodeURIComponent(mode)}-library-320.png` });

    // The phone cleanup must not remove desktop entry points.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openNav(page, 'navNew');
    await expect(page.locator('.home-quick-actions')).toBeVisible();
    await expect(page.locator('#homeSuggestion')).toBeHidden();
    await page.evaluate(() => {
      if (document.getElementById('sidebar')?.classList.contains('collapsed')) window.__socratesLegacy.navigation.toggleSidebar();
    });
    await expect(page.locator('.sidebar-logo [data-part="brand-name"]')).toBeVisible();
    await assertNoOverflow(page);
  });
}
