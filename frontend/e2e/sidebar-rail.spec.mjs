// e2e/sidebar-rail.spec.mjs — desktop sidebar geometry and palette.
// The geometry is chatgpt.com parity (docs/ref/chatgpt-parity.md): 36px rows,
// single-line history, a 52px icon rail when collapsed. The palette is the
// light ladder: a quiet #f6f6f6 rail one rung below the #fafafa canvas.
import { test, expect } from '@playwright/test';
import { gotoAndSettle, setLang } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSIONS = ['贝叶斯定理', '导数的几何意义', '光合作用'].map((title, i) => ({
  id: `s${i}`, title, messageCount: 4,
  updatedAt: new Date(Date.now() - i * 3600e3).toISOString(), createdAt: new Date().toISOString(),
}));

/* 24 rows across four buckets: enough to scroll the panel past the first
   heading, so the sticky test observes a pinned header rather than a
   computed style on a list that cannot move. */
const LONG_SESSIONS = Array.from({ length: 24 }, (_, i) => {
  const days = i < 6 ? 0 : i < 12 ? 1 : i < 18 ? 3 : 20;
  const at = new Date(Date.now() - days * 86400e3 - i * 60e3).toISOString();
  return { id: `long-${i}`, title: `历史会话 ${i + 1}`, messageCount: 2, updatedAt: at, createdAt: at };
});

async function boot(page, mode = 'dark', sessions = SESSIONS) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((m) => { localStorage.setItem('socrates-theme', m); localStorage.setItem('socrates-sb', '1'); }, mode);
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route('**/api/**/sessions**', (r) => (r.request().method() === 'GET'
    ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions }) }) : r.fallback()));
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await expect(page.locator('#recentsList .recent-item')).toHaveCount(sessions.length);
}

test('open sidebar uses a 40px New chat CTA, quiet 36px rows and one-line history', async ({ page }) => {
  await boot(page, 'light');
  /* The RN header mounts lazily after the shell; measure it once it exists. */
  await expect(page.locator('#sidebarHeader .sidebar-logo')).toBeAttached();
  const rows = await page.evaluate(() => {
    const box = (n) => n.getBoundingClientRect();
    const nav = document.querySelector('#navLibrary');
    const newChat = document.getElementById('navNew');
    const newChatStyle = getComputedStyle(newChat);
    const item = document.querySelector('#recentsList .recent-item');
    const sidebar = getComputedStyle(document.getElementById('sidebar'));
    const header = document.getElementById('sidebarHeader');
    const logo = header.querySelector('.sidebar-logo');
    const badge = item.querySelector('.recent-mode-badge');
    const footer = document.getElementById('sidebarFooter');
    const avatar = document.querySelector('#sidebarUserRow .user-avatar');
    return {
      navH: Math.round(box(nav).height),
      navRadius: getComputedStyle(nav).borderTopLeftRadius,
      newChatH: Math.round(box(newChat).height),
      newChatRadius: newChatStyle.borderTopLeftRadius,
      newChatJustify: newChatStyle.justifyContent,
      newChatMarginBottom: newChatStyle.marginBottom,
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
  /* RN-7 侧栏：导航行用 uiRadius.md（12px），这是新设计规定的行圆角。 */
  expect(rows.navRadius).toBe('12px');
  /* The CTA is one ladder step above the rows, centered like the reference. */
  expect(rows.newChatH).toBe(40);
  expect(rows.newChatRadius).toBe('999px');
  expect(rows.newChatJustify).toBe('center');
  expect(rows.newChatMarginBottom).toBe('8px');
  expect(rows.itemH).toBe(36);
  expect(rows.metaVisible).toBe(false);
  expect(rows.modeBadgeVisible).toBe(false);
  /* RN-7：侧栏本身透明，灰色由外层画布承担（白色画布卡片浮在灰底上）。 */
  expect(rows.sidebarBg).toBe('rgba(0, 0, 0, 0)');
  /* RN-7：侧栏不画右边框，分界由白色画布卡片的发丝外框给出。 */
  expect(rows.sidebarBorder.split(' ')[0]).toBe('0px');
  expect(rows.headerH).toBe(52);
  expect(rows.logoFontSize).toBe('18px');
  expect(rows.footerBorderTop).toBe('0px');
  expect(rows.avatarSize).toBe(28);

  /* 导航行悬停用 RN-7 的 fill token（4% ink），与顶栏、提问框控件的悬停一致。 */
  await page.locator('#navProjects').hover();
  await expect(page.locator('#navProjects')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.04)');
});

test('date group headings stay pinned while the history scrolls', async ({ page }) => {
  await boot(page, 'light', LONG_SESSIONS);
  await page.setViewportSize({ width: 1440, height: 640 });
  await page.waitForTimeout(200);
  await page.locator('#recentsPanel').evaluate((el) => { el.scrollTop = 300; });
  await page.waitForTimeout(250);
  const sticky = await page.evaluate(() => {
    const panel = document.getElementById('recentsPanel');
    const top = panel.getBoundingClientRect().top;
    const labels = Array.from(panel.querySelectorAll('.recents-time-label'))
      .filter((el) => el.getBoundingClientRect().height > 0);
    const pinned = labels.find((el) => Math.abs(el.getBoundingClientRect().top - top) <= 1);
    return {
      labels: labels.length,
      pinned: pinned ? (pinned.textContent || '').trim() : null,
      position: pinned ? getComputedStyle(pinned).position : null,
    };
  });
  expect(sticky.labels).toBeGreaterThan(2);
  expect(sticky.position).toBe('sticky');
  expect(sticky.pinned).toBeTruthy();
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
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-label', /\S+/);
  }

  const toggle = page.locator('#sidebarCloseBtn');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('sidebar').getBoundingClientRect().width))).toBe(260);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('lazy session list mounts and time groups follow English and Chinese', async ({ page }) => {
  const today = new Date();
  const sessions = [
    { id: 'locale-today', title: 'Today session', updatedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).toISOString(), createdAt: today.toISOString() },
    { id: 'locale-yesterday', title: 'Yesterday session', updatedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12).toISOString(), createdAt: today.toISOString() },
  ];
  await mockAuthedApp(page, { lang: 'en' });
  await page.route('**/api/**/sessions**', (route) => (route.request().method() === 'GET'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions }) })
    : route.fallback()));
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
