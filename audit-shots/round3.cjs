const { chromium } = require('playwright');
const path = require('path');
const pages = [
  ['pricing', 'pricing'], ['about', 'about'], ['research', 'research'],
  ['learn', 'learn'], ['developers', 'developers'], ['policy', 'policy'],
  ['contact', 'contact'], ['guide', 'guide'], ['documents', 'documents'],
  ['announcements', 'announcements'], ['research/memory-recall/', 'article'],
  ['zh/index', 'zh-home'], ['zh/product', 'zh-product'], ['zh/pricing', 'zh-pricing'],
  ['zh/about', 'zh-about'], ['zh/research', 'zh-research'],
];
(async () => {
  const browser = await chromium.launch();
  for (const [url, name] of pages) {
    for (const v of [{ n: 'desktop', w: 1440, h: 900 }, { n: 'mobile', w: 390, h: 844 }]) {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } });
      const page = await ctx.newPage();
      try {
        await page.goto('http://127.0.0.1:5199/' + url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(1100);
        await page.evaluate(() => {
          document.querySelectorAll('.ed-reveal, .ed-reveal-stagger, .ed-reveal-paragraphs, .ed-chat-thread, .ed-path-timeline').forEach(el => el.classList.add('is-visible'));
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join('audit-shots', `r3_${name}_${v.n}_full.png`), fullPage: true });
      } catch (e) { console.log('ERR', name, v.n, e.message); }
      await ctx.close();
    }
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
