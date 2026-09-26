import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { marked } from 'marked';

import { formatMsg, formatMsgProgressive } from '../src/render/markdown.js';
import { createSettledSplitter } from '../src/render/streaming.js';
import { preprocessMarkdownForStreaming } from '../src/render/preprocess.js';

/* P_stream-finish-parity — a live turn paints each settled markdown block
   with the streaming renderer and, at finish, repaints the whole answer
   with formatMsg. Any difference between the two for the SAME finished
   text is a visible jump at the end of every stream (the standalone
   `$…$` line going from inline to a centred display formula was one). */

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

const ANSWER = [
  '## 解题思路',
  '',
  '首先，我们回顾一下二次方程的一般形式。',
  '',
  '$\\Delta = b^2 - 4ac$',
  '',
  '单独一行公式：',
  '$x^2$',
  '下一行',
  '',
  '1. 当 $\\Delta > 0$ 时，有两个不同的实根；',
  '2. 当 $\\Delta = 0$ 时，有一个二重根；',
  '',
  '> 提示：判别式来自配方法。',
  '',
  '```python',
  'def roots(a, b, c):',
  '    return b * b - 4 * a * c',
  '```',
  '',
  '| 情况 | 根的个数 |',
  '| --- | --- |',
  '| 大于零 | 2 |',
  '',
  '$$',
  'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
  '$$',
  '',
  '最后一段总结。',
].join('\n');

test('every settled block renders exactly what formatMsg renders for it', () => {
  withRenderers(() => {
    const split = createSettledSplitter().push(ANSWER + '\n\n');
    assert.ok(split.blocks.length >= 8, 'the answer settles block by block');
    for (const block of split.blocks) {
      assert.equal(
        formatMsgProgressive(block, { complete: true }),
        formatMsg(block),
        `settled block renders differently at finish:\n${block}`,
      );
    }
  });
});

test('a standalone $…$ line renders as display math once its line is done', () => {
  withRenderers(() => {
    const settled = formatMsgProgressive('$\\Delta = b^2 - 4ac$', { complete: true });
    assert.match(settled, /katex-display/);
    assert.match(formatMsg('$\\Delta = b^2 - 4ac$'), /katex-display/);
    /* Mid-block: the next line has started, so this one is finished even
       on a live tail. */
    assert.match(formatMsgProgressive('单独一行公式：\n$x^2$\n下一'), /katex-display/);
  });
});

test('the line still being typed is never promoted to display math', () => {
  /* `$a$` at the end of a live tail may continue as `$a$ 和 $b$ …` on the
     next token; promoting it would flash a centred formula for a frame. */
  assert.equal(preprocessMarkdownForStreaming('$a$'), '$a$');
  assert.equal(preprocessMarkdownForStreaming('说明：\n$a$'), '说明：\n$a$');
  assert.equal(preprocessMarkdownForStreaming('$a$\n'), '$$a$$\n');
  assert.equal(preprocessMarkdownForStreaming('$a$', { complete: true }), '$$a$$');
  /* A formula that merely starts a line is inline math in both passes. */
  assert.equal(preprocessMarkdownForStreaming('$a$ 和 $b$ 成立\n', { complete: true }), '$a$ 和 $b$ 成立\n');
});

test('lines inside a fence that is still open stay untouched', () => {
  assert.equal(
    preprocessMarkdownForStreaming('示例：\n```latex\n$E = mc^2$\n'),
    '示例：\n```latex\n$E = mc^2$\n',
  );
  /* Text before the open fence still gets the rule. */
  assert.equal(
    preprocessMarkdownForStreaming('$x$\n```latex\n$E = mc^2$\n'),
    '$$x$$\n```latex\n$E = mc^2$\n',
  );
});
