import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMathSource,
  renderStreamMath,
  _looksLikeInlineMathTail,
} from '../src/render/markdownMath.ts';
import {
  preprocessMarkdown,
  preprocessMarkdownForStreaming,
} from '../src/render/preprocess.ts';
import { stripMarkdown } from '../src/render/markdownText.ts';

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

  const blockquoted = normalizeMathSource('> x = 1\n> y = 2', true);
  assert.equal(blockquoted, 'x = 1\ny = 2');
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

test('recognizes live streaming math tails for open coordinates and fractions', () => {
  assert.equal(_looksLikeInlineMathTail('(0, 0'), true);
  assert.equal(_looksLikeInlineMathTail('(x, y'), true);
  assert.equal(_looksLikeInlineMathTail('(-1, 2'), true);

  assert.equal(_looksLikeInlineMathTail('1/'), true);
  assert.equal(_looksLikeInlineMathTail('-1/'), true);
  assert.equal(_looksLikeInlineMathTail('x/'), true);

  // Prose tails must still wait or be rejected
  assert.equal(_looksLikeInlineMathTail('5 (approx'), false);
  assert.equal(_looksLikeInlineMathTail('5 USD'), false);
});

test('strips multiline blockquote markers around display math', () => {
  const input = '> $$\n> x = 1\n> y = 2\n> $$';
  const preprocessed = preprocessMarkdown(input);
  assert.doesNotMatch(preprocessed, />/);
  assert.match(preprocessed, /\$\$\nx = 1\ny = 2\n\$\$/);

  const streaming = preprocessMarkdownForStreaming(input, true);
  assert.doesNotMatch(streaming, />/);
  assert.match(streaming, /\$\$\nx = 1\ny = 2\n\$\$/);
});

test('strips blockquote markers separated by whitespace', () => {
  // The marker run may mix tabs and spaces on either side of each `>`, and
  // the whole run has to resolve to the same display block either way.
  const preprocessed = preprocessMarkdown('>\t>  $$\n> x = 1\n> $$');
  assert.doesNotMatch(preprocessed, />/);
  assert.equal(preprocessed, '$$\nx = 1\n$$');
});

test('blockquote-math marker run resolves in linear time', () => {
  // `>\t>\t>…` used to backtrack exponentially: each gap of whitespace could
  // fall on either side of a marker. 30 repetitions took ~8s, 40 never
  // returned; the linear form finishes in under a millisecond.
  const adversarial = '>' + '\t>'.repeat(30) + 'x';
  const started = performance.now();
  preprocessMarkdown(adversarial);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2000, `expected a linear scan, took ${Math.round(elapsed)}ms`);
});

test('stripMarkdown removes multiline display math blocks', () => {
  const input = '公式如下：\n$$\n\\begin{aligned}x=1\\end{aligned}\n$$\n完成';
  const stripped = stripMarkdown(input);
  assert.equal(stripped, '公式如下：\n\n完成');
});

test('bare-unit repair preserves existing inline and display math in learning cards',()=>{
 const inline='瑞利判据为 $\\theta=1.22\\lambda/D$。';
 assert.equal(preprocessMarkdown(inline),inline);
 const display='公式：$$\\theta=1.22\\lambda/D$$';
 assert.equal(preprocessMarkdown(display),display);
 assert.equal(preprocessMarkdown('电阻为 20\\Omega。'),'电阻为 $20\\Omega$。');
 assert.equal(preprocessMarkdown('代码 `20\\Omega` 保持原样。'),'代码 `20\\Omega` 保持原样。');
});

test('a bare unit is wrapped outside math but never inside an existing span', () => {
  /* preprocess.ts auto-wraps `20\Omega` for weak models. A number already
     inside `$…$` or `$$…$$` is part of the model's own formula; wrapping it
     there splits the formula (`$\theta=1.22\lambda/D$`). */
  assert.match(preprocessMarkdown('测得 20\\Omega 的电阻'), /\$20\\Omega\$/);
  assert.doesNotMatch(preprocessMarkdown('$\\theta=1.22\\lambda/D$'), /\$1\.22\\lambda\$/);
  assert.doesNotMatch(preprocessMarkdown('$$x=3\\mu$$'), /\$3\\mu\$/);
});

test('a display span does not swallow a later inline span in the unit scan', () => {
  /* The scan must pair `$$` with `$$` only. A `$$` that opened inline math
     used to leave every later `$…$` "inside" and suppress the unit wrap for
     the rest of the message. */
  const out = preprocessMarkdown('$$a=1$$\n\n然后 60\\Omega 的电阻');
  assert.match(out, /\$60\\Omega\$/);
});

test('an unclosed dollar does not suppress every later unit wrap', () => {
  /* A lone `$` followed by whitespace is a currency amount, not an opener
     (pandoc's rule). Without that rule the `$5` opened a span that never
     closed and every later unit wrap was skipped. */
  const out = preprocessMarkdown('价格 $ 5, 然后 60\\Omega 的电阻');
  assert.match(out, /\$60\\Omega\$/);
  /* An inline span still stops at a blank line rather than running on. */
  const stray = preprocessMarkdown('价格 $5\n\n然后 60\\Omega 的电阻');
  assert.match(stray, /\$60\\Omega\$/);
});

test('a streaming numeric tail never renders a currency range as math', () => {
  /* `$5-$10` is a range, not a formula. The live tail used to pass '' as the
     "next character", which disabled the digit-after-close guard and made
     `5-` render as math mid-stream, then revert at settle — a visible flash. */
  assert.equal(_looksLikeInlineMathTail('5-'), false);
  assert.equal(_looksLikeInlineMathTail('1/2'), true);
  assert.equal(_looksLikeInlineMathTail('3+4=7'), true);
});

test('bare-unit auto-wrap keeps its pairing in step with the inline pass', () => {
  /* A `$$` run opens display math and is closed only by another `$$`; an
     inline `$` inside it is not a delimiter. The old scanner let one `$$`
     open a span that swallowed every later `$…$`, so the unit wrap was
     skipped for the rest of the message. */
  const displayThenInline = '$$x=1$$\n\n电阻 20\\Omega 与 $a$ 之后 60\\Omega。';
  assert.equal(
    preprocessMarkdown(displayThenInline),
    '$$x=1$$\n\n电阻 $20\\Omega$ 与 $a$ 之后 $60\\Omega$。',
  );
  /* An unclosed inline `$` stops at a blank line instead of consuming the
     rest of the document. */
  const stray = '价格 $5\n\n电阻 20\\Omega。';
  assert.equal(preprocessMarkdown(stray), '价格 $5\n\n电阻 $20\\Omega$。');
  /* An escaped dollar is literal and never opens a span. */
  assert.equal(preprocessMarkdown('花费 \\$5 后 20\\Omega。'), '花费 \\$5 后 $20\\Omega$。');
});

test('a streaming numeric tail never flashes a currency range as math', () => {
  /* `$5-$10` is a currency range: the closed pass rejects it because the
     closing `$` is followed by a digit. The live tail used to pass an empty
     `next`, which disabled that guard and rendered `5-` as a formula until
     settle. A trailing binary operator now waits for the closing `$`. */
  assert.equal(_looksLikeInlineMathTail('5-'), false);
  assert.equal(_looksLikeInlineMathTail('5+'), false);
  /* Genuine live formulas still render. */
  assert.equal(_looksLikeInlineMathTail('1/2'), true);
  assert.equal(_looksLikeInlineMathTail('3+4=7'), true);
});
