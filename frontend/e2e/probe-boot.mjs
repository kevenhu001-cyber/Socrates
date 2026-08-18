// probe-boot.mjs — minimal boot diagnosis: which /api calls fire,
// what status they return, and why the app lands on auth gate vs shell.
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173';
const CSRF = 'smoke-csrf-token';
const MOCK_USER = {
  id: 'u-test-1', email: 'smoke@example.test', name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true,
};

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.context().addCookies([
    { name: 'csrf', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'xsrf-token', value: CSRF, domain: '127.0.0.1', path: '/' },
    { name: 'sid', value: 'smoke-sid-abc', domain: '127.0.0.1', path: '/' },
  ]);

  let meFulfilled = false;
  const projectReqs = [];
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const apiUrl = url.replace('/api/v2/', '/api/');
    if (apiUrl.includes('/api/projects')) projectReqs.push(Date.now());
    if (apiUrl.includes('/api/auth/me')) {
      meFulfilled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: MOCK_USER }) });
    }
    if (apiUrl.includes('/api/config')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasBeagleKey: true }) });
    if (apiUrl.includes('/api/auth/csrf-token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: CSRF, ok: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stub: true }) });
  });

  page.on('pageerror', (e) => console.log('  [pageerror]', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console-error]', m.text()); });
  page.on('requestfailed', (r) => console.log('  [reqfailed]', r.url(), r.failure()?.errorText));

  await page.goto(BASE + '/', { waitUntil: 'commit', timeout: 60000 }).catch((e) => console.log('goto err', String(e)));
  await page.waitForTimeout(5000);

  const bootState = await page.evaluate(() => document.documentElement.dataset.bootState);
  const gateVisible = await page.locator('#authGate').isVisible().catch(() => 'err');
  const shellVisible = await page.locator('#appShell').isVisible().catch(() => 'err');
  const currentUser = await page.evaluate(() => window.CURRENT_USER || null);
  const htmlLen = await page.evaluate(() => document.documentElement.outerHTML.length);
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src || '(inline)').slice(0, 30));
  const bootMarker = await page.evaluate(() => document.documentElement.dataset.bootState);
  console.log('htmlLen =', htmlLen, 'bootMarker =', bootMarker);
  console.log('scripts:', scripts.join('\n'));
  const bindings = await page.evaluate(() => {
    const k = ['setLang', 't', 'openSettings', 'showConfirm', 'openCmdK', 'openProfile', 'resetApp', 'toggleAppMode', 'signOut'];
    return k.map((x) => `${x}=${typeof window[x]}`);
  });
  console.log('bootState =', bootState);
  console.log('gateVisible =', gateVisible, 'shellVisible =', shellVisible);
  console.log('meFulfilled =', meFulfilled);
  console.log('CURRENT_USER =', JSON.stringify(currentUser));
  console.log('bindings:', bindings.join(', '));
  console.log('/api/projects request count =', projectReqs.length);
  if (projectReqs.length > 1) {
    const gaps = projectReqs.slice(1).map((t, i) => t - projectReqs[i]);
    console.log('inter-request gaps (ms):', gaps.slice(0, 20).join(', '));
  }
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });