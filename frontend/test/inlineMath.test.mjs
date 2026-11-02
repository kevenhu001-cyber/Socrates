import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInlineMathHtml } from '../src/render/inlineMath.ts';

/* RN-8: mistake stems and question-chain follow-ups typeset `$…$` inline.
   A stub KaTeX stands in for the vendored one. */
const calls = [];
function installKatex() {
  globalThis.katex = {
    renderToString(math, opts) {
      calls.push({ math, opts });
      return `<span class="katex">${math}</span>`;
    },
  };
}

afterEach(() => {
  delete globalThis.katex;
  calls.length = 0;
});

test('text without a formula stays plain', () => {
  installKatex();
  assert.equal(renderInlineMathHtml('平均变化率和瞬时变化率差在哪一步？'), null);
  assert.equal(calls.length, 0);
});

test('inline $…$ is typeset and the prose around it is escaped', () => {
  installKatex();
  const html = renderInlineMathHtml('$f(x)=x^2$ 在 $x=1$ 处 <b>的</b>导数');
  assert.equal(html, '<span class="katex">f(x)=x^2</span> 在 <span class="katex">x=1</span> 处 &lt;b&gt;的&lt;/b&gt;导数');
  assert.ok(calls.every((call) => call.opts.displayMode === false));
});

test('$$…$$ and \\(…\\) stay on the line', () => {
  installKatex();
  const html = renderInlineMathHtml('看 $$a^2$$ 和 \\(b\\)');
  assert.equal(html, '看 <span class="katex">a^2</span> 和 <span class="katex">b</span>');
});

test('a price is not a formula', () => {
  installKatex();
  assert.equal(renderInlineMathHtml('花了 $5'), null);
});

/* RN-12: exam stems, options and explanations go through this renderer, so
   the model's `**bold**` and `` `code` `` get a minimal pass after escaping.
   Nothing else becomes HTML. */
test('bold, code and formulas mix on one line', () => {
  installKatex();
  const html = renderInlineMathHtml('**注意** 用 `diff(f)` 求 $f(x)=x^2$ 的 **导数 $f\'(x)$**');
  assert.equal(
    html,
    '<strong>注意</strong> 用 <code>diff(f)</code> 求 <span class="katex">f(x)=x^2</span> 的 <strong>导数 <span class="katex">f\'(x)</span></strong>',
  );
});

test('marks without a formula still render, and raw HTML stays escaped', () => {
  installKatex();
  assert.equal(renderInlineMathHtml('**<b>粗</b>** 与 `<i>x</i>`'), '<strong>&lt;b&gt;粗&lt;/b&gt;</strong> 与 <code>&lt;i&gt;x&lt;/i&gt;</code>');
  assert.equal(calls.length, 0);
});

test('unclosed marks stay literal', () => {
  installKatex();
  assert.equal(renderInlineMathHtml('**没有闭合 和 `也没有'), null);
  assert.equal(renderInlineMathHtml('**半个 `a` 与 $x$'), '**半个 <code>a</code> 与 <span class="katex">x</span>');
  assert.equal(renderInlineMathHtml('** 两边有空格 **'), null);
});

test('stars inside a formula are not bold', () => {
  installKatex();
  const html = renderInlineMathHtml('$a**b**c$ 与 $x^{*}$ **粗**');
  assert.equal(html, '<span class="katex">a**b**c</span> 与 <span class="katex">x^{*}</span> <strong>粗</strong>');
  assert.deepEqual(calls.map((call) => call.math), ['a**b**c', 'x^{*}']);
});

test('code content is literal: no formula, no bold inside it', () => {
  installKatex();
  assert.equal(renderInlineMathHtml('`$x$ **y**`'), '<code>$x$ **y**</code>');
  assert.equal(calls.length, 0);
});

test('before KaTeX loads, marks paint and a formula keeps its escaped source', () => {
  assert.equal(renderInlineMathHtml('$a<b$ 只有公式'), null);
  assert.equal(renderInlineMathHtml('**粗** 和 $a**b<c$'), '<strong>粗</strong> 和 $a**b&lt;c$');
});
