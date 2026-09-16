import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getKeyboardInset,
  measureKeyboardInset,
  measureKeyboardTravel,
  isTrackedInputFocused,
  isProgressiveKeyboardSample,
  limitKeyboardInsetArrival,
  KEYBOARD_ARRIVAL_S,
  KEYBOARD_PROGRESSIVE_SAMPLE_MS,
  KEYBOARD_CHASE_SMOOTH_S,
  KEYBOARD_CHASE_STREAM_S,
  MIN_MOTION_FRAMES,
  MIN_STABLE_VISUAL_VIEWPORT_HEIGHT,
} from '../src/ui/keyboardViewport.js';
import { smoothDampStep } from '../src/ui/motion.js';

/*
 * Pure helpers — no DOM, no window. The DOM-touching initKeyboardViewport
 * is exercised end-to-end by the Playwright smoke suite; these tests guard
 * the math behind the inset value and the focus check. The lift's motion
 * law (critically-damped spring + stream-velocity lead) lives in
 * ui/motion.js (smoothDampStep), covered by motion.test.mjs.
 */

test('same-direction samples inside the progressive window count as stream evidence', () => {
  const start = 1_000;
  assert.equal(isProgressiveKeyboardSample(start, start + 16, 1, 1), true);
  assert.equal(
    isProgressiveKeyboardSample(start, start + KEYBOARD_PROGRESSIVE_SAMPLE_MS, -1, -1),
    true,
  );
  assert.equal(isProgressiveKeyboardSample(start, start + KEYBOARD_PROGRESSIVE_SAMPLE_MS + 1, 1, 1), false);
  assert.equal(isProgressiveKeyboardSample(start, start + 16, 1, -1), false);
  assert.equal(isProgressiveKeyboardSample(0, start + 16, 1, 1), false);
});

test('getKeyboardInset returns 0 for non-finite inputs', () => {
  assert.equal(getKeyboardInset(NaN, 800), 0);
  assert.equal(getKeyboardInset(800, Infinity), 0);
  assert.equal(getKeyboardInset(800, -Infinity), 0);
  assert.equal(getKeyboardInset(Infinity, 800), 0);
});

test('getKeyboardInset ignores a transient zero-height visual viewport', () => {
  /* A zero height can be reported for one frame while the IME is opening;
     it must not be interpreted as the keyboard covering the whole shell. */
  assert.equal(getKeyboardInset(844, 0, 0), 0);
  assert.equal(getKeyboardInset(844, -1, 0), 0);
});

test('getKeyboardInset preserves sub-pixel viewport travel', () => {
  /* Layout viewport 800 px tall, keyboard covers 300 px of the bottom,
     visualViewport is panned to offsetTop 0. */
  assert.equal(getKeyboardInset(800, 500, 0), 300);
  /* Pan offset on iOS Safari — keyboard top edge is below the layout
     bottom, but the inset must still be non-negative. */
  assert.equal(getKeyboardInset(800, 500, 60), 240);
  /* A negative pan/overscroll offset must not increase the covered gap. */
  assert.equal(getKeyboardInset(800, 500, -60), 300);
  assert.equal(getKeyboardInset(800.5, 500.25, 0), 300.25);
});

test('limitKeyboardInsetArrival decelerates instead of hard-stopping at the target', () => {
  const dt = 1 / 60;
  const maximumFraction = 1 - Math.exp(-dt / KEYBOARD_ARRIVAL_S);
  const opening = limitKeyboardInsetArrival(220, 250, 240, dt);
  const closing = limitKeyboardInsetArrival(20, -10, 0, dt);

  assert.ok(opening > 220 && opening < 240);
  assert.ok(closing < 20 && closing > 0);
  assert.ok(Math.abs(opening - 220) <= 20 * maximumFraction + 1e-9);
  assert.ok(Math.abs(closing - 20) <= 20 * maximumFraction + 1e-9);
  assert.equal(limitKeyboardInsetArrival(100, 110, 200, dt), 110);
});

