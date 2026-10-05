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

/* ---------------------------------------------------------------------------
 * Characterized: the byte cap applies to COMPLETED lines only.
 *
 * `pending` — the unterminated line still being assembled — is not capped, so
 * a tool that streams one long line without a newline grows it without bound.
 * That is a deliberate characterization, not an endorsement:
 *
 *   - measured 0.0020 ms/push for typical newline-terminated stdout
 *   - measured 3.07 ms/push and 13 MiB `pending` for 4 KiB chunks with no
 *     newline, because V8 flattens the cons-string on every indexed access
 *   - the 1 MiB byte cap therefore only bounds completed lines, never the
 *     partial one
 *
 * Capping it changes what the user sees for a long unterminated line (a
 * truncated tail instead of the whole thing) and must be done in BOTH
 * socrates-format/src/live_buffer.rs and the TS fallback, with
 * wasmParity.test.mjs updated — the two implementations currently agree on
 * the unbounded behavior. Do not change one side alone.
 *
 * These assertions pin the current contract so a change to either side is a
 * deliberate, reviewed act.
 * ------------------------------------------------------------------------ */

test('the byte cap bounds completed lines, not the pending partial line', () => {
  const b = createLiveOutputBuffer(50, 1024);
  b.push('x'.repeat(512) + '\n');          // one completed line, within the cap
  b.push('y'.repeat(4096));                 // one unterminated line, way over
  const p = b.preview();
  assert.equal(p.totalBytes, 512 + 1 + 4096, 'the chunk byte count includes the newline');
  assert.equal(p.omittedBytes, 0, 'the completed line was stored, not omitted');
  assert.equal(p.pending.length, 4096, 'the partial line is kept whole');
});

test('a long unterminated line is never truncated by the caps', () => {
  const b = createLiveOutputBuffer(2, 10);
  for (let i = 0; i < 200; i++) b.push('ab');   // 400 bytes, no newline at all
  const p = b.preview();
  assert.equal(p.pending.length, 400);
  assert.equal(p.totalLines, 0);
  assert.equal(p.omittedLines, 0);
  assert.equal(p.omittedBytes, 0);
});
