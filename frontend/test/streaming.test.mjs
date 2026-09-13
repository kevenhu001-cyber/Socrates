import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { marked } from 'marked';
import {
  getStreamRenderInterval,
  isStableMarkdownPrefix,
  splitStreamingMarkdown,
} from '../src/render/streaming.js';
import { formatMsg, formatMsgProgressive as renderProgressive, stripMarkdown } from '../src/render/markdown.js';
import { stripChatArtifacts } from '../src/util/stripChatArtifacts.js';

/* Load the vendored KaTeX UMD into a bare VM context and hand it back,
   mirroring how lazy.js injects it into the page. Tests that need real
   KaTeX output run with globalThis.katex set, like the browser. */
function loadRealKatex() {
  const code = readFileSync(
    new URL('../src/vendor-files/katex/katex.min.js', import.meta.url),
    'utf8',
  );
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.katex;
}

function withKatex(fn) {
  const previousKatex = globalThis.katex;
  globalThis.katex = loadRealKatex();
  try {
    return fn();
  } finally {
    if (previousKatex === undefined) delete globalThis.katex;
    else globalThis.katex = previousKatex;
  }
}

function restoreGlobal(name, descriptor) {
  if (descriptor === undefined) delete globalThis[name];
  else Object.defineProperty(globalThis, name, descriptor);
}

test('stream cadence adapts to response length', () => {
  assert.equal(getStreamRenderInterval(0), 50);
  assert.equal(getStreamRenderInterval(1999), 50);
  assert.equal(getStreamRenderInterval(2000), 80);
  assert.equal(getStreamRenderInterval(8000), 120);
});

test('stream splitting keeps completed blocks separate from the live tail', () => {
  assert.deepEqual(splitStreamingMarkdown('First paragraph.\n\nSecond para'), {
    prefix: 'First paragraph.',
    tail: 'Second para',
  });
  assert.deepEqual(splitStreamingMarkdown('Still typing'), {
    prefix: '',
    tail: 'Still typing',
  });
});

test('stream splitting never cuts through fenced code, math, or reasoning', () => {
  for (const source of [
    'Intro\n\n```js\nconst value = 1;\n\nstill code',
    'Intro\n\n$$\na + b\n\nstill math',
    'Intro\n\n<think>working\n\nstill thinking',
  ]) {
    assert.equal(isStableMarkdownPrefix(source.slice(0, source.lastIndexOf('\n\n'))), false);
    assert.deepEqual(splitStreamingMarkdown(source), { prefix: '', tail: source });
  }
});

test('stream splitting keeps an open Tutor scaffold in the live tail', () => {
  const source = '<example><title>Example</title><problem>First line\n\nSecond line';
  assert.equal(isStableMarkdownPrefix(source.slice(0, source.lastIndexOf('\n\n'))), false);
  assert.deepEqual(splitStreamingMarkdown(source), { prefix: '', tail: source });

  const complete = '<example><problem>First line\n\nSecond line</problem></example>';
  assert.equal(isStableMarkdownPrefix(complete), true);
});

test('Tutor scaffolds render as typed live cards before the closing tag arrives', () => {
  const partial = renderProgressive('<key-point>核心结论：$x=1');
  assert.match(partial, /class="inline-key-point scaffold-stream-live"/);
  assert.match(partial, /data-scaffold-live="key-point"/);
  assert.match(partial, /核心结论/);

  const complete = renderProgressive('<quiz><q>选择</q><o letter="A">是</o><o letter="B">否</o></quiz>');
  assert.match(complete, /class="inline-quiz scaffold-stream-live"/);
  assert.match(complete, /inline-quiz-opt-letter">A\.<\/span>/);
  assert.match(complete, /inline-quiz-opt-letter">B\.<\/span>/);
});

/* ── Streaming-safe math ─────────────────────────────────────────
   The streaming renderer must never leak raw LaTeX or red
   .katex-error spans into the live bubble while a formula is still
   arriving, and the completed render must be a seamless continuation
   of the last partial frame. */

test('unclosed display math renders live instead of waiting for the closing $$', () => {
  withKatex(() => {
    /* Formula mid-flight: no closing $$ yet. It must render as KaTeX
       (not raw source, not a "…" placeholder) with no error styling. */
    const partial = renderProgressive('Let me derive:\n\n$$x + y = ');
    assert.match(partial, /class="katex/);
    assert.doesNotMatch(partial, /katex-error/);
    assert.doesNotMatch(partial, /math-partial/);
    assert.doesNotMatch(partial, /\$\$/);

    /* Once the closing $$ arrives, the same formula renders complete. */
    const complete = renderProgressive('Let me derive:\n\n$$x + y = 1$$');
    assert.match(complete, /class="katex/);
    assert.doesNotMatch(complete, /katex-error/);
    assert.doesNotMatch(complete, /\$\$/);
  });
});

test('a structurally incomplete formula renders as calm pending text, never red', () => {
  withKatex(() => {
    /* \frac{1}{ cannot parse as-is; the tolerant pass neutralizes KaTeX's
       red error spans into .math-stream-pending (the partial source stays
       visible) and the frame still carries no raw $$. */
    const broken = renderProgressive('$$\\frac{1}{');
    assert.match(broken, /math-stream-pending/);
    assert.doesNotMatch(broken, /katex-error/);
    assert.doesNotMatch(broken, /color:#cc0000/);
    assert.doesNotMatch(broken, /\$\$/);

    /* Closed-but-malformed math gets the same neutral treatment. */
    const malformed = renderProgressive('$$x + }$$');
    assert.doesNotMatch(malformed, /katex-error/);
    assert.doesNotMatch(malformed, /color:#cc0000/);
    assert.match(malformed, /math-stream-pending/);
  });
});

test('an unclosed \\begin{aligned} auto-closes so the rows typed so far render live', () => {
  withKatex(() => {
    const partial = renderProgressive('The system:\n\n$$\\begin{aligned} a &= b \\\\ c &= d');
    assert.match(partial, /class="katex/);
    assert.doesNotMatch(partial, /katex-error/);
    assert.doesNotMatch(partial, /\$\$/);
  });
});

test('unclosed inline math renders live, while $5-style amounts stay plain text', () => {
  withKatex(() => {
    const inline = renderProgressive('Solve for x: $x^2 + 3x');
    assert.match(inline, /class="katex/);
    assert.doesNotMatch(inline, /\$x\^2/);
    assert.doesNotMatch(inline, /katex-error/);

    const price = renderProgressive('That costs $5');
    assert.doesNotMatch(price, /class="katex/);
    assert.match(price, /\$5/);

    const closed = renderProgressive('Solve $x^2 = 4$');
    assert.match(closed, /class="katex/);
    assert.doesNotMatch(closed, /\$x\^2 = 4\$/);
  });
});

/* Simple symbol formulas carry no LaTeX command and no operator, so the
   old _looksLikeLatex guard left `$D$`, `$x$` and `$P(x,y)$` as raw
   dollar text. They must render while currency-looking fragments stay
   literal. */
test('bare-symbol inline math renders in both renderers', () => {
  withKatex(() => {
    const progressive = renderProgressive('设 $D$ 为平面上的有界闭区域');
    assert.match(progressive, /class="katex/);
    assert.doesNotMatch(progressive, /\$D\$/);

    const parameters = renderProgressive('若 $P(x,y)$ 与 $Q(x,y)$ 在 $D$ 上连续');
    assert.match(parameters, /class="katex/);
    assert.doesNotMatch(parameters, /\$P\(x,y\)\$/);

    const previousKatex = globalThis.katex;
    const previousMarked = globalThis.marked;
    globalThis.katex = loadRealKatex();
    globalThis.marked = marked;
    try {
      const final = formatMsg('设 $D$ 为平面，$\\partial D$ 为曲线');
      assert.match(final, /class="katex/);
      assert.doesNotMatch(final, /\$D\$/);
      assert.doesNotMatch(final, /\$\\partial D\$/);
    } finally {
      if (previousKatex === undefined) delete globalThis.katex;
      else globalThis.katex = previousKatex;
      if (previousMarked === undefined) delete globalThis.marked;
      else globalThis.marked = previousMarked;
    }
  });
});

test('currency amounts stay literal after the bare-symbol widening', () => {
  withKatex(() => {
    const single = renderProgressive('It costs $5 today');
    assert.doesNotMatch(single, /class="katex/);
    assert.match(single, /\$5/);

    const grouped = renderProgressive('Between $5 and $10 later');
    assert.doesNotMatch(grouped, /class="katex/);
    assert.match(grouped, /\$5/);
    assert.match(grouped, /\$10/);

    const previousKatex = globalThis.katex;
    const previousMarked = globalThis.marked;
    globalThis.katex = loadRealKatex();
    globalThis.marked = marked;
    try {
      const final = formatMsg('Pay $1,000.50 or $5+ tax');
      assert.doesNotMatch(final, /class="katex/);
      assert.match(final, /\$1,000\.50/);
    } finally {
      if (previousKatex === undefined) delete globalThis.katex;
      else globalThis.katex = previousKatex;
      if (previousMarked === undefined) delete globalThis.marked;
      else globalThis.marked = previousMarked;
    }
  });
});

test('math-looking text inside inline code stays literal', () => {
  withKatex(() => {
    const previousKatex = globalThis.katex;
    const previousMarked = globalThis.marked;
    globalThis.katex = loadRealKatex();
    globalThis.marked = marked;
    try {
      const progressive = renderProgressive('use `$D$` and $D$');
      assert.match(progressive, /<code>\$D\$<\/code>/);
      assert.match(progressive, /class="katex/);

      const final = formatMsg('use `$x$` here');
      assert.match(final, /<code>\$x\$<\/code>/);
      assert.doesNotMatch(final, /class="katex/);

      const command = formatMsg('the token `\\partial D` is code');
      assert.match(command, /<code>\\partial D<\/code>/);
      assert.doesNotMatch(command, /class="katex/);
    } finally {
      if (previousKatex === undefined) delete globalThis.katex;
      else globalThis.katex = previousKatex;
      if (previousMarked === undefined) delete globalThis.marked;
      else globalThis.marked = previousMarked;
    }
  });
});

/* Lowercase multi-letter words after a stray `$` are prose, not math;
   point/segment labels (all caps) and punctuated expressions still
   render. */
test('compact inline math rejects lowercase prose words', () => {
  withKatex(() => {
    assert.doesNotMatch(renderProgressive('only $only$ word'), /class="katex/);
    assert.doesNotMatch(renderProgressive('home $home$ dir'), /class="katex/);
    assert.doesNotMatch(renderProgressive('amount $5$ only'), /class="katex/);

    assert.match(renderProgressive('segment $AB$ and $ABC$'), /class="katex/);
    assert.match(renderProgressive('call $f(x)$ now'), /class="katex/);
  });
});

/* Function calls carry internal whitespace (`u(x, y)`), which the compact
   guard rejected, so parameter formulas stayed raw. They must render in
   both passes while spaced prose and currency keep their text. */
test('spaced function-call inline math renders in both renderers', () => {
  withKatex(() => {
    const progressive = renderProgressive('设 $u(x, y)$ 和 $v(x, y)$ 连续');
    assert.match(progressive, /class="katex/);
    assert.doesNotMatch(progressive, /\$u\(x, y\)\$/);
    assert.doesNotMatch(progressive, /\$v\(x, y\)\$/);

    /* Mid-stream open call renders live instead of flashing raw dollars. */
    const live = renderProgressive('设 $u(x, y');
    assert.match(live, /class="katex/);
    assert.doesNotMatch(live, /\$u\(x, y/);

    const previousKatex = globalThis.katex;
    const previousMarked = globalThis.marked;
    globalThis.katex = loadRealKatex();
    globalThis.marked = marked;
    try {
      const final = formatMsg('由 $u(x, y)$ 与 $v(x, y)$ 连续');
      assert.match(final, /class="katex/);
      assert.doesNotMatch(final, /\$u\(x, y\)\$/);
      assert.doesNotMatch(final, /\$v\(x, y\)\$/);
    } finally {
      if (previousKatex === undefined) delete globalThis.katex;
      else globalThis.katex = previousKatex;
      if (previousMarked === undefined) delete globalThis.marked;
      else globalThis.marked = previousMarked;
    }
  });
});

test('spaced prose and currency stay literal', () => {
  withKatex(() => {
    /* A digit or a word detached from the paren is not a call. */
    assert.doesNotMatch(renderProgressive('It costs $5 (approx) today'), /class="katex/);
    assert.doesNotMatch(renderProgressive('paid in $USD (about'), /class="katex/);
    assert.doesNotMatch(renderProgressive('the $US to $EU rate'), /class="katex/);
    assert.doesNotMatch(renderProgressive('so $Thus (see note)$ it is'), /class="katex/);
  });
});

test('stripMarkdown keeps currency but removes real formulas', () => {
  const currency = stripMarkdown('价格是 $5 到 $10');
  assert.match(currency, /\$5/);
  assert.match(currency, /\$10/);

  const formula = stripMarkdown('求解 $x^2$ 的值');
  assert.doesNotMatch(formula, /x\^2/);
  assert.match(formula, /求解/);

  const symbol = stripMarkdown('设 $D$ 为区域');
  assert.doesNotMatch(symbol, /\$D\$/);

  const call = stripMarkdown('设 $u(x, y)$ 连续');
  assert.doesNotMatch(call, /u\(x, y\)/);
});

/* The detached auto-render host must receive sanitized markup: setting
   innerHTML starts resource loads (and their error handlers) even when
   the node is outside the document. */
test('auto-render host receives sanitized HTML', () => {
  const savedMarked = globalThis.marked;
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedPurify = Object.getOwnPropertyDescriptor(globalThis, 'DOMPurify');
  let hostHtml = '';
  let autoRenderCalls = 0;
  globalThis.marked = marked;
  globalThis.DOMPurify = {
    sanitize(html) { return String(html).replace(/\son\w+\s*=\s*"[^"]*"/g, ''); },
  };
  globalThis.document = { createElement() { return { innerHTML: '' }; } };
  globalThis.window = {
    renderMathInElement(el) { autoRenderCalls += 1; hostHtml = el.innerHTML; },
  };
  try {
    const html = formatMsg('<img src=x onerror="window.__xss=1"> plain prose');
    assert.equal(autoRenderCalls, 1);
    assert.doesNotMatch(hostHtml, /onerror/i);
    assert.doesNotMatch(html, /onerror/i);
  } finally {
    if (savedMarked === undefined) delete globalThis.marked;
    else globalThis.marked = savedMarked;
    restoreGlobal('window', savedWindow);
    restoreGlobal('document', savedDocument);
    restoreGlobal('DOMPurify', savedPurify);
  }
});

/* Pathologically nested scaffolds must degrade to escaped text rather
   than re-entering the renderer without bound. */
test('deeply nested scaffolds are depth-capped', () => {
  const depth = 64;
  const source = '<key-point>'.repeat(depth) + 'core' + '</key-point>'.repeat(depth);
  let html = '';
  assert.doesNotThrow(() => { html = renderProgressive(source); });
  assert.match(html, /core/);
});

/* Weak models drop the space after ATX markers (`##标题`, `##**标题**`),
   which CommonMark renders as literal prose. The preprocessor restores
   the space without touching fenced code. */
test('heading markers missing a space are repaired', () => {
  const previousMarked = globalThis.marked;
  globalThis.marked = marked;
  try {
    assert.match(formatMsg('##两种常见说法'), /<h2>两种常见说法<\/h2>/);
    assert.match(formatMsg('##**两种常见说法**'), /<h2><strong>两种常见说法<\/strong><\/h2>/);
    assert.match(formatMsg('###一、格林公式'), /<h3>一、格林公式<\/h3>/);
    assert.match(formatMsg('#### 1.1 定理陈述'), /<h4>1\.1 定理陈述<\/h4>/);
    /* A hash followed by a digit is prose, not a heading. */
    assert.match(formatMsg('#1 candidate'), /#1 candidate/);
    assert.doesNotMatch(formatMsg('#1 candidate'), /<h1>/);
  } finally {
    if (previousMarked === undefined) delete globalThis.marked;
    else globalThis.marked = previousMarked;
  }
});

test('heading repair never rewrites fenced or inline code', () => {
  const previousMarked = globalThis.marked;
  globalThis.marked = marked;
  try {
    const fenced = formatMsg('```c\n#include <stdio.h>\n##comment\n```');
    assert.match(fenced, /#include/);
    assert.match(fenced, /##comment/);
    assert.doesNotMatch(fenced, /# include/);

    const inline = formatMsg('use `#include` here');
    assert.match(inline, /#include/);
  } finally {
    if (previousMarked === undefined) delete globalThis.marked;
    else globalThis.marked = previousMarked;
  }
});

test('math stays as raw source when KaTeX has not loaded yet', () => {
  const previousKatex = globalThis.katex;
  delete globalThis.katex;
  try {
    const html = renderProgressive('$$\\frac{1}{2}$$');
    assert.match(html, /\$\$/);
    assert.doesNotMatch(html, /class="katex/);
  } finally {
    if (previousKatex === undefined) delete globalThis.katex;
    else globalThis.katex = previousKatex;
  }
});

test('final formatMsg neutralizes broken math instead of showing red errors', () => {
  const previousKatex = globalThis.katex;
  const previousMarked = globalThis.marked;
  globalThis.katex = loadRealKatex();
  globalThis.marked = marked; /* vendor/init.js bundles marked eagerly in the browser */
  try {
    const html = formatMsg('$$\\frac{1}{');
    assert.doesNotMatch(html, /katex-error/);
    assert.doesNotMatch(html, /color:#cc0000/);
    assert.doesNotMatch(html, /\$\$/);
  } finally {
    if (previousKatex === undefined) delete globalThis.katex;
    else globalThis.katex = previousKatex;
    if (previousMarked === undefined) delete globalThis.marked;
    else globalThis.marked = previousMarked;
  }
});

test('final Markdown rendering keeps horizontal rules when KaTeX is unavailable', () => {
  const previousMarked = globalThis.marked;
  const previousKatex = globalThis.katex;
  let parsedSource = '';
  try {
    globalThis.marked = {
      parse(source) {
        parsedSource = source;
        return '<p>前文</p><hr><p>后文</p>';
      },
    };
    delete globalThis.katex;

    const html = formatMsg('前文\n---\n后文');

    assert.match(parsedSource, /前文\n\n---\n后文/);
    assert.match(html, /<hr>/);
    assert.doesNotMatch(html, /<p>---/);
  } finally {
    if (previousMarked === undefined) delete globalThis.marked;
    else globalThis.marked = previousMarked;
    if (previousKatex === undefined) delete globalThis.katex;
    else globalThis.katex = previousKatex;
  }
});

/* The two functions below run over the WHOLE accumulated response on every
   stream frame, so both were given allocation-free fast paths. These tests
   pin the observable behaviour so a future optimisation cannot change it. */

test('prefix stability check is unchanged by the allocation-free counters', () => {
  // Balanced delimiters -> stable.
  assert.equal(isStableMarkdownPrefix(''), true);
  assert.equal(isStableMarkdownPrefix('plain prose with no markers'), true);
  assert.equal(isStableMarkdownPrefix('```js\ncode\n```'), true);
  assert.equal(isStableMarkdownPrefix('$$a+b$$'), true);
  assert.equal(isStableMarkdownPrefix('\\[x\\]'), true);
  assert.equal(isStableMarkdownPrefix('<think>a</think>'), true);

  // Unbalanced -> unstable.
  assert.equal(isStableMarkdownPrefix('```js\ncode'), false);
  assert.equal(isStableMarkdownPrefix('$$a+b'), false);
  assert.equal(isStableMarkdownPrefix('\\[x'), false);
  assert.equal(isStableMarkdownPrefix('<think>a'), false);

  // Overlap-sensitive: '```' inside a longer run must count the same way
  // indexOf-stepping does (non-overlapping), matching split() semantics.
  assert.equal(isStableMarkdownPrefix('``````'), true);

  // The '<' fast path must not mask an unbalanced fence.
  assert.equal(isStableMarkdownPrefix('```js\nif (a < b) {}\n'), false);
  // ...nor wrongly reject prose that merely contains '<'.
  assert.equal(isStableMarkdownPrefix('use a < b to compare'), true);
});

test('chat-artifact stripping is unchanged by the fast-path guard', () => {
  // Untouched inputs must round-trip identically.
  for (const clean of ['', 'plain text', '中文内容', 'a\nb\nc', 'a\n\nb', 'arr[i] and x < y']) {
    assert.equal(stripChatArtifacts(clean), clean);
  }

  // Artifacts must still be stripped.
  assert.equal(stripChatArtifacts('<|im_start|>sys<|im_end|>keep'), 'keep');
  assert.equal(stripChatArtifacts('<|endoftext|>keep'), 'keep');
  assert.equal(stripChatArtifacts('<s>keep</s>'), 'keep');
  assert.equal(stripChatArtifacts('[INST]keep[/INST]'), 'keep');
  assert.equal(stripChatArtifacts('<<SYS>>keep<</SYS>>'), 'keep');

  // Whitespace tidying must still apply.
  assert.equal(stripChatArtifacts('a   \nb'), 'a\nb');
  assert.equal(stripChatArtifacts('a\t\nb'), 'a\nb');
  assert.equal(stripChatArtifacts('a\n\n\n\nb'), 'a\n\nb');

  // Falsy passthrough (guards the early return).
  assert.equal(stripChatArtifacts(''), '');
});
