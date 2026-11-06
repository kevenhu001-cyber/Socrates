import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStreamMath, streamingMathPrefixes } from '../src/render/markdownMath.ts';
import { formatMsgProgressive } from '../src/render/markdown.ts';

/* A strict fake: refuses what KaTeX refuses on a half-typed formula
   (unbalanced braces, a dangling `_`/`^`, an unknown command). */
function balanced(source) {
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue; }
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}
const KNOWN = new Set(['frac', 'oint', 'operatorname', 'infty', 'pi', 'right', 'left', 'sum', 'begin', 'end']);
const strictKatex = {
  renderToString(source, options) {
    const bad = !balanced(source) || /[_^]\s*$/.test(source)
      || [...source.matchAll(/\\([A-Za-z]+)/g)].some((m) => !KNOWN.has(m[1]));
    if (bad) {
      if (options.throwOnError) throw new Error('parse error');
      return `<span class="katex-error" style="color:#cc0000">${source}</span>`;
    }
    strictKatex.last = source;
    return '<span class="katex">K</span>';
  },
};

function withKatex(katex, fn) {
  const previous = globalThis.katex;
  if (katex) globalThis.katex = katex; else delete globalThis.katex;
  try { return fn(); } finally {
    if (previous === undefined) delete globalThis.katex; else globalThis.katex = previous;
  }
}

test('prefixes of a half-typed formula are balanced and shrink from the tail', () => {
  assert.equal(streamingMathPrefixes(String.raw`\frac{1}{z-`)[0], String.raw`\frac{1}{z-}`);
  assert.ok(streamingMathPrefixes(String.raw`-\frac{1}{2\pi i}\oint_`).includes(String.raw`-\frac{1}{2\pi i}\oint`));
  assert.ok(streamingMathPrefixes(String.raw`a + \fr`).some((p) => p.trim() === 'a +'));
  assert.ok(streamingMathPrefixes(String.raw`\left( x`)[0].endsWith(String.raw`\right.`));
  assert.ok(streamingMathPrefixes('x').length <= 8);
});

test('an unfinished formula renders its typed prefix instead of raw source', () => {
  withKatex(strictKatex, () => {
    const html = renderStreamMath(String.raw`\operatorname{Res}(f,\infty) = -\frac{1}{2\pi i}\oint_`, true, true);
    assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /katex-error|math-stream-pending/);
    assert.match(strictKatex.last, /\\oint$/);
  });
});

test('the open \\( tail renders live even though its body holds backslashes', () => {
  withKatex(strictKatex, () => {
    const html = formatMsgProgressive(String.raw`洛朗展开中 \(\frac{1}{z-z`);
    assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /\\frac|\(\\/);
    assert.equal(strictKatex.last, String.raw`\frac{1}{z-z}`);
  });
});

test('closed and open formulas in the live tail wait quietly while KaTeX loads', () => {
  withKatex(null, () => {
    const html = formatMsgProgressive(String.raw`系数 \(\frac{1}{z-z_0}\) 与 $a_{-1}$，以及 \[\oint_{|z|=R}`);
    assert.doesNotMatch(html, /\\frac|\\oint|a_\{-1\}/);
    assert.equal((html.match(/math-stream-placeholder/g) || []).length, 3);
    /* A settled block keeps its readable source if KaTeX never arrives. */
    const settled = formatMsgProgressive(String.raw`系数 $a_{-1}$。`, { complete: true });
    assert.match(settled, /a_\{-1\}|a<em>/);
    assert.doesNotMatch(settled, /math-stream-placeholder/);
  });
});
