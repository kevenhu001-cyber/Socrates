import { chromium } from 'playwright';
import fs from 'node:fs';
const browser = await chromium.launch({ proxy: { server: 'http://127.0.0.1:7890' }, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto('https://web.archive.org/web/20261001162129id_/https://openai.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(7000);
await p.evaluate(() => {
  for (const sel of ['#wm-ipp-base', '#wm-ipp', '#donato', '.wb-autocomplete-suggestions', 'iframe[src*="archive.org/static"]']) {
    document.querySelectorAll(sel).forEach((el) => el.remove());
  }
});
const info = await p.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140),
      font: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing,
      bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius,
      rect: { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width) },
      cls: el.className && el.className.toString().slice(0, 120),
      tag: el.tagName,
    };
  };
  return {
    title: document.title,
    url: location.href,
    height: document.documentElement.scrollHeight,
    nav: [...document.querySelectorAll('header a')].slice(0, 20).map((a) => a.textContent.trim().replace(/\s+/g, ' ')),
    h1: pick('h1'),
    h2s: [...document.querySelectorAll('h2')].slice(0, 12).map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 100)),
    body: pick('body'),
    sections: [...document.querySelectorAll('main > *, body > div > main > *')].slice(0, 20).map((s) => ({ tag: s.tagName, cls: String(s.className).slice(0, 100), h: Math.round(s.getBoundingClientRect().height) })),
  };
});
fs.writeFileSync('/tmp/openai-archive.html', await p.content());
console.log(JSON.stringify({ errors, info }, null, 2));
await p.screenshot({ path: '/tmp/openai-top.png' });
await p.evaluate(async () => {
  document.documentElement.style.scrollBehavior = 'auto';
  const step = Math.round(innerHeight * 0.75);
  for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
    scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 160));
  }
  scrollTo(0, 0);
});
await p.waitForTimeout(1500);
const style = await p.evaluate(() => {
  const s = document.createElement('style');
  s.textContent = '*{transition:none!important;animation:none!important}';
  document.head.appendChild(s);
  return true;
});
await p.screenshot({ path: '/tmp/openai-full.png', fullPage: true });
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/openai-mobile-top.png' });
await p.screenshot({ path: '/tmp/openai-mobile-full.png', fullPage: true });
await browser.close();
