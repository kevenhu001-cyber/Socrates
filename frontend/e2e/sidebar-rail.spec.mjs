// e2e/sidebar-rail.spec.mjs — desktop sidebar geometry and palette.
// The geometry is chatgpt.com parity (docs/ref/chatgpt-parity.md): 36px rows,
// single-line history, a 52px icon rail when collapsed. The palette is the
// light ladder: a quiet #f6f6f6 rail one rung below the #fafafa canvas.
import { test, expect } from '@playwright/test';
import { gotoAndSettle, setLang } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSIONS = ['贝叶斯定理', '导数的几何意义', '光合作用'].map((title, i) => ({
  id: `s${i}`,
  title,
  messageCount: 4,
  updatedAt: new Date(Date.now() - i * 3600e3).toISOString(),
  createdAt: new Date().toISOString(),
}));

async function boot(page, mode = 'dark') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((m) => {
    localStorage.setItem('socrates-theme', m);
    localStorage.setItem('socrates-sb', '1');
  }, mode);
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route('**/api/**/sessions**', (r) =>
    r.request().method() === 'GET'
      ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions: SESSIONS }) })
      : r.fallback(),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await expect(page.locator('#recentsList .recent-item')).toHaveCount(SESSIONS.length);
}

test('open sidebar uses quiet 36px rows, compact chrome and one-line history', async ({ page }) => {
  await boot(page, 'light');
  /* The RN header mounts lazily after the shell; measure it once it exists. */
  await expect(page.locator('#sidebarHeader .sidebar-logo')).toBeAttached();
  const rows = await page.evaluate(() => {
    const box = (n) => n.getBoundingClientRect();
    const nav = document.querySelector('#navLibrary');
    const item = document.querySelector('#recentsList .recent-item');
    const sidebar = getComputedStyle(document.getElementById('sidebar'));
    const header = document.getElementById('sidebarHeader');
    const logo = header.querySelector('.sidebar-logo');
    const badge = item.querySelector('.recent-mode-badge');
    const footer = document.getElementById('sidebarFooter');
    const avatar = document.querySelector('#sidebarUserRow .user-avatar');
    return {
      navH: Math.round(box(nav).height),
      iconW: box(nav.querySelector('svg')).width,
      iconH: box(nav.querySelector('svg')).height,
      iconCenterOffset: Math.abs(
        box(nav.querySelector('svg')).y +
          box(nav.querySelector('svg')).height / 2 -
          (box(nav).y + box(nav).height / 2),
      ),
      navRadius: getComputedStyle(nav).borderTopLeftRadius,
      itemH: Math.round(box(item).height),
      metaVisible: getComputedStyle(item.querySelector('.recent-item-meta')).display !== 'none',
      modeBadgeVisible: Boolean(badge && getComputedStyle(badge).display !== 'none'),
      sidebarBg: sidebar.backgroundColor,
      sidebarBorder: `${sidebar.borderRightWidth} ${sidebar.borderRightColor}`,
      headerH: Math.round(box(header).height),
      logoFontSize: getComputedStyle(logo).fontSize,
      footerBorderTop: getComputedStyle(footer).borderTopWidth,
      avatarSize: avatar ? Math.round(box(avatar).width) : 0,
    };
  });
  expect(rows.navH).toBe(36);
  expect(rows.navRadius).toBe('8px');
  expect(rows.iconW).toBe(20);
  expect(rows.iconH).toBe(20);
  expect(rows.iconCenterOffset).toBeLessThanOrEqual(1);
  expect(rows.itemH).toBe(36);
  expect(rows.metaVisible).toBe(false);
  expect(rows.modeBadgeVisible).toBe(false);
  /* Card-on-canvas shell: the rail is transparent and separation comes from
     the main card's inset, not a hairline. */
  expect(rows.sidebarBg).toBe('rgba(0, 0, 0, 0)');
  expect(rows.sidebarBorder.split(' ')[0]).toBe('0px');
  expect(rows.headerH).toBe(52);
  expect(rows.logoFontSize).toBe('20px');
  expect(rows.footerBorderTop).toBe('0px');
  expect(rows.avatarSize).toBe(28);

  const projects = page.locator('#navProjects');
  const resting = await projects.evaluate((el) => getComputedStyle(el).backgroundColor);
  await projects.hover();
  await expect
    .poll(() => projects.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(resting);
  await expect(page.locator('#navMore svg')).toHaveAttribute('fill', 'currentColor');
  await expect(page.locator('#navMore svg')).toHaveAttribute('stroke', 'none');
  await page.screenshot({ path: 'test-results/sidebar-desktop-web-parity-light.png' });
});

test('collapsing keeps a 52px icon rail with named buttons and reopens from it', async ({
  page,
}) => {
  await boot(page);
  await page.locator('#sidebarCloseBtn').click();
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.round(document.getElementById('sidebar').getBoundingClientRect().width),
      ),
    )
    .toBe(52);

  const rail = await page.evaluate(() => ({
    left: Math.round(document.getElementById('sidebar').getBoundingClientRect().left),
    mainPad: Math.round(
      parseFloat(getComputedStyle(document.querySelector('#appShell .main')).paddingLeft),
    ),
    openerHidden: getComputedStyle(document.getElementById('sidebarOpenBtn')).display === 'none',
    recentsHidden: getComputedStyle(document.getElementById('recentsPanel')).display === 'none',
    nav: [...document.querySelectorAll('#sidebarNav .sidebar-nav-btn')]
      .filter((n) => n.getClientRects().length)
      .map((n) => {
        const r = n.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) };
      }),
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
  await expect(page.getByRole('button', { name: /文件/ })).toBeVisible();

  // Each visible nav button exposes its label via `aria-label`, and the
  // CSS rail-tooltip reads that same attribute (`content: attr(aria-label)`).
  // Assert the rendered tooltip, not just the accessible name: the two
  // drifted apart once already (nav rows stopped emitting `title`, so the
  // tooltip rendered as an empty bubble while aria-label stayed correct).
  const railIds = await page
    .locator('#sidebarNav .sidebar-nav-btn')
    .evaluateAll((buttons) =>
      buttons.filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.id),
    );
  expect(railIds.length).toBeGreaterThan(0);
  for (const id of railIds) {
    const button = page.locator(`#${id}`);
    await expect(button).toHaveAttribute('aria-label', /\S+/);
    const label = await button.getAttribute('aria-label');
    await button.hover();
    const tooltip = await button.evaluate((el) => getComputedStyle(el, '::after').content);
    expect(tooltip).toBe(JSON.stringify(label));
  }

  const toggle = page.locator('#sidebarCloseBtn');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.round(document.getElementById('sidebar').getBoundingClientRect().width),
      ),
    )
    .toBe(260);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('lazy session list mounts and time groups follow English and Chinese', async ({ page }) => {
  const today = new Date();
  const sessions = [
    {
      id: 'locale-today',
      title: 'Today session',
      updatedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(),
      createdAt: today.toISOString(),
    },
    {
      id: 'locale-yesterday',
      title: 'Yesterday session',
      updatedAt: new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - 1,
        12,
      ).toISOString(),
      createdAt: today.toISOString(),
    },
  ];
  await mockAuthedApp(page, { lang: 'en' });
  await page.route('**/api/**/sessions**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions }) })
      : route.fallback(),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const headings = page.locator('#recentsList .recents-time-label');
  await expect(headings).toHaveText(['Today', 'Yesterday']);
  await expect(page.locator('#recentsList .recent-item')).toHaveCount(2);

  await setLang(page, 'zh');
  await expect(headings).toHaveText(['今天', '昨天']);
  await setLang(page, 'en');
  await expect(headings).toHaveText(['Today', 'Yesterday']);
});
