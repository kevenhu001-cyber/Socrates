import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getKeyboardInset,
  measureKeyboard,
  projectTravel,
  isTrackedInputFocused,
  isEditableWithin,
  MIN_STABLE_VISUAL_HEIGHT,
} from '../src/ui/keyboard/geometry.ts';
import {
  LiftAnimator,
  LIFT_SMOOTH_S,
  LIFT_STREAM_S,
} from '../src/ui/keyboard/lift.ts';

/*
 * Pure helpers — no DOM, no window. The DOM-touching initKeyboardLift
 * controller is exercised end-to-end by the Playwright smoke suite; these
 * tests guard the math behind the inset value, the focus checks, and the
 * lift's motion law.
 */

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

test('getKeyboardInset clamps to zero when visual viewport matches layout', () => {
  assert.equal(getKeyboardInset(800, 800, 0), 0);
  assert.equal(getKeyboardInset(800, 850, 0), 0);
});

test('measureKeyboard reports travel and inset from one viewport read', () => {
  /* Overlay mode (iOS Safari, Chrome/Edge Android 108+): the shell stays
     at full height while the visual viewport shrinks under the keyboard. */
  assert.deepEqual(
    measureKeyboard(844, { height: 510, offsetTop: 0 }, 844),
    { travel: 334, inset: 334 },
  );
  /* Panned viewport: the pan reduces layout-space coverage but not the
     screen-space travel. */
  assert.deepEqual(
    measureKeyboard(844, { height: 560, offsetTop: 24 }, 844),
    { travel: 284, inset: 260 },
  );
  /* Resize mode (Firefox Android, Capacitor resize:"native"): the shell
     already shrank — the keyboard covers nothing more. */
  assert.deepEqual(
    measureKeyboard(510, { height: 510, offsetTop: 0 }, 510),
    { travel: 0, inset: 0 },
  );
  /* Legacy WebView without VisualViewport: a stuck-100vh shell paired
     with a shrunken innerHeight still yields the true keyboard height… */
  assert.deepEqual(measureKeyboard(844, null, 510), { travel: 334, inset: 334 });
  /* …while an overlay keyboard is invisible there and degrades to 0. */
  assert.deepEqual(measureKeyboard(844, null, 844), { travel: 0, inset: 0 });
});

test('measureKeyboard ignores a zoomed or transient visual viewport', () => {
  const zero = { travel: 0, inset: 0 };
  assert.deepEqual(measureKeyboard(844, { height: 0, offsetTop: 0 }, 844), zero);
  assert.deepEqual(
    measureKeyboard(844, { height: MIN_STABLE_VISUAL_HEIGHT - 1, offsetTop: 0 }, 844),
    zero,
  );
  assert.deepEqual(measureKeyboard(844, { height: 510, offsetTop: 0, scale: 1.2 }, 844), zero);
});

test('screen-space travel stays continuous across iOS viewport pan changes', () => {
  /* iOS can pan ahead of the height animation and then partially un-pan.
   * The projection components may reverse, but their painted sum must
   * always equal the spring value; clamping either component caused the
   * composer to jump up and then fall back. */
  const samples = [
    { travel: 0, offset: 0 },
    { travel: 8, offset: 64 },
    { travel: 22, offset: 112 },
    { travel: 41, offset: 76 },
    { travel: 90, offset: 40 },
  ];
  for (const { travel, offset } of samples) {
    const { layoutInset, panCompensation } = projectTravel(travel, offset);
    assert.equal(layoutInset - panCompensation + offset, travel);
  }
});

test('isTrackedInputFocused matches direct and descendant focus', () => {
  const root = { contains: () => true, matches: () => true };
  const active = {};
  assert.equal(isTrackedInputFocused([root], root), true);
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
  assert.equal(isTrackedInputFocused([evil], active), false);
});

test('isEditableWithin matches an editable nested in a tracked root', () => {
  const editor = { tagName: 'DIV' };
  const tracked = {
    contains: (node) => node === editor,
  };
  const target = {
    nodeType: 1,
    closest: () => editor,
  };
  assert.equal(isEditableWithin(target, [tracked]), true);
  assert.equal(isEditableWithin(target, []), false);
  assert.equal(isEditableWithin({ nodeType: 1, closest: () => null }, [tracked]), false);
});

