import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const SHOT = 'C:/Users/Jiacheng/AppData/Local/Temp/opencode/shots/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(pathToFileURL('C:/Users/Jiacheng/Desktop/参考网站/ChatGPT.html').href, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
console.log('title=' + await page.title());
console.log('h1=' + await page.evaluate(() => Array.from(document.querySelectorAll('h1')).map((h) => h.innerText).join(' | ').slice(0, 500)));
await page.screenshot({ path: SHOT + 'ref-home.png' });
// scroll to composer area for a second shot
await page.evaluate(() => window.scrollBy(0, 400));
await page.waitForTimeout(500);
await page.screenshot({ path: SHOT + 'ref-home-scrolled.png' });
await browser.close();
console.log('DONE');
process.exit(0);
