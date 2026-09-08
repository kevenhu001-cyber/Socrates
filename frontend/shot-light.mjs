import { createServer } from 'vite';
import { chromium } from 'playwright';

const SHOT = 'C:/Users/Jiacheng/AppData/Local/Temp/opencode/shots/';
const server = await createServer({ root: '.', server: { port: 5201, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5201/?dev=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
// switch to light mode like a user would (persisted pref + reload for pre-paint path)
await page.evaluate(() => { try { localStorage.setItem('socrates-theme', 'light'); } catch (_) {} });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
console.log('mode=' + await page.evaluate(() => document.documentElement.getAttribute('data-mode')));
await page.screenshot({ path: SHOT + 'app-home-light.png' });
await browser.close();
await server.close();
console.log('DONE');
process.exit(0);
