import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  try {
    localStorage.setItem('socrates-lang-app', 'zh');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
  } catch (_) {}
});
await page.route('**/api/**', (route) => {
  const url = route.request().url().replace('/api/v2/', '/api/');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/api/auth/me')) return json({ user: { id: 'u1', email: 'a@b.c', name: 'A', plan: 'plus', verifiedAt: '2026-01-01T00:00:00Z' } });
  if (url.includes('/api/sessions') && route.request().method() === 'GET') return json({ sessions: [] });
  return json({ ok: true, items: [], providers: [] });
});
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);
const out = await page.evaluate(() => {
  const els = ['#topicSetup', '#topicInputWrap', '#mainInner', '.main-content', '.chat-input-bar', '#chatView'];
  return els.map((s) => {
    const el = document.querySelector(s);
    if (!el) return { s, missing: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { s, w: Math.round(r.width), l: Math.round(r.left), pl: cs.paddingLeft, pr: cs.paddingRight, ml: cs.marginLeft, mr: cs.marginRight };
  });
});
console.log(JSON.stringify(out));
await browser.close();
