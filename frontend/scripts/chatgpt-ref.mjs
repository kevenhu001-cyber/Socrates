// scripts/chatgpt-ref.mjs — capture chatgpt.com reference metrics over CDP.
// Requires a *headed* Chrome with --remote-debugging-port (headless is
// blocked by Cloudflare). Writes docs/ref/chatgpt-metrics.json and
// debug/parity/chatgpt-*.png.
//   DISPLAY=:99 google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/cg-profile &
//   node scripts/chatgpt-ref.mjs [--cdp=http://127.0.0.1:9222]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cdp = (process.argv.find((a) => a.startsWith('--cdp=')) || '--cdp=http://127.0.0.1:9222').slice(6);
const OUT = fileURLToPath(new URL('../debug/parity/', import.meta.url));
const REF = fileURLToPath(new URL('../../docs/ref/', import.meta.url));
mkdirSync(OUT, { recursive: true });
mkdirSync(REF, { recursive: true });

const KEYS = ['display', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'borderRadius', 'borderTopWidth', 'borderTopColor', 'boxShadow',
  'padding', 'gap', 'maxWidth', 'transitionProperty', 'transitionDuration',
  'transitionTimingFunction', 'animationName', 'animationDuration', 'backdropFilter'];

const ROLES = {
  body: 'body',
  main: 'main',
  sidebar: '#stage-slideover-sidebar, nav[aria-label="Chat history"]',
  sidebarNav: 'nav',
  sidebarItem: 'nav a[data-testid="create-new-chat-button"], nav a',
  sidebarToggle: '[data-testid="close-sidebar-button"], button[aria-label*="sidebar" i]',
  topbar: 'header#page-header, main header, header',
  modelSwitcher: '[data-testid="model-switcher-dropdown-button"], header button',
  heroTitle: 'main h1',
  composerForm: 'form',
  composer: 'form [class*="composer"], form > div > div, form > div',
  composerPlus: '[data-testid="composer-plus-btn"], form button',
  composerEditor: '#prompt-textarea',
  composerSend: '#composer-submit-button, [data-testid="send-button"], [data-testid="composer-speech-button"]',
  composerMic: 'button[aria-label*="Dictate" i], button[aria-label*="dictation" i]',
  suggestionChip: 'main button.btn, main [class*="rounded-full"][class*="border"]',
  footerNote: 'main .text-token-text-secondary, main [class*="text-xs"]',
  menu: '[role="menu"]',
  menuItem: '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"]',
  dialog: '[role="dialog"]',
};

async function measure(page) {
  return page.evaluate(({ roles, keys }) => {
    const out = {};
    for (const [role, sel] of Object.entries(roles)) {
      const el = [...document.querySelectorAll(sel)].find((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) { out[role] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const style = {};
      for (const k of keys) style[k] = cs[k];
      out[role] = { sel: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 6).join('.')}`,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), style };
    }
    return out;
  }, { roles: ROLES, keys: KEYS });
}

async function cssVars(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = new Set();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => {
        for (const r of list) {
          if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p);
          if (r.cssRules) walk(r.cssRules);
        }
      };
      walk(rules);
    }
    const wanted = /^--(main-surface|sidebar|text-|border|bg-|message|composer|interactive|icon|surface|link|spacing|radius|cot|thread|screen|header|menu|popover|elevation|shadow|ease|duration)/;
    const out = {};
    for (const n of [...names].sort()) {
      if (!wanted.test(n)) continue;
      const v = cs.getPropertyValue(n).trim();
      if (v) out[n] = v;
    }
    return out;
  });
}

const browser = await chromium.connectOverCDP(cdp);
const ctx = browser.contexts()[0];
const result = {};
for (const scheme of ['light', 'dark']) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#prompt-textarea', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const entry = { vars: await cssVars(page), states: {} };
  entry.states.home = await measure(page);
  await page.screenshot({ path: `${OUT}chatgpt-home-1440-${scheme}.png` });

  // Hover a sidebar item.
  const item = page.locator('nav a').nth(1);
  await item.hover().catch(() => {});
  await page.waitForTimeout(300);
  entry.states.sidebarHover = await page.evaluate(() => {
    const a = document.querySelectorAll('nav a')[1];
    if (!a) return null;
    const cs = getComputedStyle(a); const r = a.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), bg: cs.backgroundColor, radius: cs.borderRadius,
      padding: cs.padding, fontSize: cs.fontSize, transition: cs.transition };
  });

  // Focus + type into composer.
  await page.locator('#prompt-textarea').click().catch(() => {});
  await page.keyboard.type('Explain Bayes theorem with an example', { delay: 5 });
  await page.waitForTimeout(400);
  entry.states.typing = await measure(page);
  await page.screenshot({ path: `${OUT}chatgpt-typing-1440-${scheme}.png` });
  // Multiline.
  for (let i = 0; i < 4; i++) { await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift'); await page.keyboard.type('line ' + i); }
  await page.waitForTimeout(400);
  entry.states.multiline = await measure(page);
  await page.screenshot({ path: `${OUT}chatgpt-multiline-1440-${scheme}.png` });
  await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');

  // + menu.
  const plus = page.locator('[data-testid="composer-plus-btn"]').first();
  if (await plus.count()) {
    await plus.click().catch(() => {});
    await page.waitForTimeout(250);
    entry.states.plusMenuOpening = await measure(page);
    await page.waitForTimeout(500);
    entry.states.plusMenu = await measure(page);
    await page.screenshot({ path: `${OUT}chatgpt-plusmenu-1440-${scheme}.png` });
    await page.keyboard.press('Escape');
  }

  // Model switcher menu.
  const ms = page.locator('[data-testid="model-switcher-dropdown-button"], header button').first();
  await ms.click().catch(() => {});
  await page.waitForTimeout(600);
  entry.states.modelMenu = await measure(page);
  await page.screenshot({ path: `${OUT}chatgpt-modelmenu-1440-${scheme}.png` });
  await page.keyboard.press('Escape');

  // Collapsed sidebar.
  const tog = page.locator('[data-testid="close-sidebar-button"], button[aria-label*="Close sidebar" i]').first();
  if (await tog.count()) {
    await tog.click().catch(() => {});
    await page.waitForTimeout(700);
    entry.states.sidebarCollapsed = await measure(page);
    await page.screenshot({ path: `${OUT}chatgpt-collapsed-1440-${scheme}.png` });
  }
  result[scheme] = entry;
  await page.close();
  process.stdout.write(`${scheme}: ${Object.keys(entry.vars).length} vars\n`);
}
writeFileSync(`${REF}chatgpt-metrics.json`, JSON.stringify(result, null, 1));
process.exit(0);
