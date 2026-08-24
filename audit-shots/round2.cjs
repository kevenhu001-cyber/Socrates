const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const shots = [
    { url: 'http://127.0.0.1:5199/index', name: 'home' },
    { url: 'http://127.0.0.1:5199/product', name: 'product' },
    { url: 'http://127.0.0.1:5199/pricing', name: 'pricing' },
    { url: 'http://127.0.0.1:5199/about', name: 'about' },
    { url: 'http://127.0.0.1:5199/research', name: 'research' },
    { url: 'http://127.0.0.1:5199/zh/index', name: 'zh-home' },
    { url: 'http://127.0.0.1:5199/zh/product', name: 'zh-product' },
  ];
  for (const s of shots) {
    for (const v of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
      const page = await ctx.newPage();
      try {
        await page.goto(s.url, { waitUntil: 'load', timeout: 30000, timeout: 15000 });
        await page.waitForTimeout(900);
        await page.evaluate(() => {
          document.querySelectorAll('.ed-reveal, .ed-reveal-stagger, .ed-reveal-paragraphs, .ed-chat-thread, .ed-path-timeline').forEach(el => el.classList.add('is-visible'));
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join('audit-shots', `${s.name}_${v.name}_full.png`), fullPage: true });
        // viewport-only top shot (no sticky artifacts)
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join('audit-shots', `${s.name}_${v.name}_top.png`), fullPage: false });
      } catch (e) {
        console.log('ERR', s.name, v.name, e.message);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
