/**
 * Web stream player tests — fake clock + fake rAF drive the loop
 * deterministically. The player wraps the pure core clock and paints the
 * smoothly-growing visible prefix instead of the raw arrival stream.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamPlayer } from '../src/render/streamPlayer.ts';

/** A controllable frame loop: run() advances virtual time and fires queued rAF. */
function harness(stepMs = 16) {
  let nowMs = 0;
  let queued = null;
  const now = () => nowMs;
  const raf = (cb) => { queued = cb; };
  function frame() {
    const cb = queued;
    queued = null;
    if (cb) cb();
  }
  function run(frames) {
    for (let i = 0; i < frames; i++) {
      nowMs += stepMs;
      if (!queued) break;
      frame();
    }
  }
  return {
    now, raf, run,
    advance(ms) { nowMs += ms; },
    frame,
    get hasQueued() { return queued !== null; },
    get time() { return nowMs; },
  };
}

test('push does not paint synchronously; frames paint the visible prefix', () => {
  const h = harness();
  const frames = [];
  const player = createStreamPlayer({
    onFrame: (text, f) => frames.push({ text, ...f }),
    now: h.now,
    raf: h.raf,
  });
  player.push('Hello, world!');
  // No paint until a frame runs.
  assert.equal(frames.length, 0);
  h.run(500);
  // Eventually the whole string is visible.
  assert.ok(frames.length > 0);
  assert.equal(frames[frames.length - 1].text, 'Hello, world!');
});

test('a burst reveals gradually across frames, never all in the first frame', () => {
  const h = harness();
  const frames = [];
  const big = 'x'.repeat(1000);
  const player = createStreamPlayer({
    onFrame: (text) => frames.push(text.length),
    now: h.now,
    raf: h.raf,
  });
  player.push(big);
  // Run a handful of frames; the burst must NOT be fully revealed at once.
  h.run(3);
  assert.ok(frames.length > 0, 'painted at least once');
  assert.ok(frames[0] < 1000, 'not the whole burst in the first paint');
  // Visible length is monotonic non-decreasing across all frames.
  h.run(2000);
  let prev = 0;
  for (const len of frames) {
    assert.ok(len >= prev, 'visible length is monotonic');
    prev = len;
  }
  assert.equal(frames[frames.length - 1], 1000);
});

test('keeps the first visible frame immediate and coalesces later UI paints to about 30Hz', () => {
  const h = harness();
  const frames = [];
  const player = createStreamPlayer({
    onFrame: (text) => frames.push({ time: h.time, length: text.length }),
    now: h.now,
    raf: h.raf,
  });
  player.push('x'.repeat(1000));
  h.run(1);
  assert.equal(frames.length, 1, 'first visible prefix paints on the first animation frame');
  h.run(6);
  assert.ok(frames.length <= 4, `too many React-facing paints in ~117ms: ${frames.length}`);
  for (let i = 1; i < frames.length; i += 1) {
    assert.ok(frames[i].time - frames[i - 1].time >= 32, 'visible updates respect the paint interval');
  }
  player.flushNow();
  assert.equal(frames.at(-1).length, 1000, 'forced terminal flush still exposes all arrived text');
});

test('upstream stall drives a starved state change once buffer drains', () => {
  const h = harness();
  const states = [];
  const player = createStreamPlayer({
    onFrame: () => {},
    onStateChange: (s) => states.push(s),
    now: h.now,
    raf: h.raf,
    config: { starveAfterMs: 100 },
  });
  player.push('short');
  h.run(2000); // drains 'short', then the loop stops at starved
  assert.ok(states.includes('starved'), `expected starved, got ${states.join(',')}`);
});

test('a new push after a stall revives the loop', () => {
  const h = harness();
  let lastText = '';
  const player = createStreamPlayer({
    onFrame: (text) => { lastText = text; },
    now: h.now,
    raf: h.raf,
    config: { starveAfterMs: 100 },
  });
  player.push('AAAA');
  h.run(2000);
  assert.equal(lastText, 'AAAA');
  // Loop has parked (starved, empty buffer). A push must restart it.
  player.push('BBBB');
  assert.ok(h.hasQueued, 'push re-scheduled a frame');
  h.run(2000);
  assert.equal(lastText, 'AAAABBBB');
});

test('beginDrain flushes the remaining buffer then fires onDone once', () => {
  const h = harness();
  let doneCount = 0;
  let lastText = '';
  const player = createStreamPlayer({
    onFrame: (text) => { lastText = text; },
    onDone: () => { doneCount += 1; },
    now: h.now,
    raf: h.raf,
  });
  player.push('The quick brown fox');
  h.run(2); // partial playback
  player.beginDrain();
  h.run(1000);
  assert.equal(lastText, 'The quick brown fox');
  assert.equal(doneCount, 1);
  // Further frames do not re-fire done.
  h.run(100);
  assert.equal(doneCount, 1);
});

test('flushNow makes everything visible immediately and fires onDone', () => {
  const h = harness();
  let doneCount = 0;
  let lastText = '';
  const player = createStreamPlayer({
    onFrame: (text) => { lastText = text; },
    onDone: () => { doneCount += 1; },
    now: h.now,
    raf: h.raf,
  });
  player.push('immediate content here');
  player.flushNow();
  assert.equal(lastText, 'immediate content here');
  assert.equal(doneCount, 1);
});

test('reveals pre-tool prose immediately but keeps the player open for the final answer', () => {
  const h = harness();
  const frames = [];
  let doneCount = 0;
  const player = createStreamPlayer({
    onFrame: (text) => frames.push(text),
    onDone: () => { doneCount += 1; },
    now: h.now,
    raf: h.raf,
  });
  player.push('I will check that for you.');
  player.revealBufferedNow(); // called synchronously at tool_use
  assert.equal(frames.at(-1), 'I will check that for you.');
  assert.equal(doneCount, 0, 'a tool boundary is not the end of the assistant turn');

  player.push(' Here is the verified result.');
  assert.ok(h.hasQueued, 'later answer text schedules playback normally');
  player.beginDrain();
  h.run(2_000);
  assert.equal(frames.at(-1), 'I will check that for you. Here is the verified result.');
  assert.equal(doneCount, 1);
});

test('dispose drops stale queued frames (no paint into a torn-down turn)', () => {
  const h = harness();
  const frames = [];
  const player = createStreamPlayer({
    onFrame: (text) => frames.push(text),
    now: h.now,
    raf: h.raf,
  });
  player.push('should not paint after dispose');
  // A frame is queued but not yet run.
  assert.ok(h.hasQueued);
  player.dispose();
  h.frame(); // stale frame runs — must be dropped by the generation guard
  assert.equal(frames.length, 0);
});

test('playedLen never exceeds totalLen', () => {
  const h = harness();
  const player = createStreamPlayer({
    onFrame: () => {},
    now: h.now,
    raf: h.raf,
  });
  player.push('a'.repeat(300));
  for (let i = 0; i < 500; i++) {
    h.run(1);
    assert.ok(player.playedLen() <= player.totalLen());
    if (player.playedLen() === player.totalLen()) break;
  }
  assert.equal(player.playedLen(), 300);
});
