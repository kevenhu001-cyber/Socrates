// .tmp-repro/probe-resize.mjs — who eats the mousedown on #sidebarResizeHandle?
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4189;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn(process.execPath, ['./e2e/dist-server.mjs'], {
  cwd: process.cwd(), env: { ...process.env, SMOKE_PORT: String(PORT) }, stdio: 'ignore',
});
await new Promise((res, rej) => {
  const t = setTimeout(rej, 15000, new Error('server timeout'));
  (function w() { fetch(BASE).then(() => { clearTimeout(t); res(); }).catch(() => setTimeout(w, 400)); })();
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true }));
});
await page.route('**/api/**', async (route) => {
  const url = route.request().url().replace('/api/v2/', '/api/');
  const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (url.includes('/api/auth/me')) return json({ user: { id: 'u1', email: 'p@p.co', name: 'P', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true } });
  if (url.includes('/api/config')) return json({ hasBeagleKey: true });
  if (url.includes('/api/sessions')) return json(route.request().method() === 'GET' ? { sessions: [] } : { session: { id: 's1' } });
  return json({ ok: true });
});
await page.goto(BASE, { waitUntil: 'commit' });
await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const handle = document.getElementById('sidebarResizeHandle');
  if (!handle) return { handle: 'MISSING' };
  const r = handle.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const cs = getComputedStyle(handle);
  const chain = [];
  let el = top;
  while (el && chain.length < 5) { chain.push(el.id ? '#' + el.id : el.tagName + '.' + String(el.className).split(' ')[0]); el = el.parentElement; }
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    pointerEvents: cs.pointerEvents, opacity: cs.opacity, zIndex: cs.zIndex,
    hitTarget: top ? (top.id || top.tagName + '.' + String(top.className).slice(0, 60)) : null,
    hitChain: chain,
    varValue: getComputedStyle(document.documentElement).getPropertyValue('--app-sidebar-width'),
    initWired: typeof window.initSidebarDrag,
  };
});
console.log(JSON.stringify(info, null, 2));

// simulate a real drag
await page.mouse.move(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
await page.mouse.down();
await page.mouse.move(info.rect.x + info.rect.w / 2 + 80, info.rect.y + info.rect.h / 2, { steps: 8 });
await page.mouse.up();
console.log('after drag var =', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-sidebar-width')));
await browser.close();
server.kill();
process.exit(0);
