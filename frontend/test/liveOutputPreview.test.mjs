/**
 * Unit tests for the bounded live-output preview (chat/liveOutput.ts).
 *
 * The tool row renders a running tool's bounded buffer through
 * `renderLivePreview`; the omission marker tells the reader how much of the
 * output the window dropped. These tests pin the exact marker text.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveOutputBuffer, renderLivePreview } from '../src/chat/liveOutput.ts';

// ---------------------------------------------------------------------------
// renderLivePreview omission markers (bounded live-output buffer edge cases)
// ---------------------------------------------------------------------------

test('renderLivePreview: no omissions joins head/tail/pending with newlines', () => {
  const preview = {
    head: ['a', 'b'],
    tail: ['c'],
    pending: 'd',
    omittedLines: 0,
    omittedBytes: 0,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'a\nb\nc\nd');
});

test('renderLivePreview: no omissions and empty pending omits the trailing line', () => {
  const preview = {
    head: ['a', 'b'],
    tail: [],
    pending: '',
    omittedLines: 0,
    omittedBytes: 0,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'a\nb');
});

test('renderLivePreview: omission marker carries the byte suffix when bytes were dropped', () => {
  const preview = {
    head: ['one'],
    tail: ['four'],
    pending: '',
    omittedLines: 2,
    omittedBytes: 7,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'one\n… +2 lines (7 B) omitted\nfour');
});

test('renderLivePreview: omission marker drops the byte suffix when omittedBytes is 0', () => {
  // Empty lines evict with zero byte cost, so the marker reports lines only.
  const preview = {
    head: ['x'],
    tail: ['y'],
    pending: '',
    omittedLines: 3,
    omittedBytes: 0,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(renderLivePreview(preview), 'x\n… +3 lines omitted\ny');
});

test('renderLivePreview: omission marker appears between head and tail, before pending', () => {
  const preview = {
    head: ['h1', 'h2'],
    tail: ['t1'],
    pending: 'partial',
    omittedLines: 5,
    omittedBytes: 40,
    totalBytes: 0,
    totalLines: 0,
  };
  assert.equal(
    renderLivePreview(preview),
    'h1\nh2\n… +5 lines (40 B) omitted\nt1\npartial',
  );
});

test('renderLivePreview reflects a real buffer that dropped middle lines', () => {
  // cap=1 line: head keeps 'one', the tail ring (cap 1) evicts 'two' for
  // 'three', so exactly one 3-byte line is omitted; 'four' is the pending
  // partial line.
  const buf = createLiveOutputBuffer(1, 10_000);
  buf.push('one\ntwo\nthree\n');
  buf.push('four');
  assert.equal(renderLivePreview(buf.preview()), 'one\n… +1 lines (3 B) omitted\nthree\nfour');
});

test('renderLivePreview shows no marker while everything still fits', () => {
  const buf = createLiveOutputBuffer(50, 10_000);
  buf.push('alpha\nbeta\n');
  buf.push('gam');
  const text = renderLivePreview(buf.preview());
  assert.equal(text, 'alpha\nbeta\ngam');
  assert.ok(!text.includes('omitted'), 'no omission marker when nothing dropped');
});
