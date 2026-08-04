import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findInlineToolBoundary,
  getStreamRenderInterval,
  isStableMarkdownPrefix,
  splitStreamingMarkdown,
} from '../src/render/streaming.js';
import { formatMsg, formatMsgProgressive as renderProgressive } from '../src/render/markdown.js';

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

test('inline tools are inserted only after complete prose boundaries', () => {
  assert.equal(findInlineToolBoundary('我先检查一下这个模块，看看'), 0);
  assert.equal(findInlineToolBoundary('先说明结论。 然后继续分析'), '先说明结论。 '.length);
  assert.equal(findInlineToolBoundary('First paragraph.\n\nSecond paragraph is unfinished'), 'First paragraph.\n\n'.length);
  assert.equal(findInlineToolBoundary('prefix 已完成。 后续仍在输入', 'prefix '.length), 'prefix 已完成。 '.length);
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
