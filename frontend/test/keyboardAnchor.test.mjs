import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import {
  KEYBOARD_PIN_SLACK,
  decideKeyboardAnchorAction,
} from '../src/ui/scrollDecision.ts';

/*
 * The keyboard-transition anchor contract:
 *
 *   - a pinned reader keeps following the bottom,
 *   - a history reader keeps the exact pre-layout offset (clamped),
 *   - a newer user gesture cancels any compensation,
 *   - a missing anchor is a no-op.
 *
 * These are pure decisions extracted from keyboardViewport.js so they can
 * be verified without a DOM; the DOM wiring is covered by the Playwright
 * keyboard-viewport / chat-anchor specs.
 */

test('KEYBOARD_PIN_SLACK matches the documented keyboard slack (96 px)', () => {
  assert.equal(KEYBOARD_PIN_SLACK, 96);
});

test('pinned reader follows the bottom when no intent changed', () => {
  const action = decideKeyboardAnchorAction(
    { scrollTop: 1200, pinned: true },
    { maxScrollTop: 1400, scrolledAway: false, userIntentAfterCapture: false },
  );
  assert.deepEqual(action, { type: 'follow-bottom' });
});

test('history reader restores the captured offset (not the bottom)', () => {
  const action = decideKeyboardAnchorAction(
    { scrollTop: 600, pinned: false },
    { maxScrollTop: 3703, scrolledAway: true, userIntentAfterCapture: false },
  );
  assert.deepEqual(action, { type: 'restore', top: 600 });
});

test('restore clamps to the current scrollable range', () => {
  assert.deepEqual(
    decideKeyboardAnchorAction(
      { scrollTop: 99999, pinned: false },
      { maxScrollTop: 500, scrolledAway: true, userIntentAfterCapture: false },
    ),
    { type: 'restore', top: 500 },
  );
  assert.deepEqual(
    decideKeyboardAnchorAction(
      { scrollTop: -40, pinned: false },
      { maxScrollTop: 500, scrolledAway: true, userIntentAfterCapture: false },
    ),
    { type: 'restore', top: 0 },
  );
});

test('a new user gesture after capture makes the anchor inert', () => {
  const action = decideKeyboardAnchorAction(
    { scrollTop: 600, pinned: false },
    { maxScrollTop: 3703, scrolledAway: true, userIntentAfterCapture: true },
  );
  assert.deepEqual(action, { type: 'none' });
});

test('a send-time viewport hold keeps the keyboard transition off the transcript', () => {
  /* The send anchor owns the prompt's offset while it holds: re-anchoring a
     pinned reader to the bottom here would slide the prompt down by the
     whole viewport delta. */
  assert.deepEqual(
    decideKeyboardAnchorAction(
      { scrollTop: 1200, pinned: true },
      {
        maxScrollTop: 1400,
        scrolledAway: false,
        userIntentAfterCapture: false,
        viewportOwnerHeld: true,
      },
    ),
    { type: 'none' },
  );
  /* A history reader is equally left alone — the hold keeps the prompt. */
  assert.deepEqual(
    decideKeyboardAnchorAction(
      { scrollTop: 600, pinned: false },
      {
        maxScrollTop: 3703,
        scrolledAway: true,
        userIntentAfterCapture: false,
        viewportOwnerHeld: true,
      },
    ),
    { type: 'none' },
  );
});

test('property: a held viewport owner always makes the anchor inert', () => {
  fc.assert(
    fc.property(
      fc.double({ min: -2000, max: 5000, noNaN: true }),
      fc.boolean(),
      fc.boolean(),
      (captured, pinned, scrolledAway) => {
        const action = decideKeyboardAnchorAction(
          { scrollTop: captured, pinned },
          {
            maxScrollTop: 4000,
            scrolledAway,
            userIntentAfterCapture: false,
            viewportOwnerHeld: true,
          },
        );
        assert.deepEqual(action, { type: 'none' });
      },
    ),
    { numRuns: 200 },
  );
});

test('a pinned reader who scrolls away is restored, not followed', () => {
  const action = decideKeyboardAnchorAction(
    { scrollTop: 1200, pinned: true },
    { maxScrollTop: 1400, scrolledAway: true, userIntentAfterCapture: false },
  );
  assert.deepEqual(action, { type: 'restore', top: 1200 });
});

test('missing or non-finite anchor input is a no-op / clamped to zero', () => {
  assert.deepEqual(
    decideKeyboardAnchorAction(null, {
      maxScrollTop: 100,
      scrolledAway: false,
      userIntentAfterCapture: false,
    }),
    { type: 'none' },
  );
  assert.deepEqual(
    decideKeyboardAnchorAction(
      { scrollTop: NaN, pinned: false },
      { maxScrollTop: NaN, scrolledAway: true, userIntentAfterCapture: false },
    ),
    { type: 'restore', top: 0 },
  );
});

test('property: restore never exceeds the range and never passes the captured offset', () => {
  fc.assert(
    fc.property(
      fc.double({ min: -2000, max: 5000, noNaN: true }),
      fc.double({ min: 0, max: 5000, noNaN: true }),
      (captured, maxScrollTop) => {
        const action = decideKeyboardAnchorAction(
          { scrollTop: captured, pinned: false },
          { maxScrollTop, scrolledAway: true, userIntentAfterCapture: false },
        );
        assert.equal(action.type, 'restore');
        if (action.type !== 'restore') return;
        assert.ok(action.top >= 0);
        assert.ok(action.top <= maxScrollTop);
        assert.ok(action.top <= Math.max(0, captured));
      },
    ),
    { numRuns: 200 },
  );
});
