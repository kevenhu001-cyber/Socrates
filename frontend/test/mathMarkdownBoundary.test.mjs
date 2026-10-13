import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Element', 'Node', 'NodeFilter', 'DocumentFragment', 'HTMLElement', 'HTMLTemplateElement']) {
  if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const {
  formatMsg,
  formatMsgProgressive,
} = await import('../src/render/markdown.js');
const {
  recoverUnclosedDisplayMathBeforeHeading,
} = await import('../src/render/preprocess.js');

function loadRealKatex() {
  const code = readFileSync(new URL('../src/vendor-files/katex/katex.min.js', import.meta.url), 'utf8');
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.katex;
}

function withRenderers(fn) {
  const previousKatex = globalThis.katex;
  const previousMarked = globalThis.marked;
  globalThis.katex = loadRealKatex();
  globalThis.marked = marked;
  try {
    return fn();
  } finally {
    if (previousKatex === undefined) delete globalThis.katex;
    else globalThis.katex = previousKatex;
    if (previousMarked === undefined) delete globalThis.marked;
    else globalThis.marked = previousMarked;
  }
}

function assertMathThenHeading(src, headingTag, headingText) {
  withRenderers(() => {
    for (const [name, html] of [
      ['final', formatMsg(src)],
      ['settled-stream', formatMsgProgressive(src, { complete: true })],
      ['live-stream', formatMsgProgressive(src, { complete: false })],
    ]) {
      assert.match(html, /class="katex-display"/, `${name}: display math should render`);
      assert.match(html, new RegExp(`<${headingTag}>${headingText}</${headingTag}>`), `${name}: heading should render after math`);
      assert.doesNotMatch(html.replace(/<[^>]+>/g, ''), /#{2,6}\s*结论|#{2,6}\s*第二部分/, `${name}: heading marker must not leak`);
    }
  });
}

test('unclosed $$ display math yields to a following Markdown heading', () => {
  const src = '$$\nE = mc^2\n\n### 结论\n正文';
  const repaired = recoverUnclosedDisplayMathBeforeHeading(src);
  assert.equal(repaired, '$$\nE = mc^2\n\n$$\n### 结论\n正文');
  assert.equal(recoverUnclosedDisplayMathBeforeHeading(repaired), repaired, 'repair must be idempotent');
  assertMathThenHeading(src, 'h3', '结论');
});

test('unclosed \\[ display math yields to a following heading', () => {
  const src = '\\[\nF = ma\n## 第二部分\n正文';
  const repaired = recoverUnclosedDisplayMathBeforeHeading(src);
  assert.equal(repaired, '\\[\nF = ma\n\\]\n## 第二部分\n正文');
  assertMathThenHeading(src, 'h2', '第二部分');
});

test('heading boundary recovery composes with missing-space and fullwidth heading repair', () => {
  withRenderers(() => {
    const cases = [
      ['$$\nx^2 + y^2\n###结论\n正文', /<h3>结论<\/h3>/],
      ['$$\nx^2 + y^2\n＃＃ 第二部分\n正文', /<h2>第二部分<\/h2>/],
      ['$$\nx^2 + y^2\n\u3000##第二部分\n正文', /<h2>第二部分<\/h2>/],
    ];
    for (const [src, heading] of cases) {
      assert.match(formatMsg(src), heading, src);
      assert.match(formatMsgProgressive(src, { complete: true }), heading, src);
    }
  });
});

test('balanced display math is unchanged and still followed by Markdown', () => {
  const src = '$$\nE = mc^2\n$$\n### 结论\n正文';
  assert.equal(recoverUnclosedDisplayMathBeforeHeading(src), src);
  assertMathThenHeading(src, 'h3', '结论');
});

test('code fences, directives and prose enumerations do not terminate display math', () => {
  const fenced = '```md\n$$\nx\n### literal heading sample\n```';
  assert.equal(recoverUnclosedDisplayMathBeforeHeading(fenced), fenced);

  const directive = '$$\nx\n#include <stdio.h>';
  assert.equal(recoverUnclosedDisplayMathBeforeHeading(directive), directive);

  const enumeration = '$$\nx\n##3 条';
  assert.equal(recoverUnclosedDisplayMathBeforeHeading(enumeration), enumeration);
});

test('valid multiline LaTeX environments are not split unless Markdown actually begins', () => {
  const src = '$$\n\\begin{aligned}\na &= b + c \\\\\nd &= e + f\n\\end{aligned}\n$$\n正文';
  assert.equal(recoverUnclosedDisplayMathBeforeHeading(src), src);
  withRenderers(() => {
    const html = formatMsg(src);
    assert.match(html, /class="katex-display"/);
    assert.match(html, /正文/);
  });
});

test('unclosed display math yields to spaced numbered headings and bold-wrapped headings', () => {
  withRenderers(() => {
    const cases = [
      ['$$\nE = mc^2\n# 1 标题\n正文', 'h1', '1 标题'],
      ['$$\nE = mc^2\n## 1 Introduction\nContent', 'h2', '1 Introduction'],
      ['$$\nE = mc^2\n## 2026 年度计划\n正文', 'h2', '2026 年度计划'],
      ['$$\nE = mc^2\n**## 结论**\n正文', 'h2', '结论'],
      ['\\[\nE = mc^2\n## 1 标题\n正文', 'h2', '1 标题'],
    ];
    for (const [src, tag, text] of cases) {
      assertMathThenHeading(src, tag, text);
    }
  });
});

test('unclosed inline math does not swallow following Markdown heading across newline', () => {
  withRenderers(() => {
    const src = '得到公式 $f(x) = x^2\n## 结论\n正文 $y=1$';
    const html = formatMsg(src);
    assert.match(html, /<h2>结论<\/h2>/);
    assert.match(html, /正文/);
    const progressive = formatMsgProgressive(src, { complete: true });
    assert.match(progressive, /<h2>结论<\/h2>/);
  });
});

