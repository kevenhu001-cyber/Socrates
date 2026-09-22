#!/usr/bin/env node
/* shoot-mobile-align.mjs — temporary design-QA capture for the mobile
 * ChatGPT 1:1 pass (390x844, zh, dark). Not committed.
 * Usage: node shoot-mobile-align.mjs [label]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.SHOOT_OUT || resolve(process.env.TEMP || __dirname, 'socrates-shots');
const BASE = process.env.SHOOT_BASE || 'http://localhost:5173';
const label = process.argv[2] || 'align';

fs.mkdirSync(OUT_DIR, { recursive: true });

const SESSIONS = {
  sessions: [
    { id: 's1', title: '查询价格走势', updatedAt: '2026-09-21T10:00:00Z' },
    { id: 's2', title: '查看GitHub fork', updatedAt: '2026-09-21T09:00:00Z' },
    { id: 's3', title: '修复跨平台构建', updatedAt: '2026-09-20T08:00:00Z' },
    { id: 's4', title: '修复安卓应用 PR', updatedAt: '2026-09-19T08:00:00Z' },
    { id: 's5', title: '自我介绍', updatedAt: '2026-09-18T08:00:00Z' },
    { id: 's6', title: '问候回应', updatedAt: '2026-09-17T08:00:00Z' },
    { id: 's7', title: '检查Socrates仓库', updatedAt: '2026-09-16T08:00:00Z' },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.addInitScript(() => {
  try {
    localStorage.setItem('socrates-lang-app', 'zh');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
  } catch (_) {}
});

await page.route('**/api/**', async (route) => {
  const req = route.request();
  const url = req.url().replace('/api/v2/', '/api/');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/api/auth/me')) return json({ user: { id: 'u1', email: 'a@b.c', name: 'Adex Hu', plan: 'plus', verifiedAt: '2026-01-01T00:00:00Z' } });
  if (url.includes('/api/sessions')) {
    if (req.method() === 'GET') return json(SESSIONS);
    return json({ session: { id: 'smoke-saved-1' } });
  }
  if (url.includes('/api/config')) return json({ hasBeagleKey: true });
  if (url.includes('/api/api-key')) return json({ providers: [], activeId: null });
  return json({ ok: true, items: [], list: [], connectors: [], sessions: [] });
});

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

const shot = (name) => page.screenshot({ path: resolve(OUT_DIR, `${label}-${name}.jpg`), type: 'jpeg', quality: 92 });
await shot('m1-landing');

await page.evaluate(() => { window.toggleSidebar ? window.toggleSidebar() : document.getElementById('sidebarOpenBtn')?.click(); });
await page.waitForTimeout(450);
await shot('m2-sidebar');
await page.evaluate(() => { window.toggleSidebar ? window.toggleSidebar() : document.getElementById('sidebarCloseBtn')?.click(); });
await page.waitForTimeout(400);

await page.locator('#topicComposerToolsBtn').click();
await page.waitForTimeout(450);
await shot('m3-tools');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

await page.locator('#topicComposerRoot .tiptap').click().catch(() => {});
await page.waitForTimeout(400);
await shot('m4-focused');

console.log('done →', OUT_DIR);
await browser.close();
