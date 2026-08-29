/* Scratch: capture the mobile landing so the stale mobile-home-visual
   assertions can be judged against what the shell actually renders. */
import { chromium } from 'playwright';

const json = (body) => ({
  status: 200, contentType: 'application/json',
  body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' },
});

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
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
await page.waitForTimeout(900);
await page.screenshot({ path: `tmp-shots/${process.env.QA_TAG || 'now'}-mobile.png` });
console.log('saved');
await b.close();
