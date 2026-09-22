import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSettledSplitter,
} from '../src/render/streaming.js';
import { formatMsgProgressive as renderProgressive } from '../src/render/markdown.js';

/* createSettledSplitter keeps the settled region as a grow-only list of
   self-contained blocks so streaming renders mount each completed block
   once instead of re-parsing and rebuilding the whole prefix per frame. */

function reconstruct(split) {
  return split.blocks.join('\n\n') + (split.tail ? '\n\n' + split.tail : '');
}

test('blocks settle incrementally and added reports only new blocks', () => {
  const splitter = createSettledSplitter();

  let split = splitter.push('First paragraph.');
  assert.deepEqual(split.blocks, []);
  assert.equal(split.tail, 'First paragraph.');

  split = splitter.push('First paragraph.\n\nSecond para');
  assert.deepEqual(split.blocks, ['First paragraph.']);
  assert.deepEqual(split.added, ['First paragraph.']);
  assert.equal(split.tail, 'Second para');

  /* Re-pushing the same text is a no-op — nothing new settles. */
  split = splitter.push('First paragraph.\n\nSecond para');
  assert.deepEqual(split.added, []);
  assert.equal(split.tail, 'Second para');

  split = splitter.push('First paragraph.\n\nSecond para grows\n\nThird');
  assert.deepEqual(split.blocks, ['First paragraph.', 'Second para grows']);
  assert.deepEqual(split.added, ['Second para grows']);
  assert.equal(split.tail, 'Third');
  assert.equal(reconstruct(split), 'First paragraph.\n\nSecond para grows\n\nThird');
});

test('a boundary inside an unclosed construct stays in the tail until it closes', () => {
  const splitter = createSettledSplitter();
  let split = splitter.push('Intro\n\n```js\nconst a = 1;\n\nstill code');
  /* 'Intro' settles; the open fence does not, even though a '\n\n' sits
     inside it — the candidate block containing it is not stable. */
  assert.deepEqual(split.blocks, ['Intro']);
  assert.equal(split.tail, '```js\nconst a = 1;\n\nstill code');

  split = splitter.push('Intro\n\n```js\nconst a = 1;\n\nstill code\n```\n\nnext');
  assert.deepEqual(split.blocks, ['Intro', '```js\nconst a = 1;\n\nstill code\n```']);
  assert.equal(split.tail, 'next');
});

test('math and think constructs are not split mid-block', () => {
  const splitter = createSettledSplitter();
  let split = splitter.push('A\n\n$$\nx + y\n\nmore math');
  assert.deepEqual(split.blocks, ['A']);
  assert.equal(split.tail, '$$\nx + y\n\nmore math');

  const thinker = createSettledSplitter();
  split = thinker.push('A\n\n<think>working\n\nstill thinking');
  assert.deepEqual(split.blocks, ['A']);
  assert.equal(split.tail, '<think>working\n\nstill thinking');
});

test('a loose list is not split between its items', () => {
  const splitter = createSettledSplitter();
  /* '- a\n\n- b' is one loose list in markdown; cutting the blank line
     would render two separate <ul>s where the final render produces one. */
  let split = splitter.push('Intro\n\n- a\n\n- b\n\nAfter list');
  assert.deepEqual(split.blocks, ['Intro', '- a\n\n- b']);
  assert.equal(split.tail, 'After list');
});

test('a partial next line that may become a list item keeps the boundary pending', () => {
  const splitter = createSettledSplitter();
  let split = splitter.push('- a\n\n-');
  /* '- ' may grow into '- b' — do not settle '- a' yet. */
  assert.deepEqual(split.blocks, []);
  split = splitter.push('- a\n\n- b\n\nplain text\n\ndone');
  assert.deepEqual(split.blocks, ['- a\n\n- b', 'plain text']);
  assert.equal(split.tail, 'done');
});

test('a non-extending push resets and re-derives the split', () => {
  const splitter = createSettledSplitter();
  splitter.push('Alpha\n\nBeta\n\nGamma');
  const split = splitter.push('Different\ntext');
  assert.equal(split.reset, true);
  assert.deepEqual(split.blocks, []);
  assert.deepEqual(split.added, []);
  assert.equal(split.tail, 'Different\ntext');

  const next = splitter.push('Different\ntext\n\nNow settled');
  assert.equal(next.reset, false);
  assert.deepEqual(next.blocks, ['Different\ntext']);
});

test('trailing separator run collapses to one boundary', () => {
  const splitter = createSettledSplitter();
  const split = splitter.push('a\n\n\n\nb');
  assert.deepEqual(split.blocks, ['a']);
  assert.equal(split.tail, 'b');
});

test('empty input and boundary-less text stay entirely in the tail', () => {
  const splitter = createSettledSplitter();
  assert.deepEqual(splitter.push('').tail, '');
  const split = splitter.push('one line\nstill same paragraph');
  assert.deepEqual(split.blocks, []);
  assert.equal(split.tail, 'one line\nstill same paragraph');
});

/* The KaTeX memo sits behind renderStreamMath: a formula that stays in the
   live tail across frames must hit the cache instead of re-rendering. */
test('repeated progressive renders reuse cached KaTeX output', () => {
  const previousKatex = globalThis.katex;
  let calls = 0;
  globalThis.katex = {
    renderToString(source) {
      calls += 1;
      return '<span class="katex">' + source + '</span>';
    },
  };
  try {
    const frame = 'Settled para\n\nHere is math: $x^2 + y^2$ trailing';
    renderProgressive(frame);
    const afterFirst = calls;
    assert.ok(afterFirst > 0);
    renderProgressive(frame);
    assert.equal(calls, afterFirst);
  } finally {
    if (previousKatex === undefined) delete globalThis.katex;
    else globalThis.katex = previousKatex;
  }
});
