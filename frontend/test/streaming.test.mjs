import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findInlineToolBoundary,
  getStreamRenderInterval,
  isStableMarkdownPrefix,
  splitStreamingMarkdown,
} from '../src/render/streaming.js';

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

test('inline tools are inserted only after complete prose boundaries', () => {
  assert.equal(findInlineToolBoundary('我先检查一下这个模块，看看'), 0);
  assert.equal(findInlineToolBoundary('先说明结论。 然后继续分析'), '先说明结论。 '.length);
  assert.equal(findInlineToolBoundary('First paragraph.\n\nSecond paragraph is unfinished'), 'First paragraph.\n\n'.length);
  assert.equal(findInlineToolBoundary('prefix 已完成。 后续仍在输入', 'prefix '.length), 'prefix 已完成。 '.length);
});
