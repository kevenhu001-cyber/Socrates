import assert from 'node:assert/strict';
import test from 'node:test';
import { mobileMenuPlacement } from '../src/react/composer/composerTools.position.ts';

test('phone composer menu preserves the reference eight pixel gap above the composer', () => {
  const placement = mobileMenuPlacement(0, 844, 730, 816);
  assert.deepEqual(placement, { edge: 722, maxHeight: 633, side: 'sheet' });
});

test('phone composer menu uses room below an anchor near the visible top', () => {
  assert.deepEqual(mobileMenuPlacement(120, 440, 145, 231), {
    edge: 239, maxHeight: 189, side: 'mobile-below',
  });
});

test('an anchor occupying the keyboard-constrained viewport never collapses the menu', () => {
  assert.deepEqual(mobileMenuPlacement(120, 340, 132, 328), {
    edge: 132, maxHeight: 165, side: 'mobile-overlay',
  });
});

test('offscreen anchors cannot put the menu outside the visible viewport', () => {
  const above = mobileMenuPlacement(80, 400, 450, 536);
  assert.equal(above.edge, 388);
  assert.equal(above.maxHeight, 240);
  const below = mobileMenuPlacement(80, 400, -20, 50);
  assert.equal(below.edge, 92);
  assert.equal(below.maxHeight, 240);
});
