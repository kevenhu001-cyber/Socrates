/**
 * P_numeric-math + P_heading-repair — regression coverage for the two
 * "raw markdown leaks into the answer" reports:
 *   1. letter-free inline formulas (`$1/2$`, `$3+4=7$`) stayed as raw text;
 *   2. `## 标题` headings rendered as prose in shapes models emit (glued to
 *      the previous sentence, invisible / fullwidth lead-in, over-indented,
 *      wrapped in `**`, `##4. 标题`).
 * Every case runs through BOTH renderers (live `formatMsgProgressive` and the
 * final `formatMsg`), which must agree so nothing jumps at finish.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

/* DOMPurify is bundled by Vite (no CDN global) and only exposes `.sanitize`
   when `window.document` exists — otherwise it reports isSupported:false and
   sanitizeHtml() fails closed to escHTML(), which would escape every tag and
   make these assertions meaningless. Stand up a DOM before importing the
   renderers so they run under the same conditions as the browser. Same
   pattern as test/messageOps.test.mjs. */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Element', 'Node', 'NodeFilter', 'DocumentFragment', 'HTMLElement', 'HTMLTemplateElement']) {
  if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { formatMsg, formatMsgProgressive, replaceInlineDollarMath, _looksLikeNumericMath } = await import('../src/render/markdown.js');
const { fixHeadingMarkers } = await import('../src/render/helpers.js');

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

/** TeX sources KaTeX rendered, in order.
 *
 *  KaTeX emits `<annotation encoding="application/x-tex">…</annotation>` as a
 *  sibling of the visible HTML, but DOMPurify strips that tag (it is not in the
 *  allow-list) — in the browser too, not just here. The MathML block keeps the
 *  raw TeX as its trailing text node, so read the source from there instead.
 */
const formulas = (html) => {
  const doc = new dom.window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return [...doc.querySelectorAll('math')].map((math) => {
    // The structured MathML children come first; the raw TeX source is the
    // text that follows the last child element inside <math>.
    let source = '';
    for (const node of math.childNodes) {
      if (node.nodeType === dom.window.Node.TEXT_NODE) source += node.nodeValue;
    }
    return source.trim();
  });
};
const both = (src) => ({
  final: formatMsg(src),
  live: formatMsgProgressive(src, { complete: true }),
});

/* ── numeric inline math ────────────────────────────────────────────── */

test('letter-free inline formulas render in both renderers', () => {
  withRenderers(() => {
    const { final, live } = both('概率是 $1/2$，另一个是 $3+4=7$，还有 $2^{10}$、$0.5$、$5$ 和 $-1$。');
    const expected = ['1/2', '3+4=7', '2^{10}', '0.5', '5', '-1'];
    assert.deepEqual(formulas(final), expected);
    assert.deepEqual(formulas(live), expected);
    assert.doesNotMatch(final, /\$1\/2\$/);
  });
});

test('currency amounts stay literal (pandoc dollar rule)', () => {
  withRenderers(() => {
    for (const src of [
      '价格从 $5 到 $10，或者 $5-$10，还有 $1,000。',
      'costs $5 and $10 each',
      'Pay $1,000.50 or $5+ tax',
      'between $5, $10 and $20',
    ]) {
      const { final, live } = both(src);
      assert.deepEqual(formulas(final), [], `final: ${src}`);
      assert.deepEqual(formulas(live), [], `live: ${src}`);
      assert.match(final, /\$5/);
    }
  });
});

test('a currency amount before a formula no longer swallows its opening $', () => {
  withRenderers(() => {
    for (const src of ['花了 $5，概率 $1/2$', '从 $5 涨到 $8，涨幅 $3/5$', '价格 \\$5，概率 $1/2$']) {
      const { final, live } = both(src);
      assert.equal(formulas(final).length, 1, `final: ${src} → ${formulas(final)}`);
      assert.deepEqual(formulas(final), formulas(live), src);
      assert.match(final.replace(/<[^>]+>/g, ''), /\$5|\$8/);
    }
  });
});

test('_looksLikeNumericMath edges', () => {
  assert.equal(_looksLikeNumericMath('1/2', ''), true);
  assert.equal(_looksLikeNumericMath('1/2', '，'), true);
  assert.equal(_looksLikeNumericMath('5-', '1'), false);   // `$5-$10`
  assert.equal(_looksLikeNumericMath('5', '1'), false);    // closing $ followed by a digit
  assert.equal(_looksLikeNumericMath('5 ', ''), false);    // `$5 到 $`
  assert.equal(_looksLikeNumericMath(' 5', ''), false);
  assert.equal(_looksLikeNumericMath('5 到 ', ''), false); // CJK prose inside
  assert.equal(_looksLikeNumericMath('/2', ''), false);    // dangling operator
  assert.equal(_looksLikeNumericMath('...', ''), false);   // no digit
  assert.equal(_looksLikeNumericMath('-1', ''), true);
});

test('replaceInlineDollarMath keeps $$ runs and escaped dollars untouched', () => {
  const r = (s, ml = false) => replaceInlineDollarMath(s, ml, (m) => `[${m}]`);
  assert.equal(r('$$a=1$$ 与 $x$'), '$$a=1$$ 与 [x]');
  assert.equal(r('\\$5 和 $1/2$'), '\\$5 和 [1/2]');
  assert.equal(r('花了 $5，概率 $1/2$'), '花了 $5，概率 [1/2]');
  /* Single newline wraps only in the final (multiline) pass; a blank line never. */
  assert.equal(r('公式 $a +\nb$ 结束', true), '公式 [a +\nb] 结束');
  assert.equal(r('公式 $a +\nb$ 结束', false), '公式 $a +\nb$ 结束');
  assert.equal(r('价格 $5\n\n概率 $x$ 好', true), '价格 $5\n\n概率 [x] 好');
});

test('an unclosed fraction renders live; an unclosed amount waits', () => {
  withRenderers(() => {
    assert.deepEqual(formulas(formatMsgProgressive('概率是 $1/2', { complete: false })), ['1/2']);
    assert.deepEqual(formulas(formatMsgProgressive('价格 $5', { complete: false })), []);
    assert.deepEqual(formulas(formatMsgProgressive('价格 $1,000', { complete: false })), []);
  });
});

/* ── heading repair ─────────────────────────────────────────────────── */

const H = '需要注意的边界与推广';
const HEADING_CASES = {
  plain: [`上文。\n\n## ${H}\n\n正文`, 'h2', H],
  glued: [`上文结束。## ${H}\n正文`, 'h2', H],
  gluedColon: ['总结如下：### 3. 推广\n正文', 'h3', '3. 推广'],
  gluedBold: [`**结论成立**## ${H}`, 'h2', H],
  fullwidthSpace: [`\u3000## ${H}\n正文`, 'h2', H],
  zeroWidth: [`\u200b## ${H}\n正文`, 'h2', H],
  bom: [`\ufeff## ${H}\n正文`, 'h2', H],
  nbsp: [`\u00a0## ${H}\n正文`, 'h2', H],
  tab: [`\t## ${H}\n正文`, 'h2', H],
  fourSpaces: [`上文\n\n    ## ${H}\n正文`, 'h2', H],
  boldWrapped: [`**## ${H}**\n正文`, 'h2', H],
  boldWrappedNoSpace: [`**##${H}**`, 'h2', H],
  numberedDot: [`##4. ${H}\n正文`, 'h2', `4. ${H}`],
  numberedDun: [`##4、${H}\n正文`, 'h2', `4、${H}`],
  missingSpace: [`##${H}`, 'h2', H],
  /* Glued after a closing formula dollar (physics derivations constantly
     glue `##` to `$…$`), a `》` / `]` close, or a CJK comma. */
  gluedFormula: ['由牛顿第二定律$F=ma$## 四、推导加速度合成定理\n正文', 'h2', '四、推导加速度合成定理'],
  gluedBookTitle: ['详见《定理》## 四、推导加速度合成定理', 'h2', '四、推导加速度合成定理'],
  gluedBracket: ['如图[见图1]## 四、推导加速度合成定理', 'h2', '四、推导加速度合成定理'],
  gluedCjkComma: ['已知条件，## 四、推导加速度合成定理', 'h2', '四、推导加速度合成定理'],
  /* Fullwidth markers normalize even when the space is present. */
  fullwidthSpaced: ['＃＃ 四、推导加速度合成定理\n正文', 'h2', '四、推导加速度合成定理'],
  fullwidthGlued: ['＃＃四、推导加速度合成定理', 'h2', '四、推导加速度合成定理'],
};

