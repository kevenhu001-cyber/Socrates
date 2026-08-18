// probe-cdn-blocked.mjs — blocks ALL third-party CDN requests to test
// whether the app can boot and render without any CDN global. If the app
// hangs with CDN blocked, the parse-blocking CDN scripts are boot-critical
// (and a slow/hung CDN in the wild = app never loads).
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const CSRF = 'smoke-csrf-token';
const MOCK_USER = {
  id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true,
};

const ERRORS = [];
const CDN_BLOCKED = [];
const API_COUNTS = {};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (e) => ERRORS.push({ kind: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push({ kind: 'console', msg: m.text() }); });
  page.on('request', (r) => {
    const u = r.url();
    if (/cdn\.jsdelivr|fonts\.google|fonts\.gstatic/.test(u)) CDN_BLOCKED.push(u);
    const m = u.match(/\/api\/v2\/([a-z-]+)/);
    if (m) API_COUNTS[m[1]] = (API_COUNTS[m[1]] || 0) + 1;
  });

  await page.context().addCookies([
    { name: 'csrf', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'xsrf-token', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'sid', value: 'smoke-sid-abc', domain: '127.0.0.1', path: '/' },
  ]);

  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace('/api/v2/', '/api/');
    if (url.includes('/api/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: MOCK_USER }) });
    if (url.includes('/api/config')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasBeagleKey: true }) });
    if (url.includes('/api/auth/csrf-token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: CSRF, ok: true }) });
    if (url.includes('/api/sessions')) {
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [] }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'smoke-saved-1' } }) });
    }
    if (url.includes('/api/api-key')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: [], activeId: null }) });
    if (url.includes('/api/projects')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stub: true }) });
  });

  // Block ALL third-party CDN + fonts requests (abort them immediately).
  await page.route(/^(https:\/\/cdn\.jsdelivr\.net|https:\/\/fonts\.(googleapis|gstatic)\.com)/, (route) => route.abort());

  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch((e) => ERRORS.push({ kind: 'goto', msg: String(e).split('\n')[0] }));
  const gotoMs = Date.now() - t0;
  console.log('goto (domcontentloaded) took', gotoMs, 'ms');

  // Wait for boot state to settle (auth or app)
  await page.waitForFunction(() => ['app', 'auth'].includes(document.documentElement.dataset.bootState), null, { timeout: 15000 })
    .then(() => console.log('bootState settled:', 'yes'))
    .catch((e) => console.log('bootState never settled —', String(e).split('\n')[0]));
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'absent';
      const r = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()} ${r.width > 0 && r.height > 0 ? 'visible' : 'hidden'} ${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    const globals = ['marked', 'DOMPurify', 'katex', 'mermaid', 'echarts', 'Plotly', 'hljs', 'Fuse'].map((g) => `${g}=${typeof window[g]}`);
    return {
      bootState: document.documentElement.dataset.bootState,
      gate: vis('#authGate'),
      shell: vis('#appShell'),
      globals,
      bodyText: (document.body.innerText || '').slice(0, 200),
    };
  });
  console.log('state:', JSON.stringify(state, null, 1));

  // Try starting a session with marked/DOMPurify/katex missing
  const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor').first();
  if (await topicEditor.count()) {
    await topicEditor.click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.type('你好，量子力学');
    const startBtn = page.locator('button.start-btn, .start-btn').first();
    if (await startBtn.count()) await startBtn.click({ timeout: 5000 }).catch((e) => ERRORS.push({ kind: 'click', msg: String(e).split('\n')[0] }));
    await page.waitForTimeout(2500);
    const msgListLen = await page.evaluate(() => document.querySelectorAll('#msgList .msg').length);
    console.log('msgList .msg count after start:', msgListLen);
  }

  console.log('\n========== CDN-BLOCKED RESULTS ==========');
  console.log('CDN requests attempted:', CDN_BLOCKED.length);
  console.log('API counts:', JSON.stringify(API_COUNTS));
  console.log('errors:', ERRORS.length);
  ERRORS.forEach((e, i) => console.log(`--- #${i + 1} [${e.kind}] ${e.msg}`));
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });