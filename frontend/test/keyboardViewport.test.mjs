import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getKeyboardInset,
  measureKeyboardInset,
  isTrackedInputFocused,
  isProgressiveKeyboardSample,
  isFrameSizedKeyboardStep,
  KEYBOARD_PROGRESSIVE_SAMPLE_MS,
  KEYBOARD_TRACK_STEP_PX,
  MIN_STABLE_VISUAL_VIEWPORT_HEIGHT,
} from '../src/ui/keyboardViewport.js';

/*
 * Pure helpers — no DOM, no window. The DOM-touching initKeyboardViewport
 * is exercised end-to-end by the Playwright smoke suite; these tests guard
 * the math behind the inset value and the focus check. The lift's easing
 * and duration come from ui/motion.js (easeOutQuint + planMotionForUser),
 * covered by motion.test.mjs.
 */

test('continuous keyboard samples follow native geometry instead of restarting the tween', () => {
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

test('frame-sized measured steps are tracked directly, larger jumps are not', () => {
  /* A real per-frame IME stream moves ≤ ~70px between samples even on a
     30fps WebView; those steps may be written straight through. */
  assert.equal(isFrameSizedKeyboardStep(60, 120), true);
  assert.equal(isFrameSizedKeyboardStep(120, 120 + KEYBOARD_TRACK_STEP_PX), true);
  /* A jump beyond the frame budget means the browser skipped reports —
     it must take the eased glide instead of teleporting the composer. */
  assert.equal(isFrameSizedKeyboardStep(30, 30 + KEYBOARD_TRACK_STEP_PX + 1), false);
  assert.equal(isFrameSizedKeyboardStep(0, 300), false);
  assert.equal(isFrameSizedKeyboardStep(NaN, 100), false);
  assert.equal(isFrameSizedKeyboardStep(100, Infinity), false);
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

test('getKeyboardInset rounds the gap between layout and visual viewport', () => {
  /* Layout viewport 800 px tall, keyboard covers 300 px of the bottom,
     visualViewport is panned to offsetTop 0. */
  assert.equal(getKeyboardInset(800, 500, 0), 300);
  /* Pan offset on iOS Safari — keyboard top edge is below the layout
     bottom, but the inset must still be non-negative. */
  assert.equal(getKeyboardInset(800, 500, 60), 240);
  /* A negative pan/overscroll offset must not increase the covered gap. */
  assert.equal(getKeyboardInset(800, 500, -60), 300);
});

test('getKeyboardInset clamps to zero when visual viewport matches layout', () => {
  assert.equal(getKeyboardInset(800, 800, 0), 0);
  assert.equal(getKeyboardInset(800, 850, 0), 0);
});

test('measureKeyboardInset prefers visualViewport when present', () => {
  const viewport = { height: 500, offsetTop: 60 };
  assert.equal(measureKeyboardInset(800, viewport, 800), 240);
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
