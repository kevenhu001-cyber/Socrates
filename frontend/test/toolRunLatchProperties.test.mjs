import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  transitionToolRun,
} from '../src/chat/toolRunState.ts';

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

const ALL_PHASES = [...NON_TERMINAL_PHASES, ...TERMINAL_PHASES];

/* A phase-transition sequence: each element is the next phase fed to
   transitionToolRun. Include the empty sequence and unknown phases so the
   generator covers the whole transition space, not just the happy path. */
const phaseSequence = () => fc.array(
  fc.oneof(
    fc.constantFrom(...ALL_PHASES),
    fc.constantFrom('', 'unknown', 'weird_phase'),
  ),
  { minLength: 0, maxLength: 25 },
);

/* A starting run in an arbitrary non-terminal phase. */
const startingRun = () => fc.constantFrom(...NON_TERMINAL_PHASES).map((phase) => ({
  id: 'run-1',
  tool: 'sandbox',
  phase,
  startedAt: 0,
}));

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 5: The first terminal phase latches
//
// For any sequence of phase-transition events, once transitionToolRun produces
// a terminal phase, every subsequent transition on that run returns the same
// terminal phase unchanged.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 5: The first terminal phase latches', () => {
  fc.assert(
    fc.property(startingRun(), phaseSequence(), (initialRun, sequence) => {
      let current = initialRun;
      let latched = null; // the run object captured at the first terminal phase

      for (const nextPhase of sequence) {
        const before = current;
        current = transitionToolRun(before, nextPhase);

        if (latched !== null) {
          // Already terminal: every later transition is a no-op that returns
          // the same latched terminal phase, unchanged.
          assert.equal(isTerminalToolPhase(current.phase), true);
          assert.equal(current.phase, latched.phase);
          assert.equal(current, before);
        } else if (isTerminalToolPhase(current.phase)) {
          // First terminal phase reached this step: latch it.
          latched = current;
        }
      }
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 5: The first terminal phase latches
//
// Focused variant: after directly transitioning into each terminal phase, any
// further transition (to any phase, terminal or not) returns the identical
// run with the same terminal phase.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 5: The first terminal phase latches (single terminal then arbitrary follow-ups)', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...NON_TERMINAL_PHASES),
      fc.constantFrom(...TERMINAL_PHASES),
      fc.array(fc.constantFrom(...ALL_PHASES, '', 'unknown'), { minLength: 1, maxLength: 15 }),
      (startPhase, terminalPhase, followUps) => {
        const start = { id: 'run-1', tool: 'sandbox', phase: startPhase, startedAt: 0 };

        const terminal = transitionToolRun(start, terminalPhase);
        assert.equal(terminal.phase, terminalPhase);
        assert.equal(isTerminalToolPhase(terminal.phase), true);

        let current = terminal;
        for (const nextPhase of followUps) {
          const before = current;
          current = transitionToolRun(before, nextPhase);
          // Unchanged: same object, same terminal phase.
          assert.equal(current, before);
          assert.equal(current.phase, terminalPhase);
        }
      },
    ),
    { numRuns: RUNS },
  );
});
