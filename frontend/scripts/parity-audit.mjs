// scripts/parity-audit.mjs — PC UI audit against the chatgpt.com reference.
//
// Renders the built SPA (dist/ served by e2e/dist-server.mjs on :4173) with
// the mocked API, walks a scenario × viewport × theme × lang matrix, and for
// every scenario records (all under the gitignored debug/parity/):
//   - a PNG screenshot           → <scenario>-<w>-<mode>-<lang>.png
//   - geometry + computed styles → metrics.json
//   - layout defects (see detectDefects) → defects.json
//
// Usage:
//   node e2e/dist-server.mjs &           # serve dist/
//   node scripts/parity-audit.mjs [--quick] [--only=home,chat]
// ChatGPT reference values come from scripts/chatgpt-ref.mjs.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';
import { gotoAndSettle } from '../e2e/_lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const BASE = args.base || 'http://127.0.0.1:4173';
const OUT = fileURLToPath(new URL('../debug/parity/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const WIDTHS = args.quick ? [1440] : [1440, 1280, 1024];
const MODES = args.quick ? ['dark'] : ['dark', 'light'];
const LANGS = args.quick ? ['zh'] : ['zh', 'en'];

// Elements measured per scenario, keyed by role (same role names as
// scripts/chatgpt-ref.mjs so the two JSON files line up).
const SOCRATES_ROLES = {
  body: 'body',
  sidebar: '#sidebar, .sidebar',
  sidebarItem: '#sidebar .sidebar-nav-btn',
  topbar: '.top-bar',
  heroTitle: '#topicSetup h1, .cg-hero-title, .topic-title',
  composer: '#topicInputWrap:not(.hidden), #chatInputWrap',
  composerPlus: '#topicComposerToolsBtn, #chatComposerToolsBtn',
  composerSend: '#startBtn, #sendBtn',
  composerEditor: '.composer-editor-root',
  userBubble: '.msg.user .msg-body',
  assistantProse: '.msg.assistant .msg-body',
  msgToolbar: '.msg-toolbar',
  codeBlock: 'pre',
  menu: '[role="menu"]',
  dialog: '[role="dialog"]',
};


const STYLE_KEYS = [
  'display', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'borderRadius', 'borderTopWidth', 'borderTopColor',
  'boxShadow', 'padding', 'gap', 'maxWidth', 'transitionProperty',
  'transitionDuration', 'transitionTimingFunction', 'animationName', 'animationDuration',
];

async function measure(page, roles) {
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
      out[role] = {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height), style,
      };
    }
    return out;
  }, { roles, keys: STYLE_KEYS });
}

