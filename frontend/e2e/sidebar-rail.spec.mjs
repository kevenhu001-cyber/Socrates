// e2e/sidebar-rail.spec.mjs — desktop sidebar parity with chatgpt.com
// (docs/ref/chatgpt-parity.md): 36px rows with a solid hover wash,
// single-line history, and a 52px icon rail when collapsed.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSIONS = ['贝叶斯定理', '导数的几何意义', '光合作用'].map((title, i) => ({
  id: `s${i}`, title, messageCount: 4,
  updatedAt: new Date(Date.now() - i * 3600e3).toISOString(), createdAt: new Date().toISOString(),
}));

async function boot(page, mode = 'dark') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((m) => { localStorage.setItem('socrates-theme', m); localStorage.setItem('socrates-sb', '1'); }, mode);
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route('**/api/**/sessions**', (r) => (r.request().method() === 'GET'
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions: SESSIONS }) }) : r.fallback()));
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await expect(page.locator('#recentsList .recent-item')).toHaveCount(SESSIONS.length);
}

test('open sidebar uses 36px rows, solid hover and one-line history', async ({ page }) => {
  await boot(page, 'light');
  const rows = await page.evaluate(() => {
    const box = (n) => n.getBoundingClientRect();
    const nav = document.querySelector('#navLibrary');
    const item = document.querySelector('#recentsList .recent-item');
    const sidebar = getComputedStyle(document.getElementById('sidebar'));
    return {
      navH: Math.round(box(nav).height),
      navRadius: getComputedStyle(nav).borderTopLeftRadius,
      itemH: Math.round(box(item).height),
      metaVisible: getComputedStyle(item.querySelector('.recent-item-meta')).display !== 'none',
      sidebarBg: sidebar.backgroundColor,
      sidebarBorder: `${sidebar.borderRightWidth} ${sidebar.borderRightColor}`,
    };
  });
  expect(rows.navH).toBe(36);
  expect(rows.navRadius).toBe('12px');
  expect(rows.itemH).toBe(36);
  expect(rows.metaVisible).toBe(false);
  expect(rows.sidebarBg).toBe('rgb(252, 252, 252)');
  expect(rows.sidebarBorder).toBe('1px rgba(0, 0, 0, 0.1)');

  await page.locator('#navProjects').hover();
  await expect(page.locator('#navProjects')).toHaveCSS('background-color', 'rgb(243, 243, 243)');
});

test('collapsing keeps a 52px icon rail with named buttons and reopens from it', async ({ page }) => {
  await boot(page);
  await page.locator('#sidebarCloseBtn').click();
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('sidebar').getBoundingClientRect().width))).toBe(52);

  const rail = await page.evaluate(() => ({
    left: Math.round(document.getElementById('sidebar').getBoundingClientRect().left),
    mainPad: Math.round(parseFloat(getComputedStyle(document.querySelector('#appShell .main')).paddingLeft)),
    openerHidden: getComputedStyle(document.getElementById('sidebarOpenBtn')).display === 'none',
    recentsHidden: getComputedStyle(document.getElementById('recentsPanel')).display === 'none',
    nav: [...document.querySelectorAll('#sidebarNav .sidebar-nav-btn')]
      .filter((n) => n.getClientRects().length)
      .map((n) => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) }; }),
  }));
  expect(rail.left).toBe(0);
  expect(rail.mainPad).toBe(52);
  expect(rail.openerHidden).toBe(true);
  expect(rail.recentsHidden).toBe(true);
  expect(rail.nav.length).toBeGreaterThan(4);
  for (const n of rail.nav) {
    expect(n).toMatchObject({ w: 36, h: 36 });
    expect(n.x).toBe(8);
  }
  // Labels are visually hidden, not removed: icons keep accessible names.
  await expect(page.getByRole('button', { name: /资料库/ })).toBeVisible();

  // Each visible nav button exposes its label via `title` so the CSS
  // rail-tooltip (`::after` with `content: attr(title)`) has text to show
  // and screen readers announce a useful name on hover/focus.
  const railIds = await page.locator('#sidebarNav .sidebar-nav-btn').evaluateAll((buttons) =>
    buttons.filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id),
  );
  expect(railIds.length).toBeGreaterThan(0);
  for (const id of railIds) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('title', /\S+/);
  }

  const toggle = page.locator('#sidebarCloseBtn');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('sidebar').getBoundingClientRect().width))).toBe(260);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});
