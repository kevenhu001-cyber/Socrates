
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 }
  ];
  const pages = ['index', 'product', 'pricing', 'about', 'research', 'developers', 'learn', 'policy', 'announcements', 'contact', 'guide', 'documents'];
  for (const v of viewports) {
    for (const p of pages) {
      try {
        const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
        const page = await ctx.newPage();
        await page.goto('http://127.0.0.1:5174/' + p, { waitUntil: 'networkidle', timeout: 8000 });
        await page.waitForTimeout(800);
        // Take 3 viewport-height scrolls
        for (let i = 0; i < 3; i++) {
          await page.evaluate((y) => window.scrollTo(0, y), i * v.height);
          await page.waitForTimeout(200);
          const filename = 'tmp-shots/' + v.name + '_' + p + '_' + i + '.png';
          await page.screenshot({ path: filename, fullPage: false });
        }
        await ctx.close();
      } catch (e) {
        console.log('ERR ' + v.name + ' ' + p + ': ' + e.message);
      }
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
