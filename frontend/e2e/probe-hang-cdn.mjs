// probe-hang-cdn.mjs — the critical stability test: stall a single CDN
// script forever (never fulfill, never abort) and check whether the app
// still boots. Before the defer fix, a hung parse-blocking script froze
// parsing → module never ran → app never booted. After the fix, if the
// app boots while a defer script hangs, boot is CDN-independent.
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const CSRF = 'smoke-csrf-token';
const MOCK_USER = {
  id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true,
};

// Which CDN script to hang. Try the LAST one (fuse) and the BIGGEST (plotly).
const HANG_URL = process.env.HANG_URL || 'https://cdn.jsdelivr.net/npm/plotly.js-dist-min@3.7.0/plotly.min.js';

const ERRORS = [];
const API_COUNTS = {};
const API_LOG = [];
const CDN_LOADED = [];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (e) => ERRORS.push({ kind: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push({ kind: 'console', msg: m.text() }); });
  page.on('request', (r) => {
    const u = r.url();
    const m = u.match(/\/api\/v2\/([a-z-]+)/);
    if (m) API_COUNTS[m[1]] = (API_COUNTS[m[1]] || 0) + 1;
    if (u.includes('/api/')) API_LOG.push(`REQ ${r.method()} ${u}`);
  });
  page.on('requestfinished', (r) => {
    if (/cdn\.jsdelivr/.test(r.url())) CDN_LOADED.push(r.url());
  });

  await page.context().addCookies([
    { name: 'csrf', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'xsrf-token', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'sid', value: 'smoke-sid-abc', domain: '127.0.0.1', path: '/' },
  ]);

  // CRITICAL registration order: Playwright evaluates routes in REVERSE
  // registration order — the LAST registered route is consulted first.
  // The `**/*` hang route must therefore be registered BEFORE the
  // `**/api/**` mock, or the catch-all would shadow the mock for every
  // /api request (route.continue() goes straight to the network and never
  // falls through to the earlier route). That shadowing produced the
  // confusing hang-CDN result where /api/auth/me hit the real static
  // server (returned index.html → me=null → bootState=auth) even though
  // the probe "mocked" it.
  // Hang the target CDN script: never fulfill, never abort.
  let hangHit = 0;
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith(HANG_URL)) {
      hangHit++;
      return new Promise(() => {}); // never resolve → request hangs
    }
    return route.continue();
  });

  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace('/api/v2/', '/api/');
    if (url.includes('/api/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: MOCK_USER }) });
    if (url.includes('/api/config')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasBeagleKey: true }) });
    if (url.includes('/api/auth/csrf-token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: CSRF, ok: true }) });
    if (url.includes('/api/sessions')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
    if (url.includes('/api/api-key')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], activeId: null }) });
    if (url.includes('/api/projects')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stub: true }) });
  });

  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch((e) => ERRORS.push({ kind: 'goto', msg: String(e).split('\n')[0] }));
  const parseMs = Date.now() - t0;
  console.log('domcontentloaded reached in', parseMs, 'ms (hang URL:', HANG_URL.split('/').pop(), ')');
  console.log('hang request intercepted:', hangHit, 'times');

  // Wait for boot to settle
  const bootSettled = await page.waitForFunction(() => ['app', 'auth'].includes(document.documentElement.dataset.bootState), null, { timeout: 20000 })
    .then(() => 'yes').catch(() => 'NO');
  console.log('bootState settled:', bootSettled);

  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'absent';
      const r = el.getBoundingClientRect();
      return `${r.width > 0 && r.height > 0 ? 'visible' : 'hidden'}`;
    };
    return {
      bootState: document.documentElement.dataset.bootState,
      shell: vis('#appShell'),
      globals: ['marked', 'DOMPurify', 'katex', 'mermaid', 'echarts', 'Plotly', 'hljs', 'Fuse'].map((g) => `${g}=${typeof window[g]}`).join(' '),
    };
  });
  console.log('state:', JSON.stringify(state));
  console.log('CDN scripts that loaded:', CDN_LOADED.length);
  CDN_LOADED.forEach((u) => console.log('  ', u.split('/').slice(-2).join('/')));

  console.log('API counts:', JSON.stringify(API_COUNTS));
  console.log('API request log:');
  API_LOG.forEach((l) => console.log('  ', l));
  console.log('pageerrors/console errors:', ERRORS.length);
  ERRORS.slice(0, 5).forEach((e) => console.log(`  [${e.kind}] ${e.msg}`));
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });