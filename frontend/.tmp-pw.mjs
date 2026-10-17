// TEMP verification harness (not committed): drive the built SPA with the
// repo's own Playwright API mock, using the on-disk puppeteer Chrome.
import { chromium } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './e2e/_mock-api.mjs';

const EXEC = '/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome';
const BASE = 'http://127.0.0.1:4173';

const viewport = { width: 1440, height: 900 };

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
await mockAuthedApp(page, { lang: 'en' });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await waitForAppShell(page);
await page.waitForTimeout(800);

const metrics = await page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), radius: cs.borderRadius, bg: cs.backgroundColor };
  };
  return {
    boot: document.documentElement.dataset.bootState,
    lang: document.documentElement.lang,
    theme: document.documentElement.dataset.theme,
    sidebar: r('#sidebar'),
    composerWrap: r('#composerInputWrap'),
    composerTools: r('#composerToolsBtn'),
    composerPrimary: r('#composerPrimaryBtn'),
    topicTitle: r('#topicTitle'),
    modelSwitcher: r('#topModelSwitcher'),
  };
});
console.log('METRICS', JSON.stringify(metrics, null, 2));

await page.screenshot({ path: 'test-results/_tmp-verify/landing.png', fullPage: false });
console.log('shot written');

await browser.close();