// Layout defects that indicate "错乱": CJK labels wrapped one glyph per line,
// controls in one composer row not vertically aligned, horizontal overflow,
// and interactive elements clipped by their container.
async function detectDefects(page) {
  return page.evaluate(() => {
    const defects = [];
    const visible = (n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const label = (n) => n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')}`;

    // 1. Buttons / chips whose text wrapped (height >> line-height).
    for (const n of document.querySelectorAll('button, [role="button"], [role="menuitem"], .chip, a')) {
      if (!visible(n)) continue;
      const text = (n.innerText || '').trim();
      if (!text || text.length > 40) continue;
      const cs = getComputedStyle(n);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      const r = n.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(n);
      const tops = [...range.getClientRects()].filter((q) => q.width > 0).map((q) => q.top).sort((a, b) => a - b);
      const lines = tops.reduce((acc, t) => (acc.length && t - acc[acc.length - 1] < lh * 0.6 ? acc : [...acc, t]), []).length;
      if (lines > 1 && r.height > lh * 1.8 && !text.includes('\n')) {
        defects.push({ kind: 'text-wrap', el: label(n), text, lines, h: Math.round(r.height) });
      }
    }

    // 2. Composer rows: every direct control must share a vertical centre.
    for (const wrap of document.querySelectorAll('#topicInputWrap, #chatInputWrap')) {
      if (!visible(wrap)) continue;
      if (wrap.classList.contains('composer-multiline')) continue;
      const ctrls = [...wrap.querySelectorAll('button, .composer-editor-root')]
        .filter((n) => visible(n) && !n.closest('[role="menu"], .attachment-chips'));
      const centres = ctrls.map((n) => {
        const r = n.getBoundingClientRect();
        return { el: label(n), c: Math.round(r.top + r.height / 2) };
      });
      const cs = centres.map((c) => c.c);
      if (cs.length && Math.max(...cs) - Math.min(...cs) > 6) {
        defects.push({ kind: 'composer-misaligned', el: label(wrap), centres,
          wrapH: Math.round(wrap.getBoundingClientRect().height) });
      }
    }

    // 3. Horizontal page overflow.
    const docW = document.documentElement.scrollWidth;
    if (docW > window.innerWidth + 1) {
      defects.push({ kind: 'page-overflow-x', scrollWidth: docW, viewport: window.innerWidth });
    }

    // 4. Controls clipped outside an overflow:hidden ancestor.
    for (const n of document.querySelectorAll('button')) {
      if (!visible(n)) continue;
      const r = n.getBoundingClientRect();
      let p = n.parentElement;
      while (p && p !== document.body) {
        const pcs = getComputedStyle(p);
        if (pcs.overflow === 'hidden' || pcs.overflowX === 'hidden') {
          const pr = p.getBoundingClientRect();
          if (pr.width > 0 && (r.right > pr.right + 2 || r.left < pr.left - 2)) {
            defects.push({ kind: 'clipped', el: label(n), container: label(p) });
          }
          break;
        }
        p = p.parentElement;
      }
    }
    return defects;
  });
}

const FIXTURE_MESSAGES = [
  { role: 'user', content: '用苏格拉底的方式帮我理解贝叶斯定理' },
  { role: 'assistant', content: [
    '## 先从一个例子开始',
    '',
    '假设某种病的患病率是 **1%**，检测准确率是 *99%*。你拿到阳性结果，真正患病的概率是多少？',
    '',
    '- 先验：$P(D)=0.01$',
    '- 似然：$P(+\\mid D)=0.99$',
    '',
    '$$P(D\\mid +)=\\frac{P(+\\mid D)P(D)}{P(+)}$$',
    '',
    '```python',
    'def posterior(prior, sens, fpr):',
    '    return sens * prior / (sens * prior + fpr * (1 - prior))',
    '```',
    '',
    '| 量 | 值 |',
    '| --- | --- |',
    '| 先验 | 0.01 |',
    '',
    '> 换个角度想想：100 个人里有几个真的患病？',
  ].join('\n') },
  { role: 'user', content: 'I think it is around 50%?' },
  { role: 'assistant', content: 'Good guess — let\'s count it out. Out of 10,000 people, how many are sick *and* test positive?' },
];

const SCENARIOS = {
  async home(page) {
    await page.evaluate(() => window.scrollTo(0, 0));
  },
  async chat(page) {
    await page.evaluate((raw) => {
      const messages = raw.map((m, i) => ({
        clientId: `audit-${i}`, role: m.role, type: m.role, rawText: m.content,
        html: typeof window.formatMsg === 'function' ? window.formatMsg(m.content) : `<p>${m.content}</p>`,
      }));
      const s = window.stateStore;
      s.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
      s.dispatch({ type: 'state/set', key: 'topic', value: '贝叶斯定理' });
      s.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      s.dispatch({ type: 'state/set', key: 'messages', value: messages });
      document.getElementById('topicSetup')?.classList.add('hidden');
      document.getElementById('mainInner')?.classList.add('hidden');
      document.getElementById('chatView')?.classList.remove('hidden');
      document.body.dataset.conversationActive = 'true';
      window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'parity-audit' });
    }, FIXTURE_MESSAGES);
    await page.waitForTimeout(800);
  },
  async plusMenu(page) {
    const btn = page.locator('#topicComposerToolsBtn:visible, #chatComposerToolsBtn:visible').first();
    await btn.click().catch(() => {});
    await page.waitForTimeout(400);
  },
  async effortMenu(page) {
    await page.locator('.effort-trigger:visible').first().click().catch(() => {});
    await page.waitForTimeout(400);
  },
  async cmdk(page) {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
  },
  async settings(page) {
    await page.evaluate(() => window.openSettings?.());
    await page.waitForTimeout(600);
  },
};

async function runSocrates(browser) {
  const only = typeof args.only === 'string' ? args.only.split(',') : Object.keys(SCENARIOS);
  const metrics = {};
  const defects = {};
  for (const w of WIDTHS) for (const mode of MODES) for (const lang of LANGS) {
    for (const name of only) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.addInitScript((m) => { try { localStorage.setItem('socrates-theme', m); } catch (_) {} }, mode);
      await mockAuthedApp(page, { lang });
      await gotoAndSettle(page, BASE + '/');
      await waitForAppShell(page);
      await SCENARIOS[name](page);
      const key = `${name}-${w}-${mode}-${lang}`;
      await page.screenshot({ path: `${OUT}${key}.png` });
      metrics[key] = await measure(page, SOCRATES_ROLES);
      const d = await detectDefects(page);
      if (d.length) defects[key] = d;
      await ctx.close();
      process.stdout.write(`${key}: ${d.length} defects\n`);
    }
  }
  writeFileSync(`${OUT}metrics.json`, JSON.stringify(metrics, null, 1));
  writeFileSync(`${OUT}defects.json`, JSON.stringify(defects, null, 1));
}


const browser = await chromium.launch();
try { await runSocrates(browser); } finally { await browser.close(); }