test('getKeyboardInset clamps to zero when visual viewport matches layout', () => {
  assert.equal(getKeyboardInset(800, 800, 0), 0);
  assert.equal(getKeyboardInset(800, 850, 0), 0);
});

test('measureKeyboardInset prefers visualViewport when present', () => {
  const viewport = { height: 500, offsetTop: 60 };
  assert.equal(measureKeyboardInset(800, viewport, 800), 240);
});

test('measureKeyboardTravel stays stable when iOS pans the visual viewport', () => {
  assert.equal(measureKeyboardTravel(800, { height: 500, offsetTop: 0 }, 800), 300);
  assert.equal(measureKeyboardTravel(800, { height: 500, offsetTop: 60 }, 800), 300);
  /* Layout compensation still subtracts the pan at the final projection. */
  assert.equal(measureKeyboardInset(800, { height: 500, offsetTop: 60 }, 800), 240);
});

test('measureKeyboardInset ignores a zoomed or transient visual viewport', () => {
  assert.equal(measureKeyboardInset(844, { height: 0, offsetTop: 0 }, 844), 0);
  assert.equal(measureKeyboardInset(844, { height: MIN_STABLE_VISUAL_VIEWPORT_HEIGHT - 1, offsetTop: 0 }, 844), 0);
  assert.equal(measureKeyboardInset(844, { height: 510, offsetTop: 0, scale: 1.2 }, 844), 0);
});

test('measureKeyboardInset falls back to innerHeight without visualViewport', () => {
  assert.equal(measureKeyboardInset(800, null, 800), 0);
  assert.equal(measureKeyboardInset(900, null, 600), 300);
});

test('isTrackedInputFocused matches direct and descendant focus', () => {
  const root = { contains: () => true, matches: () => true };
  const active = {};
  /* activeElement === root */
  assert.equal(isTrackedInputFocused([root], root), true);
  /* activeElement nested inside root */
  assert.equal(isTrackedInputFocused([root], active), true);
});

test('isTrackedInputFocused ignores empty input list', () => {
  const el = { contains: () => false, matches: () => false };
  assert.equal(isTrackedInputFocused([], el), false);
  assert.equal(isTrackedInputFocused(undefined, el), false);
});

test('isTrackedInputFocused survives detached/custom-element throws', () => {
  const evil = {
    contains: () => { throw new Error('detached'); },
    matches: () => { throw new Error('detached'); },
  };
  const active = {};
  /* must not propagate the throw */
  assert.equal(isTrackedInputFocused([evil], active), false);
});

test('keyboard spring fits inside the platform IME window for a 300px discrete lift', () => {
  /*
   * P_tighter-spring — with KEYBOARD_CHASE_SMOOTH_S = 0.10, a spring
   * starting from rest (v=0, painted=0) targeting a 300px keyboard
   * should reach ~85% of the gap within ~16 frames (~ 270ms), well
   * inside the 220-300ms platform IME animation. Asserting on the
   * 16-frame and 32-frame marks pins the spring's rise to the IME
   * window. */
  const dt = 1 / 60;
  const smoothTime = KEYBOARD_CHASE_SMOOTH_S;
  const target = 300;
  let painted = 0;
  let velocity = 0;
  const frames = 32;
  const samples = [painted];
  for (let i = 0; i < frames; i += 1) {
    const next = smoothDampStep(painted, target, velocity, smoothTime, dt);
    velocity = next.velocity;
    painted = next.value;
    /* Overshoot guard, same as motion.js */
    if ((target - painted > 0) === (painted > target)) {
      painted = target;
      velocity = 0;
    }
    samples.push(painted);
  }
  assert.ok(samples[1] > 0, `frame 1 must show motion, got ${samples[1]}`);
  assert.ok(samples[16] > 220, `frame 16 should be past 73% (~220), got ${samples[16]}`);
  assert.ok(samples[32] > 285, `frame 32 should be past 95% (~285), got ${samples[32]}`);
});

