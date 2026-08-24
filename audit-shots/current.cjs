const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const shots = [
    { url: 'http://127.0.0.1:5199/index', name: 'home', full: true },
    { url: 'http://127.0.0.1:5199/product', name: 'product', full: true },
    { url: 'http://127.0.0.1:5199/pricing', name: 'pricing', full: true },
    { url: 'http://127.0.0.1:5199/about', name: 'about', full: true },
    { url: 'http://127.0.0.1:5199/research', name: 'research', full: true },
    { url: 'http://127.0.0.1:5199/zh/index', name: 'zh-home', full: true },
    { url: 'http://127.0.0.1:5199/zh/product', name: 'zh-product', full: true },
  ];
  for (const s of shots) {
    for (const v of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
      const page = await ctx.newPage();
      try {
        await page.goto(s.url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(900);
        // force reveal animations to complete
        await page.evaluate(() => {
          document.querySelectorAll('.ed-reveal, .ed-reveal-stagger').forEach(el => el.classList.add('is-visible'));
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(600);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join('audit-shots', `${s.name}_${v.name}.png`), fullPage: s.full });
      } catch (e) {
        console.log('ERR', s.name, v.name, e.message);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
