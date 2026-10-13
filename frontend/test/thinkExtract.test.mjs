import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineThinkingText,
  extractThinkText,
  INLINE_THINK_DIVIDER,
} from '../src/chat/thinkExtract.ts';

test('extractThinkText returns empty string without think blocks', () => {
  assert.equal(extractThinkText('plain answer'), '');
  assert.equal(extractThinkText(''), '');
  assert.equal(extractThinkText(null), '');
  assert.equal(extractThinkText(undefined), '');
});

test('extractThinkText collects closed blocks', () => {
  assert.equal(
    extractThinkText('a <think>first</think> b <think>second</think> c'),
    'first\n\nsecond',
  );
});

test('extractThinkText includes an unclosed trailing tail', () => {
  assert.equal(extractThinkText('a <think>partial'), 'partial');
  assert.equal(
    extractThinkText('a <think>done</think> b <think>live'),
    'done\n\nlive',
  );
});

test('combineThinkingText returns whichever part exists', () => {
  assert.equal(combineThinkingText('reasoning', 'plain'), 'reasoning');
  assert.equal(combineThinkingText('', 'a <think>inner</think> b'), 'inner');
  assert.equal(combineThinkingText('', 'plain'), '');
});

test('combineThinkingText joins both parts with the default divider', () => {
  assert.equal(
    combineThinkingText('reasoning', 'a <think>inner</think> b'),
    `reasoning\n\n${INLINE_THINK_DIVIDER}\n\ninner`,
  );
});

test('combineThinkingText honors an explicit divider', () => {
  assert.equal(
    combineThinkingText('reasoning', 'a <think>inner</think> b', { divider: '---' }),
    'reasoning\n\n---\n\ninner',
  );
});
