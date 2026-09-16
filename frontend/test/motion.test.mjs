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
  easeInOutQuad,
  easeInOutCubic,
  smoothDampStep,
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

test('easeInOutQuad is bounded, monotonic, and starts gentle', () => {
  assert.equal(easeInOutQuad(0), 0);
  assert.equal(easeInOutQuad(1), 1);
  assert.equal(easeInOutQuad(0.5), 0.5);
  const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
  let previous = easeInOutQuad(0);
  for (const t of samples) {
    const e = easeInOutQuad(t);
    assert.ok(e > previous, `easeInOutQuad must be monotonic; got ${e} after ${previous} at t=${t}`);
    assert.ok(e <= 1);
    previous = e;
  }
  /* The keyboard lift must not pop: in the first 10% of the duration a
     hot ease-out (quint ≈ 0.41) covers ~20x more distance than this
     gentle in-out start. */
  assert.ok(easeInOutQuad(0.1) < 0.05);
  assert.ok(easeInOutQuad(0.1) < easeOutQuint(0.1));
});

/* The keyboard lift's primary easing (easeInOutCubic). Even gentler at
   the start than easeInOutQuad — the first 10% of the duration covers
   < 0.1% of the distance, so on a 260px keyboard the first motion frame
   (~16ms in, t≈0.09) writes ≈0.7px of inset, well inside the 14px
   resting-margin absorption floor. This is what makes the lift land
   without a perceptible first-frame jump. */
test('easeInOutCubic is bounded, monotonic, and starts almost flat', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  const samples = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
  let previous = easeInOutCubic(0);
  for (const t of samples) {
    const e = easeInOutCubic(t);
    assert.ok(e > previous, `easeInOutCubic must be monotonic; got ${e} after ${previous} at t=${t}`);
    assert.ok(e <= 1);
    previous = e;
  }
  /* First 10% of the duration covers < 0.1% of the distance — used to
     suppress the previous 16px engagement write that read as a jump. */
  assert.ok(easeInOutCubic(0.1) < 0.005);
  assert.ok(easeInOutCubic(0.1) < easeInOutQuad(0.1));
});

/* The keyboard lift's motion law: a critically-damped spring step that
   carries velocity across retargets, so the painted inset is continuous
   in position and speed no matter how irregularly the measured target
   updates. */
test('smoothDampStep converges to the target without overshooting it', () => {
  let value = 0;
  let velocity = 0;
  const dt = 1 / 60;
  const positions = [0];
  for (let frame = 0; frame < 120; frame += 1) {
    const next = smoothDampStep(value, 300, velocity, 0.08, dt);
    value = next.value;
    velocity = next.velocity;
    positions.push(value);
  }
  assert.ok(Math.abs(value - 300) < 0.5, `did not settle: ${value}`);
  /* Monotonic ascent to the target — critically damped, no crossing. */
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] >= positions[i - 1] - 1e-9, `reversed at ${i}: ${positions[i - 1]} -> ${positions[i]}`);
    assert.ok(positions[i] <= 300 + 1e-9, `overshot at ${i}: ${positions[i]}`);
  }
});

test('smoothDampStep keeps position continuous across a mid-flight retarget', () => {
  let value = 0;
  let velocity = 0;
  const dt = 1 / 60;
  /* Half a second of travel toward 300, then the target jumps to 80 —
     the value must reverse smoothly from its current point, never snap. */
  for (let frame = 0; frame < 30; frame += 1) {
    const next = smoothDampStep(value, 300, velocity, 0.08, dt);
    value = next.value;
    velocity = next.velocity;
  }
  const peak = value;
  assert.ok(peak > 200 && peak < 310, `unexpected mid-flight value ${peak}`);
  for (let frame = 0; frame < 120; frame += 1) {
    const next = smoothDampStep(value, 80, velocity, 0.08, dt);
    value = next.value;
    velocity = next.velocity;
    /* The reversal may carry a little momentum past the peak, but a
       teleport (a jump of more than a few px in one frame) is the bug
       this motion law exists to prevent. */
    assert.ok(Math.abs(value - peak) < 40 || value <= peak, `snapped to ${value}`);
  }
  assert.ok(Math.abs(value - 80) < 0.5, `did not settle: ${value}`);
});

test('smoothDampStep snaps cleanly for degenerate inputs', () => {
  assert.deepEqual(smoothDampStep(10, 300, 0, 0, 1 / 60), { value: 300, velocity: 0 });
  assert.deepEqual(smoothDampStep(10, 300, 0, 0.08, 0), { value: 300, velocity: 0 });
});

test('planMotion round-trips: duration is reproducible for the same distance', () => {
  const a = planMotion(420);
  const b = planMotion(420);
  assert.deepEqual(a, b);
});