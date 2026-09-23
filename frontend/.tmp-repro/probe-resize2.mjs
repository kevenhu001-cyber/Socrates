// .tmp-repro/probe-resize2.mjs — replicate the spec exactly (same helpers), then measure.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { gotoAndSettle } from '../e2e/_lib.mjs';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';

const PORT = 4192;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn(process.execPath, ['./e2e/dist-server.mjs'], {
  cwd: process.cwd(), env: { ...process.env, SMOKE_PORT: String(PORT) }, stdio: 'inherit',
});
await new Promise((res, rej) => {
  const t = setTimeout(rej, 15000, new Error('server timeout'));
  (function w() { fetch(BASE).then(() => { clearTimeout(t); res(); }).catch(() => setTimeout(w, 400)); })();
});
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: BASE });
const page = await context.newPage();
await mockAuthedApp(page);
await page.setViewportSize({ width: 1440, height: 900 });
await gotoAndSettle(page, '/');
await page.waitForLoadState('domcontentloaded');
await waitForAppShell(page);

const metrics = () => page.evaluate(() => {
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main');
  const handle = document.getElementById('sidebarResizeHandle');
  const r = handle.getBoundingClientRect();
  return {
    varValue: getComputedStyle(document.documentElement).getPropertyValue('--app-sidebar-width').trim(),
    sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
    mainPadLeft: Math.round(parseFloat(getComputedStyle(main).paddingLeft)),
    collapsed: sidebar.classList.contains('collapsed'),
    handleBox: { x: r.x, y: r.y, w: r.width, h: r.height },
    shellHidden: document.getElementById('appShell')?.classList.contains('hidden'),
    bootState: document.documentElement.dataset.bootState,
  };
});

console.log('before:', JSON.stringify(await metrics()));
const m0 = await metrics();
const startX = m0.handleBox.x + m0.handleBox.w / 2;
const midY = m0.handleBox.y + m0.handleBox.h / 2;
await page.mouse.move(startX, midY);
await page.mouse.down();
await page.mouse.move(startX + 80, midY, { steps: 8 });
await page.mouse.up();
console.log('after :', JSON.stringify(await metrics()));
// which rule wins for #sidebar width? (incl. nested media rules)
const winner = await page.evaluate(() => {
  const el = document.getElementById('sidebar');
  const hits = [];
  const walk = (rules, media) => {
    for (const rule of rules) {
      if (rule.media) { walk(rule.cssRules, [...media, rule.conditionText]); continue; }
      if (!rule.selectorText && rule.cssRules && rule.cssRules.length) { walk(rule.cssRules, media); continue; }
      if (!rule.selectorText || !rule.style) continue;
      for (const p of ['width', 'min-width', 'max-width', 'flex-basis']) {
        const w = rule.style.getPropertyValue(p);
        if (!w) continue;
        try { if (el.matches(rule.selectorText)) hits.push(media.join('|') + ' @ ' + rule.selectorText + ' => ' + p + ': ' + w + (rule.style.getPropertyPriority(p) === 'important' ? ' !important' : '')); } catch (_) {}
      }
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, []); } catch (_) {} }
  document.documentElement.style.setProperty('--app-sidebar-width', '400px');
  hits.push('EXPERIMENT var=400px rendered=' + Math.round(el.getBoundingClientRect().width));
  // ancestor layout: grid tracks / flex on parents
  const anc = [];
  let p = el.parentElement;
  while (p && anc.length < 3) {
    const pcs = getComputedStyle(p);
    anc.push((p.id || p.tagName) + ' display=' + pcs.display + ' grid=' + pcs.gridTemplateColumns + ' flex=' + pcs.flex);
    p = p.parentElement;
  }
  hits.push('ANCESTORS: ' + anc.join(' | '));
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (_) { continue; }
    for (const rule of rules) {
      if (!rule.selectorText || !rule.style) continue;
      const g = rule.style.getPropertyValue('grid-template-columns');
      if (!g) continue;
      try { if (document.getElementById('appShell').matches(rule.selectorText) || (el.parentElement && el.parentElement.matches(rule.selectorText))) hits.push('GRID ' + rule.selectorText + ' => ' + g + (rule.style.getPropertyPriority('grid-template-columns') === 'important' ? ' !important' : '')); } catch (_) {}
    }
  }
  return hits;
});
console.log('width rules matching #sidebar (in order):');
for (const h of winner) console.log('  ' + h);
await browser.close();
server.kill();
process.exit(0);
