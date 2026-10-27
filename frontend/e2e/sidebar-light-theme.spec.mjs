import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSIONS = [
  '锂电池压力测量报告',
  '储能技术评测选题',
  '分析二通道直线问题',
  '解题干涉问题',
  '解答薄膜干涉题'
].map((title, i) => ({
  id: `s${i}`,
  title,
  messageCount: 4,
  updatedAt: new Date(Date.now() - i * 3600e3).toISOString(),
  createdAt: new Date().toISOString(),
}));

test('capture light mode sidebar screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-theme', 'light');
    localStorage.setItem('socrates-sb', '1');
  });
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route('**/api/**/sessions**', (r) => (r.request().method() === 'GET'
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions: SESSIONS }) }) : r.fallback()));
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  // Read computed styles of sidebar elements in desktop light mode
  const styles = await page.evaluate(() => {
    const navItem = document.querySelector('#sidebarNav .sidebar-nav-btn');
    const navText = navItem ? navItem.querySelector('span[data-i18n-key]') || navItem.querySelector('span') : null;
    const navSvg = navItem ? navItem.querySelector('svg') : null;
    const recentItem = document.querySelector('.recent-item');
    const recentText = document.querySelector('.recent-item-text');
    const recentOverflow = document.querySelector('.recent-item-overflow');
    const searchInput = document.querySelector('#sidebarSearch');
    const searchWrap = document.querySelector('.sidebar-search');
    const searchSvg = searchWrap ? searchWrap.querySelector('svg') : null;
    const sidebar = document.getElementById('sidebar');

    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      sidebarBg: cs(sidebar)?.backgroundColor,
      navColor: cs(navItem)?.color,
      navTextColor: cs(navText)?.color,
      navSvgColor: cs(navSvg)?.color,
      recentColor: cs(recentItem)?.color,
      recentTextColor: cs(recentText)?.color,
      recentOverflowColor: cs(recentOverflow)?.color,
      searchInputColor: cs(searchInput)?.color,
      searchSvgColor: cs(searchSvg)?.color,
    };
  });
  console.log('DESKTOP LIGHT STYLES:', JSON.stringify(styles, null, 2));

  // Assert desktop light styles
  expect(styles.navTextColor).toBe('rgb(23, 23, 23)');
  expect(styles.recentTextColor).toBe('rgb(23, 23, 23)');

  await page.screenshot({ path: 'test-results/sidebar-desktop-light.png' });

  // Mobile drawer
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#sidebarOpenBtn').click();
  await page.waitForTimeout(300);

  const mobileStyles = await page.evaluate(() => {
    const navItem = document.querySelector('#sidebarNav .sidebar-nav-btn');
    const navText = navItem ? navItem.querySelector('span[data-i18n-key]') || navItem.querySelector('span') : null;
    const recentItem = document.querySelector('.recent-item');
    const recentText = document.querySelector('.recent-item-text');
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      navColor: cs(navItem)?.color,
      navTextColor: cs(navText)?.color,
      recentColor: cs(recentItem)?.color,
      recentTextColor: cs(recentText)?.color,
    };
  });
  console.log('MOBILE LIGHT STYLES:', JSON.stringify(mobileStyles, null, 2));

  // Assert mobile light styles
  expect(mobileStyles.navTextColor).toBe('rgb(23, 23, 23)');
  expect(mobileStyles.recentTextColor).toBe('rgb(23, 23, 23)');

  await page.screenshot({ path: 'test-results/sidebar-mobile-light.png' });
});
