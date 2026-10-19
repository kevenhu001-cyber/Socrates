import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeAnchoredMenuLayout,
  getNextMenuItemIndex,
} from '../src/react/menu/menuPrimitive.ts';

test('desktop anchored menu aligns its end edge below the trigger', () => {
  assert.deepEqual(computeAnchoredMenuLayout({
    anchorRect: { left: 200, right: 240, top: 100, bottom: 140 },
    menuWidth: 180,
    menuHeight: 220,
    viewportWidth: 1200,
    viewportHeight: 800,
  }), {
    left: 60,
    top: 144,
    placement: 'below',
    align: 'end',
  });
});

test('phone spill uses start alignment and keeps the menu inside the viewport gutter', () => {
  assert.deepEqual(computeAnchoredMenuLayout({
    anchorRect: { left: 16, right: 52, top: 650, bottom: 686 },
    menuWidth: 252,
    menuHeight: 320,
    viewportWidth: 390,
    viewportHeight: 769,
    spill: true,
    above: true,
  }), {
    left: 8,
    top: 324,
    placement: 'above',
    align: 'start',
  });
});

test('oversized placement is clamped instead of escaping the viewport', () => {
  const layout = computeAnchoredMenuLayout({
    anchorRect: { left: 4, right: 24, top: 4, bottom: 24 },
    menuWidth: 500,
    menuHeight: 900,
    viewportWidth: 390,
    viewportHeight: 769,
  });
  assert.equal(layout.left, 6);
  assert.equal(layout.top, 6);
});

test('roving focus wraps and Home/End jump to the bounds', () => {
  assert.equal(getNextMenuItemIndex(0, 3, 'ArrowUp'), 2);
  assert.equal(getNextMenuItemIndex(2, 3, 'ArrowDown'), 0);
  assert.equal(getNextMenuItemIndex(1, 3, 'Home'), 0);
  assert.equal(getNextMenuItemIndex(1, 3, 'End'), 2);
  assert.equal(getNextMenuItemIndex(-1, 3, 'ArrowDown'), 0);
  assert.equal(getNextMenuItemIndex(-1, 3, 'ArrowUp'), 2);
  assert.equal(getNextMenuItemIndex(0, 0, 'ArrowDown'), -1);
});
