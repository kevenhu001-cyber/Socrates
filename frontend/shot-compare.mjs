import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const OUT = 'C:/Users/Jiacheng/Desktop/Socrates/frontend/tmp-shots/';

const b = await chromium.launch({ args: ['--no-sandbox'] });

async function prep(p) {
  await p.addInitScript(() => {
    localStorage.setItem('socrates-lang-app', 'zh');
    localStorage.setItem('socrates-theme', 'dark');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, nonEssential: false }));
  });
  await p.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  await p.evaluate(() => {
    const gate = document.getElementById('authGate');
    gate?.classList.add('hidden');
    if (gate) gate.style.display = 'none';
    document.getElementById('appShell')?.classList.remove('hidden');
    document.documentElement.dataset.bootState = 'app';
    document.documentElement.dataset.showGrid = 'false';
    document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach(e => e.remove());
  });
  await p.waitForTimeout(700);
}

// ---- mobile ----
const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await prep(m);
await m.evaluate(() => document.getElementById('sidebar')?.classList.add('collapsed'));
await m.waitForTimeout(400);
await m.screenshot({ path: OUT + 'm1-idle.png' });

await m.evaluate(() => {
  const ed = document.querySelector('#topicComposerRoot .tiptap');
  if (ed) ed.focus();
});
await m.waitForTimeout(500);
await m.screenshot({ path: OUT + 'm2-focused.png' });

await m.evaluate(() => document.getElementById('topicComposerToolsBtn')?.click());
await m.waitForTimeout(500);
await m.screenshot({ path: OUT + 'm3-menu.png' });
await m.close();

// ---- desktop ----
const d = await b.newPage({ viewport: { width: 1600, height: 900 } });
await prep(d);
await d.waitForTimeout(400);
await d.screenshot({ path: OUT + 'd1-desktop.png' });
await d.close();

await b.close();
console.log('shots ok');
