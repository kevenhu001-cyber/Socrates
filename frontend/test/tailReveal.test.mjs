import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TAIL_FADE_MS,
  recordReveal,
  computeFadeSegments,
  applyTailFade,
} from '../src/render/tailReveal.ts';

test('retired tail fade compatibility shim is inert', () => {
  assert.equal(TAIL_FADE_MS, 0);
  assert.deepEqual(recordReveal([], 10, 20), []);
  assert.deepEqual(computeFadeSegments([], 20), []);
  assert.equal(applyTailFade(null, []), 0);
});
