const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const BASE = 'http://127.0.0.1:4173';
const OUT  = path.join(__dirname, 'site-screenshots');
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ['privacy', '/privacy.html'],
  ['terms',   '/terms.html'],
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
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        const page = await ctx.newPage();
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
        await page.evaluate(() => {
          document.querySelectorAll('.xa-reveal, .mk-reveal, .sr').forEach(el => {
            el.classList.add('is-visible'); el.classList.add('in');
            el.style.opacity = '1'; el.style.transform = 'none';
          });
        });
        await page.waitForTimeout(300);
        const out = path.join(OUT, `${name}-${vname}.png`);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`[200] ${vname} ${route}  ->  ${out}`);
        await ctx.close();
      }
    }
  } finally { await browser.close(); }
})();
