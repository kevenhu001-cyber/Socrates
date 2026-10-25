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
  let delayed = null;
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
      if (!queued && delayed && nowMs >= delayed.at) {
        const cb = delayed.cb; delayed = null; cb();
      }
      frame();
    }
  }
  return {
    now, raf, run,
    delay(cb, ms) {
      const item = { cb, at: nowMs + ms }; delayed = item;
      return () => { if (delayed === item) delayed = null; };
    },
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
    raf: h.raf, delay: h.delay,
  });
  player.push('Hello, world!');
  // No paint until a frame runs.
  assert.equal(frames.length, 0);
  h.run(500);
  // Eventually the whole string is visible.
  assert.ok(frames.length > 0);
  assert.equal(frames[frames.length - 1].text, 'Hello, world!');
});

test('later bursts reveal gradually across frames', () => {
  const h = harness();
  const frames = [];
  const big = 'x'.repeat(1000);
  const player = createStreamPlayer({
    onFrame: (text) => frames.push(text.length),
    now: h.now,
    raf: h.raf, delay: h.delay,
  });
  player.push('Opening.');
  h.run(1);
  frames.length = 0;
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
  assert.equal(frames[frames.length - 1], 1008);
});

test('the first batch is fully visible on the first frame without ending playback', () => {
  const h = harness();
  const frames = [];
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay,
    onFrame: (text) => frames.push(text),
  });
  const first = '第一段正文。'.repeat(80);
  player.push(first);
  assert.equal(frames.length, 0, 'coalesce work until the next paint');
  h.run(1);
  assert.deepEqual(frames, [first]);
  assert.equal(player.getState(), 'playing');
  player.push('接着回答');
  h.run(20);
  assert.equal(frames.at(-1), first + '接着回答');
  player.dispose();
});

test('hidden tabs catch up without animation frames and remove their listener at finish', () => {
  const h = harness();
  let hidden = false;
  let visibilityChanged;
  let removed = 0;
  const frames = [];
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay,
    isHidden: () => hidden,
    onVisibilityChange(cb) { visibilityChanged = cb; return () => { removed++; }; },
    onFrame: (text) => frames.push(text),
  });
  player.push('开头');
  h.run(1);
  player.push('长正文'.repeat(1000));
  hidden = true;
  visibilityChanged();
  assert.equal(player.playedLen(), player.totalLen());
  player.push('后台继续收到的内容');
  assert.equal(player.playedLen(), player.totalLen(), 'no rAF required while hidden');
  hidden = false;
  visibilityChanged();
  player.push('返回前台');
  player.flushNow();
  h.run(20);
  assert.equal(frames.at(-1), '开头' + '长正文'.repeat(1000) + '后台继续收到的内容返回前台');
  assert.equal(removed, 1);
  player.dispose();
  assert.equal(removed, 1);
});

test('a player resumed after a tool handoff restores its visibility subscription', () => {
  const h = harness();
  let hidden = false;
  let visibilityChanged;
  let subscribed = 0;
  let removed = 0;
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay,
    isHidden: () => hidden,
    onVisibilityChange(cb) { subscribed++; visibilityChanged = cb; return () => { removed++; }; },
    onFrame() {},
  });
  player.push('第一段');
  h.run(1);
  player.dispose();
  player.push('工具返回后继续'.repeat(100));
  assert.equal(subscribed, 2);
  hidden = true;
  visibilityChanged();
  assert.equal(player.playedLen(), player.totalLen());
  player.flushNow();
  assert.equal(removed, 2);
});

test('upstream stall drives a starved state change once buffer drains', () => {
  const h = harness();
  const states = [];
  const player = createStreamPlayer({
    onFrame: () => {},
    onStateChange: (s) => states.push(s),
    now: h.now,
    raf: h.raf, delay: h.delay,
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
    raf: h.raf, delay: h.delay,
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
    raf: h.raf, delay: h.delay,
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
    raf: h.raf, delay: h.delay,
  });
  player.push('immediate content here');
  player.flushNow();
  assert.equal(lastText, 'immediate content here');
  assert.equal(doneCount, 1);
  assert.equal(player.playedLen(), player.totalLen());
  assert.equal(player.getState(), 'done');
  h.run(100);
  assert.equal(doneCount, 1);
});

test('DONE flushes a large pending answer once and invalidates its queued frame', () => {
  const h = harness();
  const text = '正文🙂'.repeat(5000);
  const frames = [];
  let done = 0;
  const player = createStreamPlayer({
    now: h.now, raf: h.raf, delay: h.delay,
    onFrame: (visible) => frames.push(visible),
    onDone: () => { done++; },
  });
  player.push(text);
  h.run(1);
  player.flushNow();
  h.run(100);
  player.flushNow();
  assert.equal(frames.at(-1), text);
  assert.equal(frames.filter((visible) => visible === text).length, 1);
  assert.equal(done, 1);
});

test('dispose drops stale queued frames (no paint into a torn-down turn)', () => {
  const h = harness();
  const frames = [];
  const player = createStreamPlayer({
    onFrame: (text) => frames.push(text),
    now: h.now,
    raf: h.raf, delay: h.delay,
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
    raf: h.raf, delay: h.delay,
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

test('empty buffers park animation frames and use one delayed starvation check', () => {
  const h = harness();
  const states = [];
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay,
    onFrame() {}, onStateChange: (state) => states.push(state),
  });
  player.push('A');
  h.run(2);
  assert.equal(h.hasQueued, false, 'no animation work while waiting for the network');
  h.run(30);
  assert.equal(states.at(-1), 'starved');
  assert.equal(h.hasQueued, false);
});

test('a burst after a long network stall starts smoothly without accumulated idle credit', () => {
  const h = harness();
  const frames = [];
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay,
    onFrame: (text) => frames.push(text),
  });
  player.push('A');
  h.run(100);
  h.advance(10_000);
  player.push('B'.repeat(1000));
  h.run(1);
  assert.ok(frames.at(-1).length < 50, 'first recovered frame must not dump the burst');
  h.run(100);
  assert.equal(frames.at(-1), 'A' + 'B'.repeat(1000));
});

test('dispose cancels the delayed idle wake', () => {
  const h = harness();
  const states = [];
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay,
    onFrame() {}, onStateChange: (state) => states.push(state),
  });
  player.push('A');
  h.run(2);
  player.dispose();
  const count = states.length;
  h.run(100);
  assert.equal(states.length, count);
  assert.equal(h.hasQueued, false);
});

test('default visibility subscription is removed on disposal and reinstalled for a resumed player', (context) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  context.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const listeners = new Set();
  let subscriptions = 0;
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener(name, listener) {
      assert.equal(name, 'visibilitychange');
      subscriptions += 1;
      listeners.add(listener);
    },
    removeEventListener(name, listener) {
      assert.equal(name, 'visibilitychange');
      listeners.delete(listener);
    },
  };
  const h = harness(), frames = [];
  const player = createStreamPlayer({ now: h.now, raf: h.raf, delay: h.delay, onFrame: (text) => frames.push(text) });
  assert.equal(listeners.size, 1);
  player.push('First');
  player.dispose();
  assert.equal(listeners.size, 0);
  player.push(' resumed');
  assert.equal(listeners.size, 1);
  assert.equal(subscriptions, 2);
  player.beginDrain();
  h.run(100);
  assert.equal(frames.at(-1), 'First resumed');
  assert.equal(listeners.size, 0);
});
