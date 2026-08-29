import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });

async function shotMobile() {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 15000 });
  await p.evaluate(() => {
    document.getElementById('authGate')?.classList.add('hidden');
    document.getElementById('appShell')?.classList.remove('hidden');
    document.documentElement.dataset.bootState = 'app';
    document.documentElement.dataset.mode = 'dark';
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach(e => e.remove());
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    document.querySelectorAll('div').forEach(e => {
      const t = e.textContent?.trim();
      if (t === "Couldn't reach the server. Check your connection and retry.") e.style.display = 'none';
    });
  });
  await p.screenshot({ path: 'C:/Users/Jiacheng/AppData/Local/Temp/opencode/verify-mobile.png', fullPage: true });
  console.log('mobile ok');
  await p.close();
}

async function shotDesktop() {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 15000 });
  await p.evaluate(() => {
    document.getElementById('authGate')?.classList.add('hidden');
    document.getElementById('appShell')?.classList.remove('hidden');
    document.documentElement.dataset.bootState = 'app';
    document.documentElement.dataset.mode = 'dark';
    document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach(e => e.remove());
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    document.querySelectorAll('div').forEach(e => {
      const t = e.textContent?.trim();
      if (t === "Couldn't reach the server. Check your connection and retry.") e.style.display = 'none';
    });
  });
  await p.screenshot({ path: 'C:/Users/Jiacheng/AppData/Local/Temp/opencode/verify-desktop.png', fullPage: true });
  console.log('desktop ok');
  await p.close();
}

async function shotMobileToolsOpen() {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 15000 });
  await p.evaluate(() => {
    document.getElementById('authGate')?.classList.add('hidden');
    document.getElementById('appShell')?.classList.remove('hidden');
    document.documentElement.dataset.bootState = 'app';
    document.documentElement.dataset.mode = 'dark';
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach(e => e.remove());
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    document.querySelectorAll('div').forEach(e => {
      const t = e.textContent?.trim();
      if (t === "Couldn't reach the server. Check your connection and retry.") e.style.display = 'none';
    });
  });
  const trigger = await p.$('.topic-input-wrap .attach-btn');
  if (trigger) await trigger.click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'C:/Users/Jiacheng/AppData/Local/Temp/opencode/verify-mobile-tools.png', fullPage: true });
  console.log('mobile tools ok');
  await p.close();
}

await shotMobile();
await shotDesktop();
await shotMobileToolsOpen();
await b.close();
