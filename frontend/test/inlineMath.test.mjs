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
