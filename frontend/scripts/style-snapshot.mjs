// scripts/style-snapshot.mjs — dump computed styles for every visible
// element under the given roots, so a CSS migration can be diffed
// property by property.
//   node scripts/style-snapshot.mjs <tag> [--width=1440] [--roots=#sidebar,.top-bar] [--scene=chat]
//   node scripts/style-snapshot.mjs --diff <tagA> <tagB>
// Output: debug/parity/style-<tag>.json (needs e2e/dist-server.mjs on :4173)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';
import { gotoAndSettle } from '../e2e/_lib.mjs';

const OUT = fileURLToPath(new URL('../debug/parity/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);

if (argv[0] === '--diff') {
  const [a, b] = [argv[1], argv[2]].map((t) => JSON.parse(readFileSync(`${OUT}style-${t}.json`, 'utf8')));
  let n = 0;
  for (const state of Object.keys(a)) {
    const keys = new Set([...Object.keys(a[state]), ...Object.keys(b[state] || {})]);
    for (const k of keys) {
      const x = a[state][k]; const y = b[state]?.[k];
      if (!x || !y) { console.log(`${state} ${k}: ${x ? 'removed' : 'added'}`); n += 1; continue; }
      for (const p of Object.keys(x)) {
        if (x[p] !== y[p]) { console.log(`${state} ${k} ${p}: ${x[p]} → ${y[p]}`); n += 1; }
      }
    }
  }
  console.log(`${n} differences`);
  process.exit(0);
}

const tag = argv[0] || 'now';
const opts = Object.fromEntries(argv.slice(1).map((s) => s.replace(/^--/, '').split('=')));
const width = Number(opts.width || 1440);
const roots = (opts.roots || '#sidebar,.top-bar,.main').split(',');
const PROPS = ['display', 'position', 'top', 'left', 'z-index', 'box-sizing', 'width', 'height', 'min-height',
  'padding', 'margin', 'gap', 'flex-direction', 'align-items', 'justify-content', 'order', 'overflow-y',
  'background-color', 'color', 'border-top', 'border-right', 'border-bottom', 'border-radius', 'box-shadow',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'opacity', 'transform',
  'transition-property', 'transition-duration', 'visibility', 'white-space', 'text-overflow'];

const CHAT = [
  { role: 'user', content: '用苏格拉底的方式帮我理解贝叶斯定理' },
  { role: 'assistant', content: [
    '<think>用户想要直觉。先给具体数字，再引出公式。</think>',
    '',
    '## 先从一个例子开始',
    '',
    '假设某种病的患病率是 **1%**，检测准确率是 *99%*，结果为 `阳性`。你拿到阳性结果，真正患病的概率是多少？',
    '',
    '1. 先验：$P(D)=0.01$',
    '2. 似然：$P(+\\mid D)=0.99$',
    '',
    '- 换个角度想想',
    '- 100 个人里有几个真的患病？',
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
    '| 灵敏度 | 0.99 |',
    '',
    '> 换个角度想想：100 个人里有几个真的患病？',
    '',
    '### 小结',
    '',
    '先验很小的时候，即使检测很准，阳性结果也可能多数是假阳性。参见 [Bayes](https://example.test)。',
  ].join('\n') },
  { role: 'user', content: 'I think it is around 50%? Let me write a longer message so the bubble has to wrap onto a second line and we can see how wide it grows.' },
  { role: 'assistant', content: 'Good guess — let us count it out. Out of 10,000 people, how many are sick *and* test positive?' },
];

const SESSIONS = Array.from({ length: 6 }, (_, i) => ({
  id: `s${i}`, title: ['贝叶斯定理', '导数的几何意义', '光合作用', '牛顿第二定律', 'Python 列表推导', '英语时态'][i],
  updatedAt: new Date(Date.now() - i * 3600e3).toISOString(), createdAt: new Date().toISOString(), messageCount: 4,
}));

const browser = await chromium.launch();
const result = {};
try {
  for (const mode of ['dark', 'light']) for (const collapsed of (opts.scene === 'chat' ? [false] : [false, true])) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript((m) => localStorage.setItem('socrates-theme', m), mode);
    await mockAuthedApp(page, { lang: 'zh' });
    await page.route('**/api/**/sessions**', (r) => (r.request().method() === 'GET'
      ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ sessions: SESSIONS }) }) : r.fallback()));
    await gotoAndSettle(page, 'http://127.0.0.1:4173/');
    await waitForAppShell(page);
    await page.waitForTimeout(500);
    if (collapsed) { await page.evaluate(() => window.toggleSidebar()); await page.waitForTimeout(600); }
    if (opts.scene === 'chat') {
      await page.evaluate((raw) => {
        const messages = raw.map((m, i) => ({ clientId: `snap-${i}`, role: m.role, type: m.role, rawText: m.content,
          html: window.formatMsg ? window.formatMsg(m.content) : `<p>${m.content}</p>` }));
        const s = window.stateStore;
        s.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
        s.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
        s.dispatch({ type: 'state/set', key: 'messages', value: messages });
        document.getElementById('topicSetup')?.classList.add('hidden');
        document.getElementById('mainInner')?.classList.add('hidden');
        document.getElementById('chatView')?.classList.remove('hidden');
        document.body.dataset.conversationActive = 'true';
        window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'style-snapshot' });
      }, CHAT);
      await page.waitForTimeout(1200);
      await page.evaluate(() => { const l = document.getElementById('msgList'); if (l) l.scrollTop = 0; });
      await page.waitForTimeout(200);
    }
    const state = `${mode}-${collapsed ? 'collapsed' : 'open'}`;
    result[state] = await page.evaluate(({ roots, PROPS }) => {
      const out = {};
      const keyOf = (n) => {
        const parts = [];
        for (let e = n; e && e !== document.body && parts.length < 4; e = e.parentElement) {
          if (e.id) { parts.unshift(`#${e.id}`); break; }
          const idx = e.parentElement ? [...e.parentElement.children].indexOf(e) : 0;
          parts.unshift(`${e.tagName.toLowerCase()}${e.classList[0] ? `.${e.classList[0]}` : ''}:${idx}`);
        }
        return parts.join('>');
      };
      for (const sel of roots) {
        for (const root of document.querySelectorAll(sel)) {
          for (const n of [root, ...root.querySelectorAll('*')]) {
            if (n.closest('svg') && n.tagName.toLowerCase() !== 'svg') continue;
            const r = n.getBoundingClientRect();
            const cs = getComputedStyle(n);
            if (cs.display === 'none' && n !== root) { out[keyOf(n)] = { display: 'none' }; continue; }
            const rec = { rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` };
            for (const p of PROPS) rec[p] = cs.getPropertyValue(p);
            out[keyOf(n)] = rec;
          }
        }
      }
      return out;
    }, { roots, PROPS });
    await page.screenshot({ path: `${OUT}style-${tag}-${state}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}style-${tag}.json`, JSON.stringify(result));
console.log(`wrote ${Object.values(result).reduce((a, s) => a + Object.keys(s).length, 0)} element records → style-${tag}.json`);