for (const [name, [src, tag, text]] of Object.entries(HEADING_CASES)) {
  test(`heading repair: ${name}`, () => {
    withRenderers(() => {
      const { final, live } = both(src);
      const re = new RegExp(`<${tag}>${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</${tag}>`);
      assert.match(final, re, final);
      assert.match(live, re, live);
      assert.doesNotMatch(final.replace(/<[^>]+>/g, ''), /#/, 'no leftover # in the text');
    });
  });
}

test('heading repair leaves prose and code alone', () => {
  withRenderers(() => {
    const keep = [
      ['我喜欢 C# 语言。# 不是标题', /C# 语言。# 不是标题/],
      ['见上文。##3 条', /##3 条/],
      ['a ## b 是宏拼接', /a ## b/],
      ['#1 号选手表现最好', /#1 号选手/],
      ['用 `a。## b` 表示', /<code>a。## b<\/code>/],
      /* `$`-closed but digit-led: no terminal in the glued class, and no
         closing `$` for the math pass — stays literal, never a heading. */
      ['价格 $5 ## 10', /\$5 ## 10/],
    ];
    for (const [src, re] of keep) {
      const { final, live } = both(src);
      assert.doesNotMatch(final, /<h\d>/, src);
      assert.doesNotMatch(live, /<h\d>/, src);
      assert.match(final, re, src);
    }
    /* Inside a fence nothing moves — neither indentation nor glued markers. */
    const fenced = formatMsg('```c\n    ## x\n上文。## y\n```');
    assert.doesNotMatch(fenced, /<h\d>/);
    assert.match(fenced, /上文。## y/);
    /* A heading nested under a list item keeps nesting. */
    assert.match(formatMsg('1. 列表\n\n    ## 子标题\n正文'), /<li>[\s\S]*<h2>子标题<\/h2>[\s\S]*<\/li>/);
  });
});

test('fixHeadingMarkers is idempotent (it runs on every streaming frame)', () => {
  for (const [src] of Object.values(HEADING_CASES)) {
    const once = fixHeadingMarkers(src);
    assert.equal(fixHeadingMarkers(once), once, JSON.stringify(src));
  }
});

test('a glued heading streams into place without a stray ## frame', () => {
  withRenderers(() => {
    const full = `上文结束。## ${H}\n正文`;
    let sawHeading = false;
    for (let n = full.indexOf('## ') + 4; n <= full.length; n++) {
      const html = formatMsgProgressive(full.slice(0, n), { complete: false });
      if (/<h2>/.test(html)) sawHeading = true;
      if (sawHeading) assert.doesNotMatch(html.replace(/<[^>]+>/g, ''), /##/, `frame ${n}`);
    }
    assert.ok(sawHeading);
  });
});

test('a live tail with a prose word after an amount is not a formula', () => {
  withRenderers(() => {
    assert.deepEqual(formulas(formatMsgProgressive('Pay $5+ tax', { complete: false })), []);
    assert.deepEqual(formulas(formatMsgProgressive('between $10 and', { complete: false })), []);
    /* Real formulas on the live tail still render. */
    assert.deepEqual(formulas(formatMsgProgressive('设 $x + y', { complete: false })), ['x + y']);
    assert.deepEqual(formulas(formatMsgProgressive('有 $\\sin x + \\cos x', { complete: false })), ['\\sin x + \\cos x']);
  });
});
