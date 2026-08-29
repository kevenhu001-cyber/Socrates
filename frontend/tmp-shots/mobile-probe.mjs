/* Scratch probe: mobile top-bar and sidebar geometry, used to replace two
   stale assertions with measured ones. Not part of the app. */
import { chromium } from 'playwright';

const json = (body) => ({
  status: 200, contentType: 'application/json',
  body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' },
});

const b = await chromium.launch({ args: ['--no-sandbox'] });

async function probe(width, height, openSidebar) {
  const ctx = await b.newContext({ viewport: { width, height } });
  await ctx.addCookies([{ name: 'sid', value: 'qa', domain: '127.0.0.1', path: '/' }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('socrates-lang-app', 'en');
      localStorage.setItem('socrates-theme', 'dark');
      localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
    } catch (_) {}
  });
  await page.route('**/api/**', (route) => {
    const u = route.request().url().replace('/api/v2/', '/api/');
    if (u.includes('/api/auth/me')) return route.fulfill(json({ user: { id: 'u1', email: 'jiacheng@example.test', displayName: 'Jiacheng', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true } }));
    if (u.includes('/api/config')) return route.fulfill(json({ hasBeagleKey: true }));
    if (u.includes('/api/sessions')) return route.fulfill(json({ sessions: [] }));
    return route.fulfill(json({ ok: true, stub: true }));
  });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForFunction(() => ['app', 'auth'].includes(document.documentElement.dataset.bootState), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  if (openSidebar) {
    await page.evaluate(() => {
      const s = document.getElementById('sidebar');
      if (s && s.classList.contains('collapsed')) window.toggleSidebar?.();
    });
    await page.waitForTimeout(450);
  }
  const out = await page.evaluate(() => {
    const info = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { sel, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top), bottom: Math.round(r.bottom), display: cs.display, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' };
    };
    return {
      vw: innerWidth, vh: innerHeight,
      sidebarCollapsed: document.getElementById('sidebar')?.classList.contains('collapsed'),
      mainBg: getComputedStyle(document.querySelector('.main')).backgroundColor,
      nodes: ['#sidebarOpenBtn', '#mobileIncognitoBtn', '#modeSegmentedTop', '#mobileMode', '#mobileModeTrigger', '#topicInputWrap', '#recentsFilterChips', '#recentsFilterChips .recents-filter-chip-btn'].map(info),
    };
  });
  console.log(JSON.stringify({ width, height, openSidebar, ...out }, null, 1));
  await ctx.close();
}

await probe(390, 844, false);
await probe(420, 860, true);
await b.close();
