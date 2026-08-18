import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getKeyboardInset,
  measureKeyboardInset,
  isTrackedInputFocused,
  shouldRefreezeAppVh,
} from '../src/ui/keyboardViewport.js';

/*
 * Pure helpers — no DOM, no window. The DOM-touching initKeyboardViewport
 * is exercised end-to-end by the Playwright smoke suite; these tests guard
 * the math behind the inset value and the focus check.
 */

test('getKeyboardInset returns 0 for non-finite inputs', () => {
  assert.equal(getKeyboardInset(NaN, 800), 0);
  assert.equal(getKeyboardInset(800, Infinity), 0);
  assert.equal(getKeyboardInset(800, -Infinity), 0);
  assert.equal(getKeyboardInset(Infinity, 800), 0);
});

test('getKeyboardInset rounds the gap between layout and visual viewport', () => {
  /* Layout viewport 800 px tall, keyboard covers 300 px of the bottom,
     visualViewport is panned to offsetTop 0. */
  assert.equal(getKeyboardInset(800, 500, 0), 300);
  /* Pan offset on iOS Safari — keyboard top edge is below the layout
     bottom, but the inset must still be non-negative. */
  assert.equal(getKeyboardInset(800, 500, 60), 240);
});

test('getKeyboardInset clamps to zero when visual viewport matches layout', () => {
  assert.equal(getKeyboardInset(800, 800, 0), 0);
  assert.equal(getKeyboardInset(800, 850, 0), 0);
});

test('measureKeyboardInset prefers visualViewport when present', () => {
  const viewport = { height: 500, offsetTop: 60 };
  assert.equal(measureKeyboardInset(800, viewport, 800), 240);
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

test('shouldRefreezeAppVh requires a cached value to skip re-measuring', () => {
  /* No freeze yet → must measure. */
  assert.equal(shouldRefreezeAppVh(-1, -1, 390), true);
  assert.equal(shouldRefreezeAppVh(0, -1, 390), true);
  /* Cached height + same width → keep the freeze, do not re-measure. */
  assert.equal(shouldRefreezeAppVh(844, 390, 390), false);
});

test('shouldRefreezeAppVh invalidates on width change (rotation / split-screen)', () => {
  /* Same height, different width → re-measure for the new orientation. */
  assert.equal(shouldRefreezeAppVh(844, 390, 844), true);
});
