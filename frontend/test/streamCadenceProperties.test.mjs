import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import { getStreamRenderInterval } from '../src/render/streaming.ts';

const RUNS = 200;

/* The three cadence tiers defined by getStreamRenderInterval:
   len < 2000 -> 50ms, len < 8000 -> 80ms, otherwise -> 120ms. */
const TIER_INTERVALS = [50, 80, 120];

/* Tier boundaries used to build generators that straddle each edge, so the
   monotonicity check exercises the tier transitions rather than only the
   interior of a single tier. */
const TIER_BOUNDARIES = [0, 1999, 2000, 7999, 8000];

/* A non-negative accumulated length, biased toward tier boundaries but also
   sampling the full range (including very large answers). */
const accumulatedLength = () => fc.oneof(
  fc.integer({ min: 0, max: 20000 }),
  fc.constantFrom(...TIER_BOUNDARIES),
  fc.integer({ min: 0, max: 2_000_000 }),
);

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 8: Repaint cadence is bounded and
// non-decreasing in length
//
// getStreamRenderInterval returns one of the defined cadence tiers, and the
// interval is monotonically non-decreasing as the accumulated length grows
// across tier boundaries.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 8: Repaint cadence is bounded and non-decreasing in length (tier membership)', () => {
  fc.assert(
    fc.property(accumulatedLength(), (len) => {
      const interval = getStreamRenderInterval(len);
      // Every result is one of the defined, bounded cadence tiers.
      assert.ok(
        TIER_INTERVALS.includes(interval),
        `interval ${interval} for length ${len} is not a defined tier`,
      );
    }),
    { numRuns: RUNS },
  );
});

test('Feature: chat-experience-revamp, Property 8: Repaint cadence is bounded and non-decreasing in length (monotonic non-decreasing)', () => {
  fc.assert(
    fc.property(accumulatedLength(), accumulatedLength(), (a, b) => {
      // Order the two sampled lengths so `lo <= hi`.
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      // A longer (or equal) accumulated length never paints more frequently.
      assert.ok(
        getStreamRenderInterval(hi) >= getStreamRenderInterval(lo),
        `interval decreased from length ${lo} (${getStreamRenderInterval(lo)}) `
          + `to length ${hi} (${getStreamRenderInterval(hi)})`,
      );
    }),
    { numRuns: RUNS },
  );
});
