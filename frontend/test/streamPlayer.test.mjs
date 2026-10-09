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

/* ── P_udp-smoothing ───────────────────────────────────────────────
   The reveal rate must follow the SMOOTHED upstream arrival rate
   instead of raw buffer depth, so a provider that alternates slow and
   fast produces a steady cadence rather than visible stutter. */

import { createPlaybackClock, DEFAULT_PLAYBACK_CONFIG } from '@socrates/core';

/** Drive the pure clock over a scripted arrival schedule. */
function playScript(events, untilMs = 15_000, frameMs = 16) {
  const clock = createPlaybackClock();
  const rows = [];
  let now = 0;
  let ei = 0;
  let lastTotal = 0;
  while (now <= untilMs) {
    while (ei < events.length && events[ei].t <= now) {
      lastTotal = events[ei].total;
      ei += 1;
    }
    clock.push(lastTotal);
    now += frameMs;
    const r = clock.tick(now);
    if (r.revealed > 0) rows.push({ t: now, revealed: r.revealed, cps: r.cps });
  }
  return rows;
}

/** slow (2 chars / 600ms) → fast (30 chars / 100ms) → slow. */
function fluctuatingScript() {
  const events = [];
  let total = 0;
  for (let i = 0; i < 10; i += 1) { total += 2; events.push({ t: 600 * (i + 1), total }); }
  for (let i = 0; i < 20; i += 1) { total += 30; events.push({ t: 6000 + 100 * (i + 1), total }); }
  for (let i = 0; i < 10; i += 1) { total += 2; events.push({ t: 8100 + 600 * (i + 1), total }); }
  return { events, total };
}

test('a fluctuating upstream is revealed in full (no dropped characters)', () => {
  const { events, total } = fluctuatingScript();
  const rows = playScript(events);
  assert.equal(rows.reduce((s, r) => s + r.revealed, 0), total);
});

test('the reveal rate ramps rather than snapping when upstream speeds up', () => {
  const { events } = fluctuatingScript();
  const rows = playScript(events);
  /* Sample the transition out of the slow phase. A depth-only clock pins
     at baseCps until the buffer refills, then jumps; the smoothed clock
     climbs over several frames instead. */
  const transition = rows.filter((r) => r.t >= 6000 && r.t <= 7200);
  assert.ok(transition.length >= 5, 'expected a multi-frame transition');
  const distinct = new Set(transition.map((r) => Math.round(r.cps / 10))).size;
  assert.ok(distinct >= 3, `expected intermediate rates, saw ${distinct} distinct buckets`);
  /* No single frame may leap the full base→max range: that is the stutter. */
  const maxJump = Math.max(...transition.slice(1).map((r, i) => Math.abs(r.cps - transition[i].cps)));
  assert.ok(
    maxJump < (DEFAULT_PLAYBACK_CONFIG.maxCps - DEFAULT_PLAYBACK_CONFIG.baseCps) * 0.5,
    `cps jumped ${maxJump.toFixed(0)} in one frame`,
  );
});

test('the reveal rate stays inside the configured clamp band', () => {
  const { events } = fluctuatingScript();
  for (const r of playScript(events)) {
    /* cps === 0 means "this frame revealed nothing" (upstream finished), not
       a rate violation — only assert the band on frames that actually moved. */
    if (r.cps === 0) continue;
    assert.ok(r.cps >= DEFAULT_PLAYBACK_CONFIG.baseCps - 1, `cps ${r.cps} below floor`);
    assert.ok(r.cps <= DEFAULT_PLAYBACK_CONFIG.maxCps + 1, `cps ${r.cps} above ceiling`);
  }
});

test('alpha=0 restores the legacy buffer-depth cadence', () => {
  /* Escape hatch: disabling the EMA must not change the original contract. */
  const { events } = fluctuatingScript();
  const rows = playScript(events, 5_000);
  const rates = new Set(rows.map((r) => Math.round(r.cps)));
  assert.ok(rates.size <= 2, `depth-only cadence should be near-constant, saw ${rates.size} values`);
});
