// probe-ui-state.mjs — dumps the actual DOM visibility state of key UI
// elements at each probe step, to distinguish script issues from app bugs.
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const CSRF = 'smoke-csrf-token';
const MOCK_USER = {
  id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true,
};

const API_COUNTERS = {};
const ERRORS = [];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (e) => ERRORS.push({ kind: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push({ kind: 'console', msg: m.text() }); });
  page.on('request', (r) => {
    const u = r.url();
    const m = u.match(/\/api\/v2\/([a-z-]+)/);
    if (m) { const k = m[1]; API_COUNTERS[k] = (API_COUNTERS[k] || 0) + 1; }
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
    if (url.includes('/api/memory') || url.includes('/api/memories') || url.includes('/api/usage') || url.includes('/api/share') || url.includes('/api/mistakes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], list: [], count: 0, ok: true }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stub: true }) });
  });

  const state = async (label) => {
    const s = await page.evaluate(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'absent';
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const inViewport = r.width > 0 && r.height > 0;
        return `${el.tagName.toLowerCase()}${inViewport ? ' visible' : ' hidden'} rect=${Math.round(r.width)}x${Math.round(r.height)} display=${cs.display} vis=${cs.visibility}`;
      };
      const modeToggles = Array.from(document.querySelectorAll('.app-mode-toggle')).map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.dataset.mode || '?'}=${r.width > 0 && r.height > 0 ? 'vis' : 'hid'}`;
      });
      const openPopovers = Array.from(document.querySelectorAll('[data-more-popover-react-hydrated], .sidebar-more-popover')).map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return `${el.id || el.className} rect=${Math.round(r.width)}x${Math.round(r.height)} disp=${cs.display}`;
      });
      return {
        modeToggles,
        topicComposer: vis('#topicComposerRoot .rich-composer-editor'),
        chatComposer: vis('#chatComposerRoot .rich-composer-editor'),
        navExam: vis('#navExam'),
        navMore: vis('#navMore'),
        openPopovers,
        appMode: window.__appMode || (window.getAppMode && window.getAppMode()) || null,
        activeView: document.querySelector('#mainViewport')?.dataset?.view || document.querySelector('.main-viewport')?.dataset?.view || null,
      };
    });
    console.log(`\n--- state ${label}`);
    console.log('  ', JSON.stringify(s, null, 1).replace(/\n/g, '\n   '));
  };

  await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 60000 }).catch((e) => console.log('goto err', String(e)));
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await state('boot');

  // step 1: attempt clicking Tutor toggle via evaluate (bypasses visibility)
  const r1 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.app-mode-toggle'));
    const tutor = els.find((el) => el.dataset.mode === 'tutor');
    if (!tutor) return 'no-tutor-btn';
    tutor.click();
    return 'clicked tutor, toggles=' + els.length;
  });
  console.log('tutor click via evaluate:', r1);
  await page.waitForTimeout(800);
  await state('after tutor eval-click');

  // step 2: open navMore, then check whether popover blocks navExam
  const navMore = page.locator('#navMore');
  if (await navMore.count()) {
    await navMore.click({ timeout: 3000 }).catch((e) => console.log('navMore click err', String(e)));
    await page.waitForTimeout(500);
    await state('after navMore click');
    // try pressing Escape to close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await state('after Escape');
    // try clicking navExam now
    const navExam = page.locator('#navExam');
    if (await navExam.count()) {
      const ok = await navExam.click({ timeout: 3000 }).then(() => 'ok').catch((e) => 'err:' + String(e).split('\n')[0]);
      console.log('navExam click after Escape:', ok);
      await page.waitForTimeout(500);
      await state('after navExam');
    }
  }

  await page.waitForTimeout(500);
  console.log('\n========== UI-STATE RESULTS ==========');
  console.log('API request counts:', JSON.stringify(API_COUNTERS));
  console.log('error summary:', JSON.stringify(Object.fromEntries(Object.entries(ERRORS.reduce((a, e) => { a[e.kind] = (a[e.kind] || 0) + 1; return a; }, {})).map(([k, v]) => [k, v]))));
  ERRORS.forEach((e, i) => console.log(`--- #${i + 1} [${e.kind}] ${e.msg}`));
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });