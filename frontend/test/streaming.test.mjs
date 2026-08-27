import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findInlineToolBoundary,
  getStreamRenderInterval,
  isStableMarkdownPrefix,
  splitStreamingMarkdown,
} from '../src/render/streaming.js';
import { formatMsg, formatMsgProgressive as renderProgressive } from '../src/render/markdown.js';
import { stripChatArtifacts } from '../src/util/stripChatArtifacts.js';

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

test('inline tools anchor at the latest complete prose boundary', () => {
  assert.equal(findInlineToolBoundary('先说明结论。 然后继续分析'), '先说明结论。 '.length);
  assert.equal(findInlineToolBoundary('First paragraph.\n\nSecond paragraph is unfinished'), 'First paragraph.\n\n'.length);
  assert.equal(findInlineToolBoundary('prefix 已完成。 后续仍在输入', 'prefix '.length), 'prefix 已完成。 '.length);
});

test('a segment with no complete boundary anchors at the streamed end, not back at the segment start', () => {
  /* Rewinding to segmentStart is what made tool rows pile up at the top
     of a bubble: several tools in one unfinished paragraph all resolved
     to the same offset, so each row was spliced in above prose that was
     already painted. Anchoring at the end keeps painted text still and
     gives consecutive tools strictly increasing offsets. */
  const fragment = '我先检查一下这个模块，看看';
  assert.equal(findInlineToolBoundary(fragment), fragment.length);

  // Two tools fired inside the same unfinished paragraph must not share
  // an offset — the second has to land after the text streamed since the
  // first, otherwise the rows stack and the prose sinks below them.
  const first = findInlineToolBoundary('让我查一下');
  const second = findInlineToolBoundary('让我查一下，再看看别的地方', first);
  assert.ok(second > first, `expected ${second} > ${first}`);
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
