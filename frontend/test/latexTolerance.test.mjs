import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMathSource, renderStreamMath } from '../src/render/markdownMath.ts';

function withKatex(katex, fn) {
  const previous = globalThis.katex;
  globalThis.katex = katex;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete globalThis.katex;
    else globalThis.katex = previous;
  }
}

test('normalizes common model-produced LaTeX without changing display tags', () => {
  const display = normalizeMathSource(
    String.raw`\begin{eqnarray*}x&=&1\label{eq:x}\tag{A}\end{eqnarray*}`,
    true,
  );
  assert.equal(display, String.raw`\begin{aligned}x&=&1\tag{A}\end{aligned}`);

  const inline = normalizeMathSource(String.raw`\begin{alignedat}x&=1\tag*{A}\end{alignedat}`, false);
  assert.equal(inline, String.raw`\begin{alignedat}{2}x&=1\end{alignedat}`);
});

test('closed display math still auto-closes a missing environment end', () => {
  const seen = [];
  const katex = {
    renderToString(source, options) {
      seen.push({ source, options });
      if (source.includes('\\begin{aligned}') && !source.includes('\\end{aligned}')) {
        if (options.throwOnError) throw new Error('unclosed environment');
        return '<span class="katex-error" style="color:#cc0000">broken</span>';
      }
      return `<span class="katex">${source}</span>`;
    },
  };

  withKatex(katex, () => {
    const html = renderStreamMath(String.raw`\begin{aligned}a&=b`, true, false);
    assert.match(html, /class="katex"/);
    assert.match(html, /\\end\{aligned\}/);
    assert.doesNotMatch(html, /katex-error/);
  });

  assert.ok(seen.some(({ source }) => source.includes('\\end{aligned}')));
});

test('eqnarray reaches KaTeX as aligned instead of the unsupported environment', () => {
  const seen = [];
  const katex = {
    renderToString(source) {
      seen.push(source);
      if (source.includes('eqnarray')) throw new Error('unsupported environment');
      return `<span class="katex">${source}</span>`;
    },
  };

  withKatex(katex, () => {
    const html = renderStreamMath(String.raw`\begin{eqnarray}x&=&1\end{eqnarray}`, true, false);
    assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /eqnarray/);
  });

  assert.ok(seen.every((source) => !source.includes('eqnarray')));
  assert.ok(seen.some((source) => source.includes('\\begin{aligned}')));
});
