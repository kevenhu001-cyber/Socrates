// .tmp-repro/shot-review.mjs — evidence screenshots for the 2026-09-23 review.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { gotoAndSettle } from '../e2e/_lib.mjs';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';
import { prepareChatWorkbench } from '../e2e/_chat-workbench.mjs';

const OUT = 'C:/Users/Jiacheng/Desktop/Socrates/frontend/tmp-shots/review-2026-09-23/';
const PORT = 4194;
const BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn(process.execPath, ['./e2e/dist-server.mjs'], {
  cwd: process.cwd(), env: { ...process.env, SMOKE_PORT: String(PORT) }, stdio: 'ignore',
});
await new Promise((res, rej) => {
  const t = setTimeout(rej, 15000, new Error('server timeout'));
  (function w() { fetch(BASE).then(() => { clearTimeout(t); res(); }).catch(() => setTimeout(w, 400)); })();
});
const browser = await chromium.launch();

async function app(viewport, theme) {
  const page = await browser.newPage({ viewport });
  await mockAuthedApp(page);
  await page.addInitScript((v) => { try { localStorage.setItem('socrates-theme', v); } catch (_) {} }, theme);
  await page.goto(BASE, { waitUntil: 'commit' });
  await gotoAndSettle(page, BASE);
  await waitForAppShell(page);
  return page;
}

// landing light/dark desktop
for (const theme of ['light', 'dark']) {
  const p = await app({ width: 1440, height: 900 }, theme);
  await p.screenshot({ path: OUT + `landing-${theme}-1440.png` });
  // settings modal
  await p.evaluate(() => window.openSettings && window.openSettings());
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + `settings-${theme}-1440.png` });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  // exam view
  await p.evaluate(() => window.openNav && window.openNav('exam'));
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + `exam-${theme}-1440.png` });
  await p.close();
}

// chat conversation surface (mocked messages)
const MSGS = [
  { clientId: 'fixture-user', role: 'user', rawText: 'Explain quicksort', html: '<p>Explain quicksort</p>', type: 'user' },
  { clientId: 'fixture-assistant', role: 'assistant', rawText: 'Quicksort picks a pivot and partitions around it.', html: '<p>Quicksort picks a pivot and partitions around it.</p>', type: 'assistant' },
];
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
  const p = await ctx.newPage();
  try {
    await p.addInitScript((v) => { try { localStorage.setItem('socrates-theme', v); } catch (_) {} }, theme);
    await prepareChatWorkbench(p, { messages: MSGS, viewport: { width: 1440, height: 900 } });
    await p.screenshot({ path: OUT + `chat-${theme}-1440.png` });
  } catch (e) { console.log('chat shot fail ' + theme + ': ' + e.message); }
  await ctx.close();
}

// responsive sweep (landing, light)
for (const w of [600, 768, 1024, 1280]) {
  const p = await app({ width: w, height: 900 }, 'light');
  await p.screenshot({ path: OUT + `landing-light-${w}.png` });
  await p.close();
}
const m = await app({ width: 390, height: 844 }, 'dark');
await m.screenshot({ path: OUT + 'landing-dark-390.png' });
await m.close();

await browser.close();
server.kill();
console.log('shots written to ' + OUT);
process.exit(0);
