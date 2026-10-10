/**
 * P_emphasis-repair — regression coverage for "加粗没有被渲染" on CJK
 * phrases like **基尔霍夫电流定律（KCL）**.
 *
 * Weak models (and Chinese IMEs) emit bold in shapes CommonMark rejects:
 *   1. a stray ASCII space just inside the markers (`** 标题**`, `**标题 **`);
 *   2. fullwidth markers (`＊＊标题＊＊`, `＿＿标题＿＿`).
 * marked then leaks the raw markers into the answer instead of <strong>.
 * fixEmphasisMarkers (helpers.ts, wired into BOTH preprocessors) repairs
 * those shapes before marked runs. Every case runs through BOTH renderers
 * (live `formatMsgProgressive` with complete:true and the final
 * `formatMsg`), which must agree so nothing jumps at finish.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

/* Same DOM bootstrap as mathHeadingRepair.test.mjs: DOMPurify only
   exposes `.sanitize` when `window.document` exists, otherwise
   sanitizeHtml() fails closed to escHTML() and these assertions would
   be meaningless. */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Element', 'Node', 'NodeFilter', 'DocumentFragment', 'HTMLElement', 'HTMLTemplateElement']) {
  if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { formatMsg, formatMsgProgressive } = await import('../src/render/markdown.js');
const { fixEmphasisMarkers } = await import('../src/render/helpers.js');

function loadRealKatex() {
  const code = readFileSync(new URL('../src/vendor-files/katex/katex.min.js', import.meta.url), 'utf8');
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.katex;
}

function withRenderers(fn) {
  const prevK = globalThis.katex;
  const prevM = globalThis.marked;
  globalThis.katex = loadRealKatex();
  globalThis.marked = marked;
  try { return fn(); } finally {
    if (prevK === undefined) delete globalThis.katex; else globalThis.katex = prevK;
    if (prevM === undefined) delete globalThis.marked; else globalThis.marked = prevM;
  }
}

const both = (src) => ({
  final: formatMsg(src),
  live: formatMsgProgressive(src, { complete: true }),
});
const textOf = (html) => html.replace(/<[^>]+>/g, '');

const KCL = '基尔霍夫电流定律（KCL）';

/* ── the reported symptom ─────────────────────────────────────────── */

test('tight bold on a CJK parenthesized term renders (baseline)', () => {
  withRenderers(() => {
    const { final, live } = both(`**${KCL}**`);
    assert.match(final, new RegExp(`<strong>${KCL}</strong>`));
    assert.equal(live, final);
    assert.doesNotMatch(textOf(final), /\*\*/);
  });
});

/* ── stray inner spaces ────────────────────────────────────────────── */

for (const [name, src] of Object.entries({
  leadingSpace: `** ${KCL}**`,
  trailingSpace: `**${KCL} **`,
  bothSpaces: `**  ${KCL}  **`,
  midSentence: `重点是**${KCL} **，记住它。`,
  underscorePair: `__ ${KCL}__`,
})) {
  test(`inner spaces repaired: ${name}`, () => {
    withRenderers(() => {
      const { final, live } = both(src);
      assert.match(final, new RegExp(`<strong>${KCL}</strong>`), final);
      assert.equal(live, final);
      assert.doesNotMatch(textOf(final), /\*\*/);
    });
  });
}

/* ── fullwidth markers ─────────────────────────────────────────────── */

for (const [name, src] of Object.entries({
  fullwidthStars: `＊＊${KCL}＊＊`,
  fullwidthStarsSpaced: `＊＊ ${KCL} ＊＊`,
  fullwidthUnderscores: `＿＿${KCL}＿＿`,
  fullwidthUnderscoresSpaced: `＿＿ ${KCL} ＿＿`,
})) {
  test(`fullwidth markers normalized: ${name}`, () => {
    withRenderers(() => {
      const { final, live } = both(src);
      assert.match(final, new RegExp(`<strong>${KCL}</strong>`), final);
      assert.equal(live, final);
      assert.doesNotMatch(textOf(final), /＊|＿＿/);
    });
  });
}

/* ── bold coexists with math ───────────────────────────────────────── */

test('repaired bold coexists with inline math', () => {
  withRenderers(() => {
    const { final, live } = both(`重点是**${KCL} **，即 $\\sum I = 0$。`);
    assert.match(final, new RegExp(`<strong>${KCL}</strong>`));
    assert.match(final, /katex/);
    assert.equal(live, final);
  });
});

/* ── things that must NOT change ───────────────────────────────────── */

test('code spans and fences keep their literal **', () => {
  withRenderers(() => {
    const inline = both('`**不是加粗**`');
    assert.doesNotMatch(inline.final, /<strong>/);
    assert.match(inline.final, /<code>/);
    const fenced = formatMsg('```js\n**不是加粗**\n```');
    assert.doesNotMatch(fenced, /<strong>/);
    assert.match(fenced, /\*\*不是加粗\*\*/);
  });
});

test('a single fullwidth asterisk (multiplication) stays literal', () => {
  withRenderers(() => {
    const { final, live } = both('结果是 2＊3，不要加粗。');
    assert.doesNotMatch(final, /<strong>/);
    assert.match(final, /2＊3/);
    assert.equal(live, final);
  });
});

test('an unclosed run stays literal (streaming-safe scope)', () => {
  withRenderers(() => {
    const { final, live } = both(`**${KCL}`);
    assert.doesNotMatch(final, /<strong>/);
    assert.equal(live, final);
  });
});

test('triple-star emphasis is left to marked', () => {
  withRenderers(() => {
    const { final } = both(`***${KCL}***`);
    assert.match(final, /<strong>/);
  });
});

test('fixEmphasisMarkers is idempotent (it runs on every streaming frame)', () => {
  const inputs = [
    `**${KCL}**`,
    `** ${KCL}**`,
    `**${KCL} **`,
    `＊＊${KCL}＊＊`,
    `＿＿ ${KCL} ＿＿`,
    `重点是**${KCL} **，即 $\\sum I = 0$。`,
    '` code `',
    '```js\n**x**\n```',
  ];
  for (const src of inputs) {
    const once = fixEmphasisMarkers(src);
    assert.equal(fixEmphasisMarkers(once), once, JSON.stringify(src));
  }
});
