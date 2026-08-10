// Tiny screenshot helper for the marketing site.
// Renders the same pages a human would visit, in two viewports, and
// drops PNGs into site-screenshots/ so we can verify the redesign
// without round-tripping through a browser UI.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT  = path.join(__dirname, 'site-screenshots');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['home',     '/index.html'],
  ['product',  '/product.html'],
  ['pricing',  '/pricing.html'],
  ['guide',    '/guide.html'],
  ['apikeys',  '/api-keys.html'],
  ['account',  '/account.html'],
];

const VIEWPORTS = [
  ['desktop', 1280, 800],
  ['mobile',  390,  844],
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const [name, route] of ROUTES) {
      for (const [vname, w, h] of VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        const url = BASE + route;
        try {
          const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
          const status = resp ? resp.status() : 0;
          // Force all scroll-reveal elements into their final state — fullPage
          // screenshots render the whole page in one frame, so the
          // IntersectionObserver never fires for off-screen items.
          await page.evaluate(() => {
            document.querySelectorAll('.xa-reveal, .mk-reveal, .sr').forEach(function (el) {
              el.classList.add('is-visible');
              el.classList.add('in');
              el.style.opacity = '1';
              el.style.transform = 'none';
            });
          });
          // Wait a tick so fonts + reveal animations settle.
          await page.waitForTimeout(400);
          const out = path.join(OUT, `${name}-${vname}.png`);
          await page.screenshot({ path: out, fullPage: true });
          console.log(`[${status}] ${vname.padEnd(7)} ${route}  ->  ${out}`);
        } catch (e) {
          console.error(`ERR  ${vname} ${route} :: ${e.message}`);
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
})();
