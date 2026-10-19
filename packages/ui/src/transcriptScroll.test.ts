import assert from 'node:assert/strict';
import test from 'node:test';
import { isNearTranscriptBottom, nextTranscriptFollowState } from './transcriptScroll.ts';

test('follows when the viewport is within 96px of the end', () => {
  assert.equal(isNearTranscriptBottom(1000, 500, 405), true);
  assert.equal(isNearTranscriptBottom(1000, 500, 404), false);
});

test('stops following when the reader scrolls farther up', () => {
  assert.equal(isNearTranscriptBottom(1000, 500, 403), false);
});

test('treats a short transcript as already at the end', () => {
  assert.equal(isNearTranscriptBottom(80, 0, 500), true);
});

test('growing content and programmatic forward scrolls preserve following', () => {
  assert.equal(nextTranscriptFollowState(true, 2000, 500, 500, 500), true);
  assert.equal(nextTranscriptFollowState(true, 2000, 700, 500, 500), true);
});

test('upward movement pauses following until the reader returns near the end', () => {
  assert.equal(nextTranscriptFollowState(true, 2000, 300, 500, 500), false);
  assert.equal(nextTranscriptFollowState(false, 2000, 500, 500, 300), false);
  assert.equal(nextTranscriptFollowState(false, 2000, 1500, 500, 500), true);
});
