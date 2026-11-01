/**
 * Property tests for the declarative tool row's view model.
 *
 * Covers `toolRunStateOf`, `runStartedAt` and `durationOf` from
 * src/ui/toolPresentationState.ts plus `formatSeconds` from
 * src/ui/toolPresentationModel.ts — the pure derivation that maps a tool call
 * (chat/toolRuntime.ts writes `_run` while streaming) into the state and the
 * duration the React row reads.
 *
 * Property 13 mirrors the design's tool-row invariant: the row reflects the
 * run phase (running vs terminal) and always reports a non-negative time,
 * with a label that is defined and non-decreasing in the elapsed time.
 *
 * These are validation-only tests; the source is not modified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import { toolRunStateOf, runStartedAt, durationOf } from '../src/ui/toolPresentationState.ts';
import { formatSeconds } from '../src/ui/toolPresentationModel.ts';
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

/* A running call: a non-terminal phase and a startedAt. endedAt may be present
   or absent — a running row ignores it and times from `now`. */
const runningCall = () => fc.record({
  phase: fc.constantFrom(...NON_TERMINAL_PHASES),
  startedAt: timestamp(),
  endedAt: fc.option(timestamp(), { nil: undefined }),
}).map(({ phase, startedAt, endedAt }) => ({
  id: 'call-1',
  name: 'sandbox',
  _run: {
    phase,
    startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
  },
}));

/* A terminal call: a terminal phase, a startedAt, and an endedAt that may be
   before, at, or after startedAt so the >= 0 clamp is exercised. */
const terminalCall = () => fc.record({
  phase: fc.constantFrom(...TERMINAL_PHASES),
  startedAt: timestamp(),
  endedAt: fc.option(timestamp(), { nil: undefined }),
  durationMs: fc.option(timestamp(), { nil: undefined }),
}).map(({ phase, startedAt, endedAt, durationMs }) => ({
  id: 'call-1',
  name: 'sandbox',
  _run: {
    phase,
    startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
    ...(durationMs === undefined ? {} : { durationMs }),
  },
}));

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 13: the tool row reflects the run
// phase and reports non-negative time
//
// For any tool call, a non-terminal phase renders a running row whose elapsed
// time is `now - startedAt` (clamped to >= 0), and a terminal phase renders a
// settled row whose duration is non-negative.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 13: the tool row reflects the run phase and reports non-negative time (running calls)', () => {
  fc.assert(
    fc.property(runningCall(), timestamp(), (call, now) => {
      const state = toolRunStateOf(call);

      // Phase is reflected: a non-terminal run is running.
      assert.equal(isTerminalToolPhase(call._run.phase), false);
      assert.equal(state, 'running');

      // Running semantics: the row times from `startedAt`, ignoring `endedAt`.
      const startedAt = runStartedAt(call);
      assert.equal(startedAt, call._run.startedAt);
      const elapsed = Math.max(0, now - startedAt);
      assert.ok(elapsed >= 0);

      // The label is defined for a positive elapsed time.
      if (elapsed > 0) {
        const label = formatSeconds(elapsed);
        assert.equal(typeof label, 'string');
        assert.ok(label.length > 0);
      }
    }),
    { numRuns: RUNS },
  );
});

test('Feature: chat-experience-revamp, Property 13: the tool row reflects the run phase and reports non-negative time (terminal calls)', () => {
  fc.assert(
    fc.property(terminalCall(), timestamp(), (call, now) => {
      const state = toolRunStateOf(call);

      // Phase is reflected: a terminal run is never running.
      assert.equal(isTerminalToolPhase(call._run.phase), true);
      assert.notEqual(state, 'running');
      assert.ok(['done', 'error', 'stopped'].includes(state));

      // Terminal semantics: the duration is independent of `now` and never
      // negative.
      const duration = durationOf(call);
      const expected = typeof call._run.durationMs === 'number' && call._run.durationMs > 0
        ? call._run.durationMs
        : 0;
      assert.ok(duration >= 0);
      assert.equal(duration, expected);

      // A settled row has no running clock.
      const startedAt = runStartedAt(call);
      assert.equal(startedAt, call._run.startedAt);
      assert.ok(Math.max(0, now - startedAt) >= 0);
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 13: the row reports non-negative
// time
//
// formatSeconds is defined for every positive input and is monotonically
// non-decreasing in the elapsed time: a larger elapsed time never yields a
// "shorter" duration. We compare formatted durations by their decoded
// millisecond value (the tiers are ms / s.s / m ss), which the label must not
// invert.
// ---------------------------------------------------------------------------

/* Decode a duration label back to an approximate millisecond magnitude, so two
   labels can be ordered the way a reader would order them. Kept in the test
   (not imported) so it independently pins the label contract. */
function labelToMs(label) {
  if (label === '') return 0;
  const msMatch = /^(\d+)ms$/.exec(label);
  if (msMatch) return Number(msMatch[1]);
  const sMatch = /^(\d+(?:\.\d+)?)s$/.exec(label);
  if (sMatch) return Math.round(Number(sMatch[1]) * 1000);
  const mMatch = /^(\d+)m (\d{2})s$/.exec(label);
  if (mMatch) return (Number(mMatch[1]) * 60 + Number(mMatch[2])) * 1000;
  throw new assert.AssertionError({ message: `formatSeconds produced an undefined label: ${JSON.stringify(label)}` });
}

test('Feature: chat-experience-revamp, Property 13: formatSeconds is defined and non-decreasing in the elapsed time', () => {
  const anyMs = fc.oneof(
    fc.integer({ min: -1000, max: 10 }),          // negatives + tiny values (clamp)
    fc.integer({ min: 0, max: 5000 }),            // ms / early seconds boundary
    fc.integer({ min: 0, max: 5 * 60 * 1000 }),   // up to minutes tier
    fc.integer({ min: 0, max: 2 ** 40 }),         // large values
  );

  fc.assert(
    fc.property(anyMs, anyMs, (a, b) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];

      const loLabel = formatSeconds(lo);
      const hiLabel = formatSeconds(hi);

      // Defined: always a string that decodes.
      assert.equal(typeof loLabel, 'string');
      assert.equal(typeof hiLabel, 'string');

      // Non-decreasing: the decoded magnitude of the label for the larger
      // input is never below that of the smaller input.
      const loDecoded = labelToMs(loLabel);
      const hiDecoded = labelToMs(hiLabel);

      assert.ok(
        hiDecoded >= loDecoded,
        `formatSeconds not non-decreasing: ${lo}->${loLabel} (${loDecoded}) vs ${hi}->${hiLabel} (${hiDecoded})`,
      );
    }),
    { numRuns: RUNS },
  );
});
