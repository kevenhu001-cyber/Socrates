/* Scratch probe for the sidebar footer row: reports the width each part of
   "avatar · name · tier · actions" actually gets, so the shrink priorities can
   be set from measurements. Not part of the app. */
import { chromium } from 'playwright';

const json = (body, status = 200) => ({
  status, contentType: 'application/json',
  body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' },
});

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 601 } });
await ctx.addCookies([
  { name: 'csrf', value: 'qa', domain: 'localhost', path: '/' },
  { name: 'sid', value: 'qa-sid', domain: 'localhost', path: '/' },
]);
const page = await ctx.newPage();
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
  if (u.includes('/api/sessions') && route.request().method() === 'GET') return route.fulfill(json({ sessions: [] }));
  return route.fulfill(json({ ok: true, stub: true }));
});
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 40000 });
await page.waitForFunction(() => ['app', 'auth'].includes(document.documentElement.dataset.bootState), null, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => {
  document.getElementById('authGate')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
  document.documentElement.dataset.bootState = 'app';
});
await page.waitForTimeout(1000);

console.log(JSON.stringify(await page.evaluate(() => {
  const box = (sel, root = document) => {
    const el = root.querySelector(sel);
    if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect();
    return { sel, w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.left.toFixed(1), text: (el.textContent || '').trim().slice(0, 40), scrollW: el.scrollWidth };
  };
  return {
    parts: ['.sidebar-footer', '.sidebar-footer .user-row', '.user-avatar', '.user-identity', '.user-name', '.user-plan', '.tier-badge', '.sidebar-footer-actions'].map((s) => box(s)),
    landing: ['#topicSetup', '#topicTitle', '#topicInputWrap', '.topic-footer', '.home-ideas'].map((s) => {
      const el = document.querySelector(s);
      if (!el) return { s, missing: true };
      const r = el.getBoundingClientRect();
      return { s, y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) };
    }),
  };
}), null, 1));
await b.close();
