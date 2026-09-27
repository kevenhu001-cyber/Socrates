/* perf/probe-churn.mjs — which transcript nodes get removed / rewritten while
 * an answer streams in a long session? Diagnostic only. */
import { chromium } from '@playwright/test';
import { createBenchServer } from './bench-server.mjs';

const { server, SESSIONS } = createBenchServer({ latencyMs: 40 });
await new Promise((r) => server.listen(4394, '127.0.0.1', r));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
await context.addCookies([{ name: 'csrf', value: 'x', domain: '127.0.0.1', path: '/' }, { name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => { localStorage.setItem('socrates-appmode', 'chat'); localStorage.setItem('socrates-lang-app', 'zh'); localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() })); });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
await page.goto('http://127.0.0.1:4394/');
await page.click(`.recent-item[data-recent-actual="${SESSIONS.long.id}"]`, { timeout: 30000 });
await page.waitForTimeout(5000);
await page.evaluate(() => {
  const list = document.getElementById('msgList');
  const P = (window.__probe = { removed: {}, added: {}, htmlWrites: 0, rowsRemoved: 0 });
  const label = (n) => (n.nodeType === 1 ? (n.tagName + '.' + String(n.className || '').split(' ').slice(0, 2).join('.')) : '#' + n.nodeType);
  const rowOf = (n) => { let e = n.nodeType === 1 ? n : n.parentElement; while (e && e.parentElement !== list) e = e.parentElement; return e; };
  const idx = (row) => row ? Array.prototype.indexOf.call(list.children, row) - list.children.length : 'x';
  new MutationObserver((recs) => {
    for (const r of recs) {
      const row = rowOf(r.target);
      const where = r.target === list ? 'LIST' : 'row' + idx(row);
      for (const n of r.removedNodes) { const k = where + ' ' + label(r.target) + ' -' + label(n); P.removed[k] = (P.removed[k] || 0) + 1; if (r.target === list) P.rowsRemoved++; }
      for (const n of r.addedNodes) { const k = where + ' ' + label(r.target) + ' +' + label(n); P.added[k] = (P.added[k] || 0) + 1; }
    }
  }).observe(list, { childList: true, subtree: true });
  const cls = (el) => el.tagName + '.' + String(el.getAttribute && el.getAttribute('class') || '').split(' ').slice(0, 2).join('.');
  const rowIdx = (el) => { const r = rowOf(el); return r ? idx(r) : (el.closest && el.closest('#msgList') ? 'list' : 'out'); };
  P.writes = {};
  const bump = (k) => { P.writes[k] = (P.writes[k] || 0) + 1; };
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', { configurable: true, get: d.get, set(v) { bump('innerHTML ' + rowIdx(this) + ' ' + cls(this)); return d.set.call(this, v); } });
  const sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { if (this.closest && this.closest('#msgList')) bump('attr:' + n + ' ' + rowIdx(this) + ' ' + cls(this)); return sa.call(this, n, v); };
  const cn = Object.getOwnPropertyDescriptor(Element.prototype, 'className');
  Object.defineProperty(Element.prototype, 'className', { configurable: true, get: cn.get, set(v) { if (this.closest && this.closest('#msgList')) bump('className ' + rowIdx(this) + ' ' + cls(this)); return cn.set.call(this, v); } });
  const zone = (n) => { let e = n.nodeType === 1 ? n : n.parentElement; while (e && !e.id) e = e.parentElement; return e ? e.id : '?'; };
  P.zones = {}; P.attrs = {};
  new MutationObserver((recs) => {
    for (const r of recs) {
      const z = zone(r.target);
      if (z === 'msgList' || (r.target.closest && r.target.closest('#msgList'))) continue;
      const k = r.type + ' ' + z + (r.type === 'attributes' ? ' @' + r.attributeName : '');
      P.zones[k] = (P.zones[k] || 0) + 1;
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
});
await page.fill('#chatComposerRoot .rich-composer-editor', 'probe churn 请继续');
await page.click('#sendBtn');
await page.waitForFunction(() => document.getElementById('msgList').textContent.includes('STREAMEND'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(() => {
  const P = window.__probe;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return { writes: top(P.writes) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
