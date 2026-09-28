/**
 * streamPlayer.test — the pure playback clock decouples arrival from playback.
 *
 * Run with:  node --experimental-strip-types --test packages/core/src/streamPlayer.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlaybackClock,
  computeCps,
  DEFAULT_PLAYBACK_CONFIG,
  type PlaybackConfig,
} from './streamPlayer.ts';

const CFG: PlaybackConfig = { ...DEFAULT_PLAYBACK_CONFIG };

describe('computeCps', () => {
  test('is baseCps at empty buffer and maxCps at/after catchUpPending', () => {
    assert.equal(computeCps(0, CFG, false), CFG.baseCps);
    assert.equal(computeCps(CFG.catchUpPending, CFG, false), CFG.maxCps);
    assert.equal(computeCps(CFG.catchUpPending * 10, CFG, false), CFG.maxCps);
  });

  test('is monotonic non-decreasing in pending', () => {
    let prev = -1;
    for (let p = 0; p <= CFG.catchUpPending * 2; p += 5) {
      const cps = computeCps(p, CFG, false);
      assert.ok(cps >= prev, `cps should not decrease at pending=${p}`);
      prev = cps;
    }
  });

  test('drain applies the boost multiplier', () => {
    const plain = computeCps(50, CFG, false);
    const drained = computeCps(50, CFG, true);
    assert.ok(drained > plain);
    assert.ok(Math.abs(drained - plain * CFG.drainBoost) < 1e-9);
  });
});

describe('createPlaybackClock — steady arrival', () => {
  test('plays close to arrival without jumping ahead', () => {
    const clock = createPlaybackClock(CFG, 0);
    let arrived = 0;
    // Arrive ~40 cps for 2s in 100ms steps; tick every 100ms.
    for (let t = 100; t <= 2000; t += 100) {
      arrived += 4; // 40 cps * 0.1s
      clock.push(arrived);
      const r = clock.tick(t);
      assert.ok(r.playedLen <= arrived, 'never plays past what arrived');
      assert.equal(r.state, 'playing');
    }
    // Should be caught up (within a char) by the end at steady low rate.
    assert.ok(clock.totalLen() - clock.playedLen() <= 2);
  });
});

describe('createPlaybackClock — burst is smoothed', () => {
  test('a single burst reveals gradually across frames, never in one tick', () => {
    const clock = createPlaybackClock(CFG, 0);
    clock.push(1000); // 1000 chars land at once
    const first = clock.tick(16); // one 16ms frame
    assert.ok(first.revealed > 0, 'reveals some');
    assert.ok(first.revealed < 1000, 'does not reveal the whole burst in one frame');
    assert.ok(first.playedLen < 1000);
    // It should take many frames to drain a 1000-char burst even at maxCps.
    let frames = 1;
    let now = 16;
    while (clock.playedLen() < 1000 && frames < 10000) {
      now += 16;
      clock.tick(now);
      frames += 1;
    }
    assert.equal(clock.playedLen(), 1000);
    // 1000 chars at maxCps 260 => ~3.8s => ~240 frames. Well above a few.
    assert.ok(frames > 30, `expected gradual playback, got ${frames} frames`);
  });
});

describe('createPlaybackClock — stall', () => {
  test('reports starved once buffer empties and starve window elapses', () => {
    const clock = createPlaybackClock(CFG, 0);
    clock.push(20);
    // Drain the small buffer.
    let now = 0;
    for (let i = 0; i < 60 && clock.playedLen() < 20; i++) {
      now += 100;
      clock.tick(now);
    }
    assert.equal(clock.playedLen(), 20);
    // No new arrivals; advance past the starve window.
    const r = clock.tick(now + CFG.starveAfterMs + 50);
    assert.equal(r.revealed, 0);
    assert.equal(r.state, 'starved');
  });

  test('keeps playing buffered content during an upstream stall', () => {
    const clock = createPlaybackClock(CFG, 0);
    clock.push(500); // deep buffer, upstream then goes silent
    const r1 = clock.tick(16);
    assert.equal(r1.state, 'playing');
    const r2 = clock.tick(320);
    // Still has buffer, so it is playing, not starved, despite no new pushes.
    assert.equal(r2.state, 'playing');
    assert.ok(r2.playedLen > r1.playedLen);
  });
});

describe('createPlaybackClock — drain to done', () => {
  test('beginDrain flushes remaining buffer in finite frames then reports done', () => {
    const clock = createPlaybackClock(CFG, 0);
    clock.push(300);
    clock.tick(16);
    clock.beginDrain();
    let now = 16;
    let frames = 0;
    while (!clock.isDone() && frames < 10000) {
      now += 16;
      clock.tick(now);
      frames += 1;
    }
    assert.ok(clock.isDone(), 'drains to done');
    assert.equal(clock.playedLen(), 300);
    assert.equal(clock.state(), 'done');
    // Drain boost makes it faster than plain playback.
    assert.ok(frames < 300, `drain should be quick, took ${frames} frames`);
  });

  test('done state is stable across further ticks', () => {
    const clock = createPlaybackClock(CFG, 0);
    clock.push(10);
    clock.beginDrain();
    let now = 0;
    for (let i = 0; i < 200 && !clock.isDone(); i++) {
      now += 16;
      clock.tick(now);
    }
    assert.ok(clock.isDone());
    const r = clock.tick(now + 1000);
    assert.equal(r.state, 'done');
    assert.equal(r.revealed, 0);
  });
});

describe('createPlaybackClock — invariants', () => {
  test('playedLen never exceeds totalLen and shrinking pushes are ignored', () => {
    const clock = createPlaybackClock(CFG, 0);
    clock.push(100);
    clock.push(50); // shrink ignored
    assert.equal(clock.totalLen(), 100);
    let now = 0;
    for (let i = 0; i < 500 && clock.playedLen() < 100; i++) {
      now += 16;
      const r = clock.tick(now);
      assert.ok(r.playedLen <= clock.totalLen());
    }
    assert.equal(clock.playedLen(), 100);
  });
});