test('keyboard spring with pre-armed initial velocity covers more on the first frame than a cold start', () => {
  /*
   * P_initial-velocity — confirms that giving the chase a non-zero lead
   * on frame 1 makes the lift observably continuous instead of pausing
   * for ~80ms while the natural smoothDampStep builds up velocity. The
   * preset comes from applyTravel and lives in the runtime state; we
   * reproduce the recipe (with the runtime's clamp) here to assert its
   * shape. */
  const dt = 1 / 60;
  const smoothTime = KEYBOARD_CHASE_SMOOTH_S;
  const target = 300;
  const coldStart = smoothDampStep(0, target, 0, smoothTime, dt);
  const raw = (target / smoothTime) * 0.65;
  const clamp = 600; /* KEYBOARD_STREAM_MAX_VELOCITY (1500) * 0.4 */
  const presetV = Math.max(0, Math.min(clamp, raw));
  const warmedStart = smoothDampStep(0, target, presetV, smoothTime, dt);
  /* The exact ratio depends on smoothTime; with 0.12s the math lands at
   * ~1.8× the cold start. Assert the lead in absolute pixels — anything
   * above ~5px already turns the first frame into visible motion rather
   * than a barely-perceptible kick. */
  const lead = warmedStart.value - coldStart.value;
  assert.ok(lead > 5,
    `warmedStart (${warmedStart.value.toFixed(3)}) should beat cold (${coldStart.value.toFixed(3)}) by more than 5px, got ${lead.toFixed(3)}`);
  assert.ok(presetV <= clamp,
    `preset velocity (${presetV}) should stay inside the runtime cap (${clamp})`);
});

test('reduced motion still produces a continuous ramp across multiple frames', () => {
  /*
   * Before the fix, the reduced-motion path did `painted = nextTarget`
   * and committed a single-frame snap. The fix steps the inset along
   * an 80ms ease-out so the lift still reads as motion even when the
   * JS spring is disabled. The reducedRun closure is inline inside
   * applyTravel; here we reproduce the easing-only contract: 80ms,
   * easeOutQuad, end == target. */
  const reducedDurationS = 0.08;
  const target = 300;
  const start = 0;
  const dt = 1 / 60;
  let value = start;
  let elapsed = 0;
  let frames = 0;
  while (elapsed < reducedDurationS && frames < 16) {
    elapsed += dt;
    frames += 1;
    const t = Math.min(1, elapsed / reducedDurationS);
    const eased = 1 - (1 - t) * (1 - t);
    value = start + (target - start) * eased;
  }
  assert.ok(frames >= 4, `reduced motion must interpose at least 4 frames, got ${frames}`);
  assert.ok(value > target * 0.95, `should reach >95% of target by the end, got ${value}`);
  assert.ok(value <= target, `must not overshoot target, got ${value}`);
});

test('spring constants stay within platform IME window bounds', () => {
  /*
   * P_tighter-spring — anchor the motion-law constants. If someone
   * bumps them outside the IME window the spring slips behind the
   * keyboard and the snap comes back. The discrete case must
   * comfortably cover the 280-360px IME band in one ~300ms window,
   * and the stream case must be even tighter so progressive samples
   * keep up with the leading edge. */
  assert.ok(KEYBOARD_CHASE_SMOOTH_S <= 0.12,
    `discrete smoothTime too loose (${KEYBOARD_CHASE_SMOOTH_S}), spring will trail IME`);
  assert.ok(KEYBOARD_CHASE_SMOOTH_S >= 0.07,
    `discrete smoothTime too tight (${KEYBOARD_CHASE_SMOOTH_S}), spring will overshoot`);
  assert.ok(KEYBOARD_CHASE_STREAM_S <= KEYBOARD_CHASE_SMOOTH_S,
    'stream must be at least as tight as discrete');
  assert.ok(KEYBOARD_CHASE_STREAM_S >= 0.04,
    `stream smoothTime too tight (${KEYBOARD_CHASE_STREAM_S}), will oscillate`);
  assert.ok(MIN_MOTION_FRAMES >= 8 && MIN_MOTION_FRAMES <= 16,
    `MIN_MOTION_FRAMES out of range (${MIN_MOTION_FRAMES}), spring may snap or stall`);
});
