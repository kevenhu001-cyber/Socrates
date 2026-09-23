// probe-resize3.mjs — find the REAL winning width rule incl. nested media rules.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { gotoAndSettle } from '../e2e/_lib.mjs';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';

const PORT = 4193;
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
await page.route('**/api/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/api/auth/me') ? { user: { id: 'u1', email: 'p@p.co', name: 'P', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes' } } : { ok: true }) }));
await page.addInitScript(() => localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true })));
await page.goto(BASE, { waitUntil: 'commit' });
await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

const hits = await page.evaluate(() => {
  const el = document.getElementById('sidebar');
  const out = [];
  const walk = (rules, media) => {
    for (const rule of rules) {
      if (rule.media) { walk(rule.cssRules, [...media, rule.conditionText]); continue; }
      if (rule.cssRules) { walk(rule.cssRules, media); continue; }
      if (!rule.selectorText || !rule.style) continue;
      const props = ['width', 'min-width', 'max-width', 'flex-basis', 'transform'];
      for (const p of props) {
        const v = rule.style.getPropertyValue(p);
        if (!v) continue;
        try { if (el.matches(rule.selectorText)) out.push({ media: media.join('|'), sel: rule.selectorText, prop: p, value: v, imp: rule.style.getPropertyPriority(p) }); } catch (_) {}
      }
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, []); } catch (_) {} }
  // direct experiment: bump the var and see what the element does
  document.documentElement.style.setProperty('--app-sidebar-width', '340px');
  const afterBump = Math.round(el.getBoundingClientRect().width);
  out.push({ media: 'EXPERIMENT', sel: '--app-sidebar-width=340px', prop: 'renderedWidth', value: String(afterBump), imp: '' });
  return out;
});
console.log(JSON.stringify(hits, null, 1));
await browser.close();
server.kill();
process.exit(0);
