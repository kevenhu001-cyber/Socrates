import { createServer } from 'vite';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const SHOT = 'C:/Users/Jiacheng/AppData/Local/Temp/opencode/shots/';
const REF = 'C:/Users/Jiacheng/Desktop/参考网站/';
const files = [
  'ChatGPT.html',
  'ChatGPT - 库.html',
  'ChatGPT Plugins _ Browse and add plugins to ChatGPT.html',
  '已安排任务.html',
];

const server = await createServer({ root: '.', server: { port: 5199, strictPort: true, host: '127.0.0.1' } });
await server.listen();
console.log('vite up');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 1. reference pages: visible text + screenshot
for (const f of files) {
  const url = pathToFileURL(REF + f).href;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const title = await page.title();
    const text = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 3000));
    console.log('=== ' + f + ' | title=' + title + ' ===');
    console.log(text);
    console.log('---END---');
    await page.screenshot({ path: SHOT + 'ref-' + f.replace(/[^\w]+/g, '_') + '.png' });
  } catch (e) {
    console.log('FAIL ' + f + ': ' + e.message);
  }
}

// 2. current app with dev bypass
await page.goto('http://127.0.0.1:5199/?dev=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3500);
console.log('APP bootState=' + await page.evaluate(() => document.documentElement.dataset.bootState));
console.log('APP gate hidden=' + await page.evaluate(() => document.getElementById('authGate')?.classList.contains('hidden')));
console.log('APP title text=' + await page.evaluate(() => document.getElementById('topicTitle')?.textContent));
await page.screenshot({ path: SHOT + 'app-home.png' });

// click plugins nav
try {
  await page.click('#navPlugins', { timeout: 5000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT + 'app-plugins.png' });
  console.log('plugins visible=' + await page.evaluate(() => !document.getElementById('pluginsPanel')?.classList.contains('hidden')));
} catch (e) { console.log('plugins nav fail: ' + e.message); }

await browser.close();
await server.close();
console.log('DONE');
process.exit(0);
