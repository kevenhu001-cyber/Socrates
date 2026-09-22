import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('socrates-lang-app', 'zh');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
  } catch (_) {}
});
await page.route('**/api/**', (route) => {
  const url = route.request().url().replace('/api/v2/', '/api/');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/api/auth/me')) return json({ user: { id: 'u1', email: 'a@b.c', name: 'Adex Hu', plan: 'plus', verifiedAt: '2026-01-01T00:00:00Z' } });
  if (url.includes('/api/sessions') && route.request().method() === 'GET') return json({ sessions: [] });
  return json({ ok: true, items: [], providers: [] });
});
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const info = await page.evaluate(() => Array.from(document.querySelectorAll('#sidebarNav > *')).map((el) => ({
  id: el.id, nav: el.dataset.nav, display: getComputedStyle(el).display, text: (el.textContent || '').trim().slice(0, 20),
})));
console.log('NAV', JSON.stringify(info));
const top = await page.evaluate(() => ({
  right: Array.from(document.querySelectorAll('.top-bar-right > *')).map((el) => ({ id: el.id, cls: el.className, d: getComputedStyle(el).display })),
  left: Array.from(document.querySelectorAll('.top-bar-left > *')).map((el) => ({ id: el.id, cls: el.className, d: getComputedStyle(el).display })),
}));
console.log('TOP', JSON.stringify(top));
await browser.close();
console.log('done');
