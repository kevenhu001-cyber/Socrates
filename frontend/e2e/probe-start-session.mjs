// probe-start-session.mjs — focused check: after clicking Start on the
// topic-setup screen, does the app transition to chat view? Dumps view
// state, which surfaces are visible, and whether the mode toggle / chat
// composer become visible. This distinguishes a real "Start broken" bug
// from probe sequencing (the tutor toggle + chat composer clicks that
// probe-full reports as timeouts).
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const CSRF = 'smoke-csrf-token';
const MOCK_USER = {
  id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true,
};

const ERRORS = [];
const API_COUNTS = {};

async function dump(page, label) {
  const s = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'absent';
      const r = el.getBoundingClientRect();
      return `${r.width > 0 && r.height > 0 ? 'visible' : 'hidden'}`;
    };
    const html = document.documentElement;
    return {
      bootState: html.dataset.bootState,
      bodyDataView: document.body.getAttribute('data-view'),
      appDataView: html.dataset.view,
      topicSetup: vis('#topicSetupView'),
      chatView: vis('#chatView'),
      modeToggle: vis('.app-mode-toggle'),
      chatComposer: vis('#chatComposerRoot .rich-composer-editor'),
      startBtn: vis('#startBtn'),
      currentSessionId: window.state ? window.state.currentSessionId : '(no state)',
      appMode: window.appMode,
    };
  });
  console.log(`--- ${label}:`, JSON.stringify(s));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => ERRORS.push({ kind: 'pageerror', msg: String(e) }));
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push({ kind: 'console', msg: m.text() }); });
  page.on('request', (r) => {
    const m = r.url().match(/\/api\/v2\/([a-z-]+)/);
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
    if (url.includes('/api/chat') || url.includes('/api/chat/')) {
      // Return an empty assistant reply so the chat can proceed.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hi' } }] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stub: true }) });
  });

  await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 60000 }).catch((e) => ERRORS.push({ kind: 'goto', msg: String(e) }));
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await dump(page, 'after boot');

  // Type into the topic composer
  const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor').first();
  const hasEditor = await topicEditor.count();
  console.log('topic editor count:', hasEditor);
  if (hasEditor) {
    await topicEditor.click();
    await page.keyboard.type('量子力学是什么');
    await page.waitForTimeout(300);
  }
  await dump(page, 'after typing topic');

  const startBtn = page.locator('#startBtn');
  console.log('startBtn count:', await startBtn.count(), 'visible:', await startBtn.isVisible().catch(() => 'err'));
  if (await startBtn.count()) {
    await startBtn.click({ timeout: 5000 }).catch((e) => ERRORS.push({ kind: 'click-start', msg: String(e) }));
    await page.waitForTimeout(3000);
  }
  await dump(page, 'after Start click');

  // Try the mode toggle now
  const modeBtns = page.locator('.app-mode-toggle');
  console.log('mode toggle count:', await modeBtns.count());
  if (await modeBtns.count() > 0) {
    await modeBtns.nth(1).click({ timeout: 3000 }).catch((e) => ERRORS.push({ kind: 'click-tutor', msg: String(e) }));
    await page.waitForTimeout(800);
    await dump(page, 'after tutor toggle');
  }

  console.log('API counts:', JSON.stringify(API_COUNTS));
  console.log('ERRORS:', ERRORS.length);
  ERRORS.forEach((e) => console.log(`  [${e.kind}] ${e.msg}`));
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });