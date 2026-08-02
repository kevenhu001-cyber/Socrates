/**
 * Bounded live-output buffer tests (TS fallback path).
 *
 * The expected values here mirror the socrates-format LiveBuffer cargo
 * tests; the WASM-vs-fallback equality is asserted in wasmParity.test.mjs.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLiveOutputBuffer,
  renderLivePreview,
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
} from '../src/chat/liveOutput.ts';

test('chunks with partial lines accumulate into pending', () => {
  const b = createLiveOutputBuffer(50, 10_000);
  b.push('hel');
  b.push('lo\nworld\n');
  b.push('tail');
  const p = b.preview();
  assert.deepEqual(p.head, ['hello', 'world']);
  assert.equal(p.pending, 'tail');
  assert.equal(p.totalLines, 2);
  assert.equal(p.totalBytes, 'hello\nworld\n'.length + 'tail'.length);
});

test('head fills first, then a rolling tail window with omission counts', () => {
  const b = createLiveOutputBuffer(2, 10_000);
  b.push('a\nb\nc\nd\n');
  const p = b.preview();
  assert.deepEqual(p.head, ['a', 'b']);
  assert.deepEqual(p.tail, ['c', 'd']);
  assert.equal(p.totalLines, 4);
  // No lines dropped yet: everything fits in head+tail.
  assert.equal(p.omittedLines, 0);

  b.push('e\n');
  const p2 = b.preview();
  assert.deepEqual(p2.tail, ['d', 'e']);
  assert.equal(p2.omittedLines, 1);
  assert.equal(p2.omittedBytes, 1); // 'c' evicted (line content, no newline)
});

test('byte cap omits overflowing lines wholesale', () => {
  const b = createLiveOutputBuffer(5, 10);
  b.push('0123456789\n'); // exactly at cap: kept (strictly greater omits)
  b.push('0123456789\n'); // over cap: omitted
  b.push('ok\n'); // still over: omitted
  const p = b.preview();
  assert.deepEqual(p.head, ['0123456789']);
  assert.equal(p.omittedLines, 2);
  assert.equal(p.omittedBytes, 12);
  assert.equal(p.totalBytes, 25); // raw chunks incl. newlines: 11 + 11 + 3
  assert.equal(p.totalLines, 3);
});

test('CRLF normalized and trailing partial line preserved', () => {
  const b = createLiveOutputBuffer(50, 10_000);
  b.push('a\r\nb\r');
  const p = b.preview();
  assert.deepEqual(p.head, ['a']);
  assert.equal(p.pending, 'b\r');
  assert.equal(p.totalLines, 1);
});

test('renderLivePreview shows head, omission marker, tail, pending', () => {
  const b = createLiveOutputBuffer(1, 10_000);
  b.push('one\ntwo\nthree\n');
  b.push('four');
  const text = renderLivePreview(b.preview());
  // cap=1: head holds 'one', the tail ring (cap 1) evicts 'two' for 'three'.
  assert.equal(text, 'one\n… +1 lines (3 B) omitted\nthree\nfour');
});

test('renderLivePreview without omissions joins head/tail/pending plainly', () => {
  const b = createLiveOutputBuffer(50, 10_000);
  b.push('a\nb\n');
  b.push('c');
  assert.equal(renderLivePreview(b.preview()), 'a\nb\nc');
});

test('defaults mirror Codex LiveCommandOutput (50 lines / 1 MiB)', () => {
  assert.equal(DEFAULT_MAX_LINES, 50);
  assert.equal(DEFAULT_MAX_BYTES, 1024 * 1024);
});
