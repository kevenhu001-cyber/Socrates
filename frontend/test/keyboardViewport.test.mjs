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
  MIN_STABLE_VISUAL_VIEWPORT_HEIGHT,
} from '../src/ui/keyboardViewport.js';

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
