import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '.', server: { port: 5205, strictPort: true, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5205/?dev=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const nav = document.getElementById('sidebarNav');
  const kids = Array.from(nav.children).map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return el.id + ' top=' + Math.round(r.top) + ' order=' + cs.order + ' pos=' + cs.position + ' display=' + cs.display + ' h=' + Math.round(r.height);
  });
  return 'navKids=' + nav.children.length + '\n' + kids.join('\n') + '\nnavDisplay=' + getComputedStyle(nav).display + ' flexDir=' + getComputedStyle(nav).flexDirection;
});
console.log(info);
await browser.close();
await server.close();
console.log('DONE');
process.exit(0);
