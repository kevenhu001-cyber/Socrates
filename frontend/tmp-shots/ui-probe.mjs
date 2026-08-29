/* Scratch measurement probe: prints computed geometry + type scale for the
   landing shell so the Cowork-reference pass can be driven by numbers
   instead of eyeballing. Not part of the app. */
import { chromium } from 'playwright';

const URL = process.env.QA_URL || 'http://localhost:5173/';
const json = (body, status = 200) => ({
  status, contentType: 'application/json',
  body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' },
});

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 601 } });
await ctx.addCookies([
  { name: 'csrf', value: 'qa', domain: 'localhost', path: '/' },
  { name: 'xsrf-token', value: 'qa', domain: 'localhost', path: '/' },
  { name: 'sid', value: 'qa-sid', domain: 'localhost', path: '/' },
]);
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.addInitScript(() => {
  try {
    localStorage.setItem('socrates-lang-app', 'en');
    localStorage.setItem('socrates-theme', 'dark');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
  } catch (_) {}
});
await page.route('**/api/**', async (route) => {
  const u = route.request().url().replace('/api/v2/', '/api/');
  if (u.includes('/api/auth/me')) return route.fulfill(json({ user: { id: 'u-1', email: 'jiacheng@example.test', name: 'Jiacheng', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true } }));
  if (u.includes('/api/config')) return route.fulfill(json({ hasBeagleKey: true }));
  if (u.includes('/api/sessions') && route.request().method() === 'GET') {
    return route.fulfill(json({ sessions: [{ id: 's1', title: 'Claude-style chat UI', updatedAt: '2026-08-29T10:00:00Z', mode: 'chat' }] }));
  }
  return route.fulfill(json({ ok: true, stub: true }));
});
await page.goto(URL, { waitUntil: 'networkidle', timeout: 40000 });
await page.waitForFunction(() => ['app', 'auth'].includes(document.documentElement.dataset.bootState), null, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => {
  document.getElementById('authGate')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
  document.documentElement.dataset.bootState = 'app';
});
await page.waitForTimeout(1000);

const out = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.left), y: Math.round(r.top),
      font: cs.fontSize, lh: cs.lineHeight, weight: cs.fontWeight,
      color: cs.color, bg: cs.backgroundColor,
      radius: cs.borderTopLeftRadius, border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join('/'),
      display: cs.display, vis: cs.visibility, opacity: cs.opacity,
      family: cs.fontFamily.split(',')[0],
    };
  };
  const sels = [
    'html', 'body', '.app', '#sidebar', '.sidebar-inner', '.sidebar-header',
    '.sidebar-mode-switch', '.app-mode-toggle', '#sidebarNav', '.sidebar-nav-btn',
    '.sidebar-nav-btn span', '.sidebar-search-row', '.recents-panel', '.recents-header',
    '.recents-title', '#recentsList', '#recentsList .recent-item', '.sidebar-footer',
    '.user-row', '.user-name', '.user-plan',
    '.main', '.top-bar', '.main-content', '.main-inner', '#topicSetup',
    '#topicTitle', '#topicSub', '#topicInputWrap', '#topicComposerRoot',
    '.topic-footer', '.start-btn', '.effort-trigger', '.home-ideas',
    '.home-ideas-label', '.home-idea', '.home-idea span', '.disclaimer',
  ];
  const rootVars = {};
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['--bg', '--surface', '--surface-2', '--panel', '--sidebar-bg', '--border', '--text', '--text-dim', '--muted', '--accent', '--font-ui', '--font-display', '--font-size-scale', '--sidebar-w', '--content-scale', '--radius', '--radius-lg']) {
    const v = cs.getPropertyValue(k).trim();
    if (v) rootVars[k] = v;
  }
  return {
    mode: document.documentElement.dataset.mode,
    appMode: document.documentElement.dataset.appMode || document.body.dataset.appMode,
    bodyClass: document.body.className,
    rootVars,
    nodes: sels.map(pick),
    navLabels: [...document.querySelectorAll('#sidebarNav .sidebar-nav-btn')].map((b) => ({
      nav: b.dataset.nav, text: b.textContent.trim(),
      hidden: getComputedStyle(b).display === 'none',
      h: Math.round(b.getBoundingClientRect().height),
      order: getComputedStyle(b).order,
    })),
  };
});
console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('\nCONSOLE ERRORS:\n' + errs.slice(0, 10).join('\n'));
await b.close();
