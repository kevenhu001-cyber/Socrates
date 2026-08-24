const { chromium } = require('playwright');
const fs = require('fs');

const OUT = 'audit-shots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1100 },
  { name: 'desktop', width: 1440, height: 900 }
];

const pages = [
  'index', 'product', 'pricing', 'about', 'research', 'developers',
  'learn', 'policy', 'announcements', 'contact', 'guide', 'documents',
  'research/memory-recall', 'zh/index', 'zh/product', 'zh/pricing', 'zh/about', 'zh/research'
];

(async () => {
  const browser = await chromium.launch();
  for (const v of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: v.name === 'desktop' ? 1 : 2
    });
    const page = await ctx.newPage();
    for (const p of pages) {
      try {
        await page.goto('http://127.0.0.1:5174/' + p, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(900);
        const safe = p.replace(/\//g, '-');
        // top of page
        await page.screenshot({ path: `${OUT}/${v.name}_${safe}_top.png`, fullPage: false });
        // full page
        await page.screenshot({ path: `${OUT}/${v.name}_${safe}_full.png`, fullPage: true });
        console.log('OK ' + v.name + ' ' + p);
      } catch (e) {
        console.log('ERR ' + v.name + ' ' + p + ': ' + e.message.split('\n')[0]);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });
