/**
 * Property tests for the tool-card view model.
 *
 * Covers `toolCardView` and `formatDuration` from src/ui/toolCardView.ts, the
 * pure derivation that maps a normalized `ToolRun` (chat/toolRunState.ts) plus
 * the current clock into the small view model the tool-card renderer reads.
 *
 * Property 13 mirrors the design's tool-card invariant: the view reflects the
 * run phase (running vs terminal) and always reports a non-negative time —
 *   running:  timeMs = now - startedAt
 *   terminal: timeMs = endedAt - startedAt   (endedAt falls back to startedAt)
 * with timeMs >= 0 in both cases, and formatDuration always defined and
 * non-decreasing in timeMs.
 *
 * These are validation-only tests; the source is not modified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import { toolCardView, formatDuration } from '../src/ui/toolCardView.ts';
import { TOOL_RUN_PHASES, isTerminalToolPhase } from '../src/chat/toolRunState.ts';

const RUNS = 200;

const NON_TERMINAL_PHASES = [
  TOOL_RUN_PHASES.queued,
  TOOL_RUN_PHASES.preparing,
  TOOL_RUN_PHASES.running,
];

const TERMINAL_PHASES = [
  TOOL_RUN_PHASES.succeeded,
  TOOL_RUN_PHASES.failed,
  TOOL_RUN_PHASES.cancelled,
  TOOL_RUN_PHASES.timed_out,
];

/* A finite, non-negative millisecond timestamp. Kept well below Number's
   integer-safe ceiling so differences stay exact. */
const timestamp = () => fc.integer({ min: 0, max: 2 ** 45 });

/* A running run: a non-terminal phase and a startedAt. endedAt may be present
   or absent — for a running run the view must ignore it and use `now`. */
const runningRun = () => fc.record({
  phase: fc.constantFrom(...NON_TERMINAL_PHASES),
  startedAt: timestamp(),
  endedAt: fc.option(timestamp(), { nil: undefined }),
}).map(({ phase, startedAt, endedAt }) => ({
  id: 'run-1',
  tool: 'sandbox',
  phase,
  startedAt,
  ...(endedAt === undefined ? {} : { endedAt }),
}));

/* A terminal run: a terminal phase, a startedAt, and an endedAt that may be
   before, at, or after startedAt so the >= 0 clamp is exercised. endedAt is
   sometimes omitted to exercise the `endedAt ?? startedAt` fallback. */
const terminalRun = () => fc.record({
  phase: fc.constantFrom(...TERMINAL_PHASES),
  startedAt: timestamp(),
  endedAt: fc.option(timestamp(), { nil: undefined }),
}).map(({ phase, startedAt, endedAt }) => ({
  id: 'run-1',
  tool: 'sandbox',
  phase,
  startedAt,
  ...(endedAt === undefined ? {} : { endedAt }),
}));

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 13: The tool-card view reflects run
// phase and reports non-negative time
//
// For any tool run, toolCardView(run, now) reports running=true with
// timeMs = now - startedAt when the phase is non-terminal, and running=false
// with timeMs = endedAt - startedAt when the phase is terminal; in both cases
// timeMs >= 0 and formatDuration(timeMs) is defined and non-decreasing in
// timeMs.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 13: The tool-card view reflects run phase and reports non-negative time (running runs)', () => {
  fc.assert(
    fc.property(runningRun(), timestamp(), (run, now) => {
      const view = toolCardView(run, now);

      // Phase is reflected: a non-terminal run is running.
      assert.equal(isTerminalToolPhase(run.phase), false);
      assert.equal(view.running, true);
      assert.equal(view.phase, run.phase);

      // Running semantics: timeMs = now - startedAt, clamped to >= 0, and
      // endedAt is ignored while running.
      const expected = Math.max(0, now - run.startedAt);
      assert.equal(view.timeMs, expected);
      assert.ok(view.timeMs >= 0);

      // Label is defined and matches the pure formatter for that timeMs.
      assert.equal(typeof view.timeLabel, 'string');
      assert.ok(view.timeLabel.length > 0);
      assert.equal(view.timeLabel, formatDuration(view.timeMs));
    }),
    { numRuns: RUNS },
  );
});

