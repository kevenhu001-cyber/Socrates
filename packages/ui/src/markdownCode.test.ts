import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownCodeRanges } from './learn/markdownCode.ts';
import { splitScaffolds } from './learn/split.ts';

test('a fence closed on its own line covers the whole line', () => {
  const source = 'a\n```js\nx < 1\n```\nb';
  const [range] = markdownCodeRanges(source);
  assert.equal(source.slice(range.start, range.end), '```js\nx < 1\n```\n');
});

test('a closing tag glued to the closing fence stays outside the code', () => {
  const source = '<practice><problem>Run:\n```py\nprint(1)\n```</problem><solution>ok</solution></practice>';
  const [range] = markdownCodeRanges(source);
  assert.equal(source.slice(range.start, range.end), '```py\nprint(1)\n```');
  const segments = splitScaffolds(source);
  assert.deepEqual(segments.map((segment) => segment.kind), ['scaffold']);
  const block = segments[0].kind === 'scaffold' ? segments[0].block : null;
  assert.equal(block?.kind, 'practice');
  assert.match(block?.kind === 'practice' ? block.parsed.problem : '', /```py\nprint\(1\)\n```$/);
});

test('a shorter fence glued to a tag does not close a longer fence', () => {
  const source = '````md\n```</b>\n````\n';
  const [range] = markdownCodeRanges(source);
  assert.equal(source.slice(range.start, range.end), source);
});

test('text after a fence that is not a closing tag keeps the fence open', () => {
  const source = '```\ncode\n``` trailing\nmore';
  const [range] = markdownCodeRanges(source);
  assert.equal(range.end, source.length);
});
