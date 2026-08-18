// probe-full.mjs — full UI flow runtime probe.
// Boots into the app shell (mocked auth), then walks the core UI flows and
// captures every pageerror / console error / unhandledrejection + API loops.
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

  page.on('pageerror', (e) => ERRORS.push({ kind: 'pageerror', msg: String(e), stack: (e.stack || '').split('\n').slice(0, 5).join(' | ') }));
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

  const step = (name) => console.log(`\n=== ${name}`);
  try {
    await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 60000 }).catch((e) => console.log('goto err', String(e)));
    await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // NOTE: keep the app in CHAT mode (default) for the full-flow walk.
    // Tutor mode shows an "Explore your knowledge boundary?" dialog then a
    // diagnostic loading phase before the chat composer appears; with a
    // stubbed backend the diagnostic never completes, so the composer stays
    // hidden. probe-start-session.mjs covers the tutor-mode dialog path.
    step('topic input -> Start');
    const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor').first();
    if (await topicEditor.count()) {
      await topicEditor.click();
      await page.keyboard.type('量子力学是什么');
      await page.waitForTimeout(300);
      const startBtn = page.locator('button.start-btn, .start-btn').first();
      if (await startBtn.count()) { await startBtn.click({ timeout: 5000 }).catch((e) => ERRORS.push({ kind: 'click', msg: String(e) })); }
      await page.waitForFunction(() => {
        const el = document.querySelector('#chatComposerRoot .rich-composer-editor');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    step('open nav panels');
    for (const nav of ['navLibrary', 'navProjects', 'navPlugins', 'navMore', 'navExam']) {
      const el = page.locator('#' + nav);
      if (await el.count()) { await el.click({ timeout: 3000 }).catch((e) => ERRORS.push({ kind: 'click', msg: String(e) })); await page.waitForTimeout(400); }
      // Close any popover the nav may have opened so the next nav is clickable.
      if (nav === 'navMore') { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200); }
    }
    // Nav panels replace the chat view (hideChatAndTopic). Return to the chat
    // view so the remaining steps operate on the live conversation.
    await page.evaluate(() => {
      try {
        if (typeof window.hideMainPages === 'function') window.hideMainPages();
        const cv = document.getElementById('chatView');
        if (cv) cv.classList.remove('hidden');
      } catch (_) {}
    }).catch(() => {});
    await page.waitForTimeout(300);

    step('open modals');
    for (const fn of ['openSettings', 'openProfile', 'openCheatsheet', 'openCmdK', 'openUsageModal', 'toggleDisplayPrefs']) {
      const r = await page.evaluate((f) => { try { if (typeof window[f] === 'function') { window[f](); return 'ok'; } return 'missing'; } catch (e) { return 'threw:' + e; } }, fn);
      console.log(`  ${fn} -> ${r}`);
      await page.waitForTimeout(400);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(250);
    }

    step('chat send (Enter)');
    const chatEditor = page.locator('#chatComposerRoot .rich-composer-editor').first();
    if (await chatEditor.count()) {
      if (!(await chatEditor.isVisible().catch(() => false))) {
        ERRORS.push({ kind: 'chat-editor-not-visible', msg: 'chat composer present but not visible; skipping chat send' });
      } else {
        await chatEditor.click({ timeout: 3000 }).catch((e) => ERRORS.push({ kind: 'click', msg: String(e) }));
        await page.keyboard.type('解释一下变量');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    }

    step('theme + display prefs');
    const themeBtn = page.locator('[data-action="toggleTheme"]').first();
    if (await themeBtn.count()) { await themeBtn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(300); }
    const displayBtn = page.locator('[data-action="toggleDisplayPrefs"]').first();
    if (await displayBtn.count()) { await displayBtn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }

    step('sidebar search');
    const search = page.locator('#sidebarSearch');
    if (await search.count()) { await search.fill('x').catch(() => {}); await page.waitForTimeout(300); }

    step('share modal');
    const shareBtn = page.locator('#shareBtn');
    if (await shareBtn.count()) { await shareBtn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }

    await page.waitForTimeout(1000);
  } catch (e) {
    ERRORS.push({ kind: 'probe-throw', msg: String(e) });
  }

  console.log('\n========== PROBE RESULTS ==========');
  console.log('API request counts:', JSON.stringify(API_COUNTERS, null, 0));
  if (ERRORS.length === 0) console.log('NO ERRORS');
  const byKind = {};
  for (const e of ERRORS) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  console.log('error summary:', JSON.stringify(byKind));
  ERRORS.forEach((e, i) => { console.log(`--- #${i + 1} [${e.kind}] ${e.msg}`); if (e.stack) console.log('    ', e.stack); });
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });