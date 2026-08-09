import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOTION_VELOCITY_PX_PER_S,
  MOTION_MIN_DURATION_MS,
  MOTION_MAX_DURATION_MS,
  MOTION_SNAP_DISTANCE_PX,
  MOTION_EASING,
  planMotion,
  planMotionForUser,
  prefersReducedMotion,
  easeOutQuint,
} from '../src/ui/motion.js';

test('planMotion returns a snap for sub-perceptual distances', () => {
  const plan = planMotion(0);
  assert.equal(plan.snap, true);
  assert.equal(plan.duration, 0);

  const plan2 = planMotion(MOTION_SNAP_DISTANCE_PX);
  assert.equal(plan2.snap, true);
  assert.equal(plan2.duration, 0);

  /* Strictly below the snap threshold also snaps */
  const plan3 = planMotion(MOTION_SNAP_DISTANCE_PX - 1);
  assert.equal(plan3.snap, true);
});

test('planMotion clamps short distances to MIN_DURATION_MS', () => {
  /* 100 px at default velocity (1800 px/s) = ~55 ms raw → clamped to MIN */
  const plan = planMotion(100);
  assert.equal(plan.snap, false);
  assert.equal(plan.duration, MOTION_MIN_DURATION_MS);
});

test('planMotion grows duration linearly inside the velocity window', () => {
  /* 360 px at 1800 px/s = 200 ms raw → within [MIN, MAX], passes through. */
  const plan = planMotion(360);
  assert.equal(plan.duration, 200);
  assert.equal(plan.distance, 360);
  assert.equal(plan.snap, false);
});

test('planMotion clamps very large distances to MAX_DURATION_MS', () => {
  /* 10 000 px at 1800 px/s ≈ 5 555 ms raw → clamped to MAX */
  const plan = planMotion(10000);
  assert.equal(plan.duration, MOTION_MAX_DURATION_MS);
  assert.equal(plan.distance, 10000);
});

test('planMotion honours caller-supplied velocity tunables', () => {
  const plan = planMotion(720, { velocity: 1200 });
  /* 720 px / 1200 px/s = 600 ms — clamped to MAX (520). */
  assert.equal(plan.duration, MOTION_MAX_DURATION_MS);

  const plan2 = planMotion(720, { velocity: 1200, maxDuration: 800 });
  assert.equal(plan2.duration, 600);
});

test('planMotion allows caller to override the snap threshold', () => {
  const plan = planMotion(50, { snapDistance: 100 });
  assert.equal(plan.snap, true);
  const plan2 = planMotion(150, { snapDistance: 100 });
  assert.equal(plan2.snap, false);
});

test('planMotion returns snap for non-finite / negative input', () => {
  assert.equal(planMotion(NaN).snap, true);
  assert.equal(planMotion(-10).snap, true);
  assert.equal(planMotion(Infinity).snap, true);
});

test('planMotion uses the project standard easing by default', () => {
  assert.equal(planMotion(200).easing, MOTION_EASING);
  assert.equal(MOTION_EASING, 'cubic-bezier(.22,1,.36,1)');
});

test('planMotionForUser collapses to a snap under prefers-reduced-motion', () => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    matches: q.includes('reduce'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    /* Without a window/matchMedia override, prefersReducedMotion()
       short-circuits and returns false — sanity check that the
       non-reduced path still returns a non-snap plan. */
    assert.equal(prefersReducedMotion(), true);
    const plan = planMotionForUser(500);
    assert.equal(plan.snap, true);
    assert.equal(plan.duration, 0);
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test('planMotionForUser returns the velocity plan when reduced-motion is off', () => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    const plan = planMotionForUser(360);
    assert.equal(plan.duration, 200);
    assert.equal(plan.snap, false);
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test('easeOutQuint is monotonic and bounded in [0,1]', () => {
  assert.equal(easeOutQuint(0), 0);
  assert.equal(easeOutQuint(1), 1);
  const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
  let previous = easeOutQuint(0);
  for (const t of samples) {
    const e = easeOutQuint(t);
    assert.ok(e > previous, `easeOutQuint must be monotonic; got ${e} after ${previous} at t=${t}`);
    assert.ok(e <= 1);
    previous = e;
  }
});

test('planMotion round-trips: duration is reproducible for the same distance', () => {
  const a = planMotion(420);
  const b = planMotion(420);
  assert.deepEqual(a, b);
});