test('lift spring fits inside the platform IME window for a 300px discrete lift', () => {
  /* With LIFT_SMOOTH_S = 0.11 a spring starting from rest should reach
     ~85% of a 300px gap within ~16 frames (~270ms), well inside the
     220–300ms platform IME animation. */
  const lift = new LiftAnimator();
  lift.retarget(300, 0, false);
  const samples = [0];
  for (let i = 1; i <= 32; i += 1) {
    lift.step(i * (1000 / 60));
    samples.push(lift.value);
  }
  assert.ok(samples[1] > 0, `frame 1 must show motion, got ${samples[1]}`);
  assert.ok(samples[16] > 220, `frame 16 should be past 73% (~220), got ${samples[16]}`);
  assert.ok(samples[32] > 285, `frame 32 should be past 95% (~285), got ${samples[32]}`);
});

test('lift is monotonic and never teleports during a progressive stream', () => {
  /* Four stream samples 60px apart, 40ms between them — the same cadence
     the chat-keyboard-anchor spec drives through a fake visualViewport. */
  const lift = new LiftAnimator();
  let now = 0;
  let previous = 0;
  let maxStep = 0;
  for (const target of [60, 120, 180, 240]) {
    lift.retarget(target, now, false);
    for (let f = 0; f < 3; f += 1) {
      now += 1000 / 60;
      lift.step(now);
      assert.ok(lift.value >= previous - 1e-9, `reversed at ${now}ms`);
      maxStep = Math.max(maxStep, lift.value - previous);
      previous = lift.value;
    }
    now += 8;
  }
  /* No single frame covered a whole 60px stream step. */
  assert.ok(maxStep < 58, `frame step ${maxStep} too large`);
  for (let i = 0; i < 40; i += 1) {
    now += 1000 / 60;
    lift.step(now);
  }
  assert.equal(lift.value, 240);
});

test('lift converges exactly and reports settled', () => {
  const lift = new LiftAnimator();
  lift.retarget(300, 0, false);
  let settled = false;
  for (let i = 1; i <= 120 && !settled; i += 1) {
    settled = lift.step(i * (1000 / 60)).settled;
  }
  assert.ok(settled, 'spring must settle within 2s');
  assert.equal(lift.value, 300);
});

test('lift reverses smoothly when the keyboard closes mid-flight', () => {
  const lift = new LiftAnimator();
  lift.retarget(300, 0, false);
  let now = 0;
  for (let i = 0; i < 4; i += 1) { now += 1000 / 60; lift.step(now); }
  const midFlight = lift.value;
  assert.ok(midFlight > 0 && midFlight < 300);
  lift.retarget(0, now, false);
  for (let i = 0; i < 120; i += 1) { now += 1000 / 60; lift.step(now); }
  assert.equal(lift.value, 0);
});

test('reduced motion steps an 80ms ease-out ramp instead of snapping', () => {
  const lift = new LiftAnimator();
  lift.retarget(300, 0, true);
  let now = 0;
  const values = [lift.value];
  for (let i = 0; i < 10; i += 1) {
    now += 1000 / 60;
    lift.step(now);
    values.push(lift.value);
  }
  assert.ok(values[1] > 0 && values[1] < 300, `first reduced frame should interpolate, got ${values[1]}`);
  assert.ok(lift.value === 300, 'ramp lands exactly on target');
});

test('spring constants stay within platform IME window bounds', () => {
  /* If someone bumps these outside the IME window the spring slips behind
     the keyboard and the snap comes back. The discrete case must cover
     the 280–360px IME band in one ~300ms window; the stream case must be
     tighter so progressive samples keep up with the leading edge. */
  assert.ok(LIFT_SMOOTH_S <= 0.12, `discrete smoothTime too loose (${LIFT_SMOOTH_S})`);
  assert.ok(LIFT_SMOOTH_S >= 0.07, `discrete smoothTime too tight (${LIFT_SMOOTH_S})`);
  assert.ok(LIFT_STREAM_S <= LIFT_SMOOTH_S, 'stream must be at least as tight as discrete');
  assert.ok(LIFT_STREAM_S >= 0.04, `stream smoothTime too tight (${LIFT_STREAM_S})`);
});