test('Feature: chat-experience-revamp, Property 13: The tool-card view reflects run phase and reports non-negative time (terminal runs)', () => {
  fc.assert(
    fc.property(terminalRun(), timestamp(), (run, now) => {
      const view = toolCardView(run, now);

      // Phase is reflected: a terminal run is not running.
      assert.equal(isTerminalToolPhase(run.phase), true);
      assert.equal(view.running, false);
      assert.equal(view.phase, run.phase);

      // Terminal semantics: timeMs = (endedAt ?? startedAt) - startedAt,
      // clamped to >= 0, and independent of `now`.
      const end = run.endedAt ?? run.startedAt;
      const expected = Math.max(0, end - run.startedAt);
      assert.equal(view.timeMs, expected);
      assert.ok(view.timeMs >= 0);

      // Label is defined and matches the pure formatter for that timeMs.
      assert.equal(typeof view.timeLabel, 'string');
      assert.ok(view.timeLabel.length > 0);
      assert.equal(view.timeLabel, formatDuration(view.timeMs));
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 13: The tool-card view reflects run
// phase and reports non-negative time
//
// formatDuration is defined for every non-negative input and is monotonically
// non-decreasing in timeMs: a larger elapsed time never yields a "shorter"
// duration. We compare formatted durations by their decoded millisecond value
// (the tiers are ms / s.s / m ss), which the label must not invert.
// ---------------------------------------------------------------------------

/* Decode a formatDuration label back to an approximate millisecond magnitude,
   so two labels can be ordered the way a reader would order them. Kept in the
   test (not imported) so it independently pins the label contract. */
function labelToMs(label) {
  const msMatch = /^(\d+)ms$/.exec(label);
  if (msMatch) return Number(msMatch[1]);
  const sMatch = /^(\d+(?:\.\d+)?)s$/.exec(label);
  if (sMatch) return Math.round(Number(sMatch[1]) * 1000);
  const mMatch = /^(\d+)m (\d{2})s$/.exec(label);
  if (mMatch) return (Number(mMatch[1]) * 60 + Number(mMatch[2])) * 1000;
  throw new assert.AssertionError({ message: `formatDuration produced an undefined label: ${JSON.stringify(label)}` });
}

test('Feature: chat-experience-revamp, Property 13: formatDuration is defined and non-decreasing in timeMs', () => {
  const anyMs = fc.oneof(
    fc.integer({ min: -1000, max: 10 }),          // negatives + tiny values (clamp/floor)
    fc.integer({ min: 0, max: 5000 }),            // ms / early seconds boundary
    fc.integer({ min: 0, max: 5 * 60 * 1000 }),   // up to minutes tier
    fc.integer({ min: 0, max: 2 ** 40 }),         // large values
  );

  fc.assert(
    fc.property(anyMs, anyMs, (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];

      const loLabel = formatDuration(lo);
      const hiLabel = formatDuration(hi);

      // Defined: always a non-empty string that decodes.
      assert.equal(typeof loLabel, 'string');
      assert.equal(typeof hiLabel, 'string');
      assert.ok(loLabel.length > 0 && hiLabel.length > 0);

      // Non-decreasing: the decoded magnitude of the label for the larger
      // (clamped/floored) input is never below that of the smaller input.
      // Compare against the same clamp+floor the formatter applies internally.
      const loClamped = Math.max(0, Math.floor(lo));
      const hiClamped = Math.max(0, Math.floor(hi));
      const loDecoded = labelToMs(loLabel);
      const hiDecoded = labelToMs(hiLabel);

      if (loClamped <= hiClamped) {
        assert.ok(
          hiDecoded >= loDecoded,
          `formatDuration not non-decreasing: ${lo}->${loLabel} (${loDecoded}) vs ${hi}->${hiLabel} (${hiDecoded})`,
        );
      }
    }),
    { numRuns: RUNS },
  );
});
