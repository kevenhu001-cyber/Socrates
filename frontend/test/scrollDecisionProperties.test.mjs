import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import {
  SCROLL_SLACK,
  isPinnedToBottom,
  shouldAutoScroll,
} from '../src/ui/scrollDecision.ts';

const RUNS = 200;

/* SCROLL_SLACK is the pin threshold (64 px) shared with scrollPill.js.
   Guard the assumption the properties below build on so a source change
   surfaces here rather than as a silently-weakened property. */
test('SCROLL_SLACK matches the documented pin slack (64 px)', () => {
  assert.equal(SCROLL_SLACK, 64);
});

/* Distances-from-bottom span the full geometry space the decision sees:
   negative (over-scrolled past bottom / rubber-band), the exact slack
   boundary, and far-away positive values, plus fractional pixels. */
const distanceFromBottom = () => fc.oneof(
  fc.integer({ min: -2000, max: 4000 }),
  fc.double({ min: -2000, max: 4000, noNaN: true }),
  // Cluster around the SCROLL_SLACK boundary so the iff is exercised at
  // the exact edge, not just far from it.
  fc.integer({ min: SCROLL_SLACK - 4, max: SCROLL_SLACK + 4 }),
);

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 9: Auto-scroll happens exactly
// when pinned and not scrolled away
//
// shouldAutoScroll returns true if and only if the distance is within the pin
// slack AND the user has not expressed upward scroll intent, over generated
// geometry and flags.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 9: Auto-scroll happens exactly when pinned and not scrolled away', () => {
  fc.assert(
    fc.property(distanceFromBottom(), fc.boolean(), (distance, userScrolledAway) => {
      const pinned = distance <= SCROLL_SLACK;
      const expected = pinned && !userScrolledAway;
      assert.equal(shouldAutoScroll(distance, userScrolledAway), expected);
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 9: Auto-scroll happens exactly
// when pinned and not scrolled away
//
// The decision is exactly the conjunction of "pinned" and "not scrolled
// away": it holds iff isPinnedToBottom holds and the intent flag is clear,
// for any geometry / flag combination.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 9: Auto-scroll happens exactly when pinned and not scrolled away (conjunction of pinned and no intent)', () => {
  fc.assert(
    fc.property(distanceFromBottom(), fc.boolean(), (distance, userScrolledAway) => {
      const pinned = isPinnedToBottom(distance);
      assert.equal(shouldAutoScroll(distance, userScrolledAway), pinned && !userScrolledAway);

      // When the reader has expressed upward intent, auto-scroll is never
      // requested regardless of how close to the bottom they are.
      if (userScrolledAway) {
        assert.equal(shouldAutoScroll(distance, true), false);
      }
      // When pinned and no upward intent, auto-scroll is always requested.
      if (pinned && !userScrolledAway) {
        assert.equal(shouldAutoScroll(distance, false), true);
      }
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 9: Auto-scroll happens exactly
// when pinned and not scrolled away
//
// isPinnedToBottom is the slack comparison: true iff distance <= slack, for
// the default slack and for arbitrary custom slack values.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 9: Auto-scroll happens exactly when pinned and not scrolled away (pin predicate is the slack comparison)', () => {
  fc.assert(
    fc.property(
      distanceFromBottom(),
      fc.integer({ min: 0, max: 1000 }),
      (distance, slack) => {
        // Default slack.
        assert.equal(isPinnedToBottom(distance), distance <= SCROLL_SLACK);
        // Custom slack.
        assert.equal(isPinnedToBottom(distance, slack), distance <= slack);
      },
    ),
    { numRuns: RUNS },
  );
});
