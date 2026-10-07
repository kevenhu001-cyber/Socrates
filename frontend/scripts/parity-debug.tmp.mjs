import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'apps', 'socrates', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

const records = new Map([['11111111-1111-4111-8111-111111111111', { id: '11111111-1111-4111-8111-111111111111', topic: '', title: 'Tool conversation', mode: 'chat', phase: 'chat', projectId: null, messages: [{ clientId: 'a1', role: 'assistant', rawText: 'Tools ran.' }] }]]);

function serve(port, handler) {
  const server = createServer(async (req, res) => {
    try { await handler(req, res); } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const api = await serve(4176, async (req, res) => {
  console.log('[api]', req.method, decodeURIComponent(new URL(req.url, 'http://127.0.0.1:4176').pathname) + new URL(req.url, 'http://x').search, req.headers.authorization ? 'authed' : 'anon');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname.endsWith('/auth/mobile/refresh')) return json({ accessToken: 'rotated', refreshToken: 'next-refresh', expiresAt: new Date(Date.now() + 600000).toISOString() });
  if (req.headers.authorization !== 'Bearer rotated') return json({ message: 'Unauthorized' }, 401);
  if (url.pathname.endsWith('/auth/me')) return json({ user: { id: 'account', email: 'test@example.com', displayName: 'Test' } });
  if (url.pathname.endsWith('/projects')) return json({ projects: [] });
  if (url.pathname.endsWith('/sessions') && req.method === 'GET') return json({ sessions: [...records.values()].map(({ messages, ...row }) => row), nextCursor: null });
  if (url.pathname.endsWith('/files') && req.method === 'GET') return json({ files: [], nextCursor: null });
  const id = url.pathname.split('/').at(-1);
  if (records.has(id)) return json(records.get(id));
  return json({ message: 'Not found: ' + url.pathname }, 404);
});

const staticServer = await serve(4199, async (req, res) => {
  const { readFile } = await import('node:fs/promises');
  const { extname } = await import('node:path');
  const path = (req.url || '/').split('?')[0];
  const file = join(dist, path === '/' ? 'index.html' : decodeURIComponent(path.slice(1)));
  if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
  const body = await readFile(file).catch(() => readFile(join(dist, 'index.html')));
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(body);
});

const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url().slice(0, 120)} ${r.failure()?.errorText || ''}`));
await page.addInitScript(() => {
  try { if (!localStorage.getItem('socrates.auth.tokens')) localStorage.setItem('socrates.auth.tokens', JSON.stringify({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: '2000-01-01' })); } catch {}
});
await page.goto('http://127.0.0.1:4199/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
const rowClick = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[role="button"]')].find((b) => (b.getAttribute('aria-label') || '') === 'Tool conversation' && b.getBoundingClientRect().top > 300);
  if (el) { el.click(); return 'clicked'; }
  return 'not-found';
});
await page.waitForTimeout(1500);
const state = await page.evaluate(() => ({
  toolButtons: [...document.querySelectorAll('[role="button"]')].filter((el) => (el.getAttribute('aria-label') || '').includes('Tool conversation')).map((el) => ({ label: el.getAttribute('aria-label'), rect: el.getBoundingClientRect().toJSON(), parent: el.parentElement ? (el.parentElement.getAttribute('role') || el.parentElement.tagName) : null })),
  newChatButtons: [...document.querySelectorAll('[role="button"]')].filter((el) => (el.getAttribute('aria-label') || '').includes('New chat')).map((el) => el.getAttribute('aria-label')),
  text: (document.body.innerText || '').slice(0, 400),
  rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
  fonts: document.fonts ? document.fonts.status : 'n/a',
  fontLoaded: document.fonts ? document.fonts.check('16px Inter_400Regular') : 'n/a',
}));
console.log(JSON.stringify({ rowClick, ...state }, null, 2));
console.log('--- logs ---');
console.log(logs.slice(0, 25).join('\n'));
await browser.close();
api.close(); staticServer.close();
