/* perf/probe-has.mjs — find the CSS rules whose :has() makes a DOM insertion
 * inside a message body re-style the whole document. Diagnostic only. */
import { chromium } from '@playwright/test';
import { createBenchServer } from './bench-server.mjs';

const { server, SESSIONS } = createBenchServer({ latencyMs: 5 });
await new Promise((r) => server.listen(4392, '127.0.0.1', r));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
await context.addCookies([{ name: 'csrf', value: 'x', domain: '127.0.0.1', path: '/' }, { name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => { localStorage.setItem('socrates-appmode', 'chat'); localStorage.setItem('socrates-lang-app', 'zh'); localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() })); });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4392/');
await page.click(`.recent-item[data-recent-actual="${SESSIONS.long.id}"]`, { timeout: 30000 });
await page.waitForTimeout(4000);
const out = await page.evaluate(([PATS, REWRITE]) => {
  const rules = [];
  const walk = (list) => { for (const r of list) { if (r.selectorText && r.selectorText.includes(':has(')) rules.push(r); if (r.cssRules) walk(r.cssRules); } };
  for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (_) {} }
  const body = [...document.querySelectorAll('#msgList .msg.assistant .msg-body')].pop();
  const cost = () => {
    let total = 0;
    void document.body.offsetHeight;
    for (let i = 0; i < 15; i++) {
      const el = document.createElement('p');
      el.textContent = 'x';
      body.appendChild(el);
      const t0 = performance.now();
      void document.body.offsetHeight;
      total += performance.now() - t0;
      el.remove();
      void document.body.offsetHeight;
    }
    return total / 15;
  };
  const orig = rules.map((r) => r.selectorText);
  const disable = (idxs) => { for (const i of idxs) rules[i].selectorText = ':not(*)'; };
  const restore = () => { rules.forEach((r, i) => { r.selectorText = orig[i]; }); };
  const base = cost();
  const RW = REWRITE;
  if (RW.length) {
    const changed = [];
    rules.forEach((r, i) => { let t = orig[i]; for (const [a, b] of RW) t = t.split(a).join(b); if (t !== orig[i]) { r.selectorText = t; changed.push([orig[i].slice(0, 90), r.selectorText.slice(0, 90)]); } });
    const after = cost();
    const all = rules.map((_, i) => i); disable(all); const none2 = cost(); restore();
    return { base, after, none: none2, changed };
  }
  const pats = PATS;
  disable(rules.map((r, i) => i).filter((i) => pats.some((p) => orig[i].includes(p))));
  const without = cost();
  restore();
  if (pats.length) {
    const pset = rules.map((r, i) => i).filter((i) => pats.some((p) => orig[i].includes(p)));
    const more = [];
    for (let i = 0; i < rules.length; i++) {
      if (pset.includes(i)) continue;
      disable([...pset, i]);
      const c = cost();
      restore();
      if (without - c > 0.5) more.push([+(without - c).toFixed(2), orig[i]]);
    }
    more.sort((a, b) => b[0] - a[0]);
    return { count: rules.length, base, without, more };
  }
  disable(rules.map((_, i) => i));
  const none = cost();
  restore();
  /* Per-rule attribution: disable one at a time, keep the ones that matter. */
  const hits = [];
  for (let i = 0; i < rules.length; i++) {
    disable(rules.map((_, j) => j).filter((j) => j !== i));
    const c = cost();
    restore();
    if (c - none > 0.4) hits.push([+(c - none).toFixed(2), orig[i]]);
  }
  hits.sort((a, b) => b[0] - a[0]);
  return { count: rules.length, base, none, hits: hits.slice(0, 60) };
}, [JSON.parse(process.env.PATS || '[]'), JSON.parse(process.env.REWRITE || '[]')]);
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
