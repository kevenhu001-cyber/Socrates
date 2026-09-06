// Render the app shell without auth, with sidebar open, and screenshot
// each main surface (home, projects, plugins) for visual comparison.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:5174';
const OUT = 'C:\\Users\\Jiacheng\\Desktop\\Socrates\\tmp-shots';

async function boot(page) {
  // Set up initial state via localStorage so the boot script accepts us
  // as a known user and the sidebar opens by default.
  await page.addInitScript(() => {
    try {
      // Skip the auth boot by forcing bootState to 'app'.
      document.documentElement.dataset.bootState = 'app';
      // Open the sidebar.
      localStorage.setItem('socrates-sb', '1');
    } catch (_) {}
  });
}

async function prepare(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // Force the shell visible after the page boots.
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    document.documentElement.dataset.bootState = 'app';
    const gate = document.getElementById('authGate');
    const shell = document.getElementById('appShell');
    if (gate) gate.classList.add('hidden');
    if (shell) shell.classList.remove('hidden');
    document.body.classList.add('auth-bypassed');
    // Open the sidebar.
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('collapsed');
  });
  await page.waitForTimeout(600);
}

async function shot(page, name) {
  const out = `${OUT}\\${name}.png`;
  await page.screenshot({ path: out, fullPage: false });
  console.log('saved', out);
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await boot(page);

  // Home
  await prepare(page);
  await shot(page, 'cur-home');

  // Open projects
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('navProjects');
      if (btn) btn.click();
    });
    await page.waitForTimeout(900);
    await shot(page, 'cur-projects');
  } catch (e) { console.log('projects failed', e?.message); }

  // Open plugins
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('navPlugins');
      if (btn) btn.click();
    });
    await page.waitForTimeout(900);
    await shot(page, 'cur-plugins');
  } catch (e) { console.log('plugins failed', e?.message); }

  // Open scheduled
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('navScheduled');
      if (btn) btn.click();
    });
    await page.waitForTimeout(900);
    await shot(page, 'cur-scheduled');
  } catch (e) { console.log('scheduled failed', e?.message); }

  // Open library
  try {
    await page.evaluate(() => {
      const btn = document.getElementById('navLibrary');
      if (btn) btn.click();
    });
    await page.waitForTimeout(900);
    await shot(page, 'cur-library');
  } catch (e) { console.log('library failed', e?.message); }

  await browser.close();
})();
