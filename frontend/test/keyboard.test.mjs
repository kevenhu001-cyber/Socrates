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

/*
 * Pure helpers — no DOM, no window. The DOM-touching initKeyboardLift
 * controller is exercised end-to-end by the Playwright smoke suite; these
 * tests guard the math behind the inset value and the focus checks.
 *
 * Motion law note (Open WebUI model): the controller mirrors the measured
 * travel 1:1 into --keyboard-inset on every geometry event — no spring,
 * no interpolation. Smoothness comes from the source: visualViewport
 * events fire per frame during the IME animation, and resizes-content
 * browsers animate the layout natively. So there is intentionally no
 * animator unit under test here; the trajectory contract (painted inset
 * tracks the latest sample within one frame) is pinned by
 * e2e/chat-keyboard-anchor.spec.mjs through a fake visualViewport.
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

test('direct follower contract: latest sample wins within one write', () => {
  /* The controller publishes Math.round(measured travel − pan) with no
     interpolation, so the painted value must equal the newest sample —
     never a blend of the previous target. Pin the projection inputs the
     controller feeds per frame. */
  assert.deepEqual(projectTravel(240, 0), { layoutInset: 240, panCompensation: 0 });
  assert.deepEqual(projectTravel(240, 76), { layoutInset: 164, panCompensation: 0 });
  assert.deepEqual(projectTravel(0, 0), { layoutInset: 0, panCompensation: 0 });
});
