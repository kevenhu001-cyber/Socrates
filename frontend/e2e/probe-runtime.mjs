// probe-runtime.mjs — Debug-mode runtime probe.
// Boots the SPA against the static dist server, walks the main UI flows
// (topic setup, mode switch, modals, chat send, exam, sidebar nav), and
// captures every pageerror / console error / unhandledrejection so we can
// triage stability with real runtime evidence instead of guessing.
import { chromium } from '@playwright/test';

const BASE = process.env.SMOKE_PORT ? `http://127.0.0.1:${process.env.SMOKE_PORT}` : 'http://127.0.0.1:4173';
const CSRF = 'smoke-csrf-token';

const MOCK_USER = {
  id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes',
  customInstructions: '', webSearchOn: true,
};

function json(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

async function mockAuthed(page) {
  await page.context().addCookies([
    { name: 'csrf', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'xsrf-token', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'sid', value: 'smoke-sid-abc', domain: '127.0.0.1', path: '/' },
  ]);
  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace('/api/v2/', '/api/');
    if (url.includes('/api/auth/me')) return route.fulfill(json({ user: MOCK_USER }));
    if (url.includes('/api/config')) return route.fulfill(json({ hasBeagleKey: true }));
    if (url.includes('/api/auth/csrf-token')) return route.fulfill(json({ csrfToken: CSRF, ok: true }));
    if (url.includes('/api/sessions')) {
      if (route.request().method() === 'GET') return route.fulfill(json({ sessions: [] }));
      return route.fulfill(json({ session: { id: 'smoke-saved-1' } }));
    }
    if (url.includes('/api/api-key')) return route.fulfill(json({ providers: [], activeId: null }));
    if (url.includes('/api/memories') || url.includes('/api/usage') || url.includes('/api/projects') ||
        url.includes('/api/share') || url.includes('/api/mistakes')) {
      return route.fulfill(json({ items: [], list: [], count: 0, ok: true }));
    }
    return route.fulfill(json({ ok: true, stub: true }));
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const apiLog = [];
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', msg: String(e), stack: e.stack || '' }));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push({ kind: 'console', msg: m.text() });
  });
  page.on('requestfailed', (r) => {
    errors.push({ kind: 'requestfailed', msg: `${r.method()} ${r.url()} -> ${r.failure()?.errorText || '?'}` });
  });
  page.on('request', (r) => { if (r.url().includes('/api/')) apiLog.push(`REQ ${r.method()} ${r.url()}`); });
  page.on('response', (r) => { if (r.url().includes('/api/')) apiLog.push(`RES ${r.status()} ${r.url()}`); });

  const step = (name) => console.log(`\n=== STEP: ${name}`);

  try {
    await mockAuthed(page);
    await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 60000 });
    // Wait for boot to settle into app shell.
    await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    step('app shell booted');
    const bootState = await page.evaluate(() => document.documentElement.dataset.bootState);
    console.log('bootState =', bootState);
    console.log('--- api log (first 40) ---');
    console.log(apiLog.slice(0, 40).join('\n'));
    console.log('--- end api log ---');

    // 1. Topic input -> Start
    step('type topic + click Start');
    const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor').first();
    if (await topicEditor.count()) {
      await topicEditor.click();
      await page.keyboard.type('量子力学是什么');
      await page.waitForTimeout(400);
      const startBtn = page.locator('button.start-btn, .start-btn').first();
      if (await startBtn.count()) { await startBtn.click({ timeout: 5000 }).catch((e) => errors.push({ kind: 'click', msg: String(e) })); }
      await page.waitForTimeout(2000);
    } else {
      console.log('  ! no topic editor found');
      errors.push({ kind: 'probe', msg: 'topic editor not found' });
    }

    // 2. Mode switch Chat -> Tutor
    step('toggle app mode to tutor');
    const modeBtns = page.locator('.app-mode-toggle');
    if (await modeBtns.count()) {
      await modeBtns.nth(1).click().catch((e) => errors.push({ kind: 'click', msg: String(e) }));
      await page.waitForTimeout(1000);
    }

    // 3. Open sidebar nav panels
    step('open nav: library / projects / plugins / more');
    for (const nav of ['navLibrary', 'navProjects', 'navPlugins', 'navMore']) {
      const el = page.locator('#' + nav);
      if (await el.count()) {
        await el.click().catch((e) => errors.push({ kind: 'click', msg: String(e) }));
        await page.waitForTimeout(400);
      }
    }
    await page.waitForTimeout(300);

    // 4. Open modals
    step('open modals: settings / profile / cheatsheet / cmdK / usage');
    const modalActions = ['openSettings', 'openProfile', 'openCheatsheet', 'openCmdK', 'openUsageModal'];
    for (const fn of modalActions) {
      const opened = await page.evaluate((f) => {
        try { if (typeof window[f] === 'function') { window[f](); return true; } } catch (e) { return String(e); }
        return false;
      }, fn);
      console.log(`  ${fn} ->`, opened);
      await page.waitForTimeout(500);
      // Esc to close
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }

    // 5. Chat send
    step('send a chat message');
    const chatEditor = page.locator('#chatComposerRoot .rich-composer-editor').first();
    if (await chatEditor.count()) {
      await chatEditor.click();
      await page.keyboard.type('解释一下变量');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
    }

    // 6. Theme toggle + display prefs
    step('theme toggle + display prefs');
    const themeBtn = page.locator('#themeToggle, [data-action="toggleTheme"]').first();
    if (await themeBtn.count()) {
      await themeBtn.click().catch((e) => errors.push({ kind: 'click', msg: String(e) }));
      await page.waitForTimeout(300);
    }
    const displayBtn = page.locator('[data-action="toggleDisplayPrefs"]').first();
    if (await displayBtn.count()) {
      await displayBtn.click().catch((e) => errors.push({ kind: 'click', msg: String(e) }));
      await page.waitForTimeout(400);
    }

    // 7. Sidebar recent search + recents
    step('sidebar search input');
    const search = page.locator('#sidebarSearch');
    if (await search.count()) {
      await search.fill('x').catch(() => {});
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(800);
  } catch (e) {
    errors.push({ kind: 'probe-throw', msg: String(e) });
  }

  console.log('\n\n========== RUNTIME PROBE RESULTS ==========');
  if (errors.length === 0) {
    console.log('NO ERRORS CAPTURED');
  }
  const byKind = {};
  for (const e of errors) { byKind[e.kind] = (byKind[e.kind] || 0) + 1; }
  console.log('error summary:', JSON.stringify(byKind));
  for (const e of errors) {
    console.log('---');
    console.log(`[${e.kind}] ${e.msg}`);
    if (e.stack && e.kind === 'pageerror') console.log(e.stack.split('\n').slice(0, 6).join('\n'));
  }
  await browser.close();
}

main().catch((e) => { console.error('PROBE FATAL', e); process.exit(1); });