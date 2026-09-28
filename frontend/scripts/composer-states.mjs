// scripts/composer-states.mjs — screenshot + geometry for every composer
// state on both surfaces, so a CSS migration can be diffed state by state.
//   node e2e/dist-server.mjs &
//   node scripts/composer-states.mjs <tag> [--width=1440] [--mode=dark|light]
// Output: debug/parity/composer-<tag>-<surface>-<state>-<w>-<mode>.png and
//         debug/parity/composer-<tag>.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';
import { gotoAndSettle } from '../e2e/_lib.mjs';

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const tag = process.argv[2] || 'now';
const width = Number(args.width || 1440);
const modes = args.mode ? [args.mode] : ['dark', 'light'];
const OUT = fileURLToPath(new URL('../debug/parity/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const ROLES = {
  wrap: '{w}',
  plus: '{w} .composer-tools-trigger',
  editor: '{w} .composer-editor-root',
  tiptap: '{w} .tiptap',
  chips: '{w} .composer-plugin-chips',
  chip: '{w} .composer-tool-chip',
  effort: '{w} .effort-trigger',
  mic: '{w} .mobile-mic-btn',
  send: '{w} #sendBtn, {w} #startBtn',
  attachments: '{w} .attachment-chips',
};

async function geometry(page, wrapSel) {
  return page.evaluate(({ roles, wrapSel }) => {
    const out = {};
    for (const [k, tpl] of Object.entries(roles)) {
      const el = document.querySelector(tpl.replaceAll('{w}', wrapSel));
      if (!el) { out[k] = null; continue; }
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      out[k] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        display: c.display, bg: c.backgroundColor, color: c.color, radius: c.borderRadius,
        border: `${c.borderTopWidth} ${c.borderTopColor}`, shadow: c.boxShadow, font: `${c.fontSize}/${c.lineHeight} ${c.fontFamily.split(',')[0]}` };
    }
    return out;
  }, { roles: ROLES, wrapSel });
}

const STATES = {
  empty: async () => {},
  text: async (page, s) => { await page.locator(`${s.wrap} .tiptap`).click(); await page.keyboard.type('Explain Bayes theorem with an example'); },
  multiline: async (page, s) => {
    await page.locator(`${s.wrap} .tiptap`).click();
    await page.keyboard.type('Line one');
    for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Shift+Enter'); await page.keyboard.type(`line ${i + 2}`); }
  },
  chip: async (page) => { await page.evaluate(() => { if (!window.webSearchOn) window.toggleWebSearch(); }); },
  chipText: async (page, s) => {
    await page.evaluate(() => { if (!window.webSearchOn) window.toggleWebSearch(); });
    await page.locator(`${s.wrap} .tiptap`).click();
    await page.keyboard.type('latest research on Bayesian inference');
  },
  attachment: async (page, s) => {
    await page.locator(s.file).setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  },
  stop: async (page, s) => {
    await page.evaluate((id) => { const b = document.getElementById(id); b?.classList.add('chat-stop'); }, s.send);
  },
  focus: async (page, s) => { await page.locator(`${s.wrap} .tiptap`).click(); },
};

const SURFACES = {
  topic: { wrap: '#topicInputWrap', file: '#topicAttachInput', send: 'startBtn' },
  chat: { wrap: '#chatInputWrap', file: '#attachInput', send: 'sendBtn' },
};

const browser = await chromium.launch();
const result = {};
try {
  for (const mode of modes) for (const [surface, s] of Object.entries(SURFACES)) for (const [state, run] of Object.entries(STATES)) {
    if (surface === 'topic' && state === 'stop') continue;
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => {
      localStorage.setItem('socrates-theme', m);
      localStorage.setItem('socrates-websearch', 'false');
    }, mode);
    await mockAuthedApp(page, { lang: 'zh' });
    await gotoAndSettle(page, 'http://127.0.0.1:4173/');
    await waitForAppShell(page);
    if (surface === 'chat') {
      await page.evaluate(() => {
        window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
        document.getElementById('topicSetup')?.classList.add('hidden');
        document.getElementById('mainInner')?.classList.add('hidden');
        document.getElementById('chatView')?.classList.remove('hidden');
        document.body.dataset.conversationActive = 'true';
      });
      await page.waitForTimeout(300);
    }
    await run(page, s);
    await page.waitForTimeout(450);
    const key = `${surface}-${state}-${width}-${mode}`;
    result[key] = await geometry(page, s.wrap);
    const box = await page.locator(s.wrap).boundingBox();
    if (box) {
      await page.screenshot({ path: `${OUT}composer-${tag}-${key}.png`,
        clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: box.width + 48, height: box.height + 48 } });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}composer-${tag}.json`, JSON.stringify(result, null, 1));
console.log(`wrote ${Object.keys(result).length} states → debug/parity/composer-${tag}.json`);
