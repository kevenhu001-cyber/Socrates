import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import { shouldRetryInterruptedStream } from '../src/chat/streamRetry.ts';

const RUNS = 200;

/* A decision over the full space: independent heartbeat/semantic flags plus
   attempt / maxAttempts counters spanning below, at, and above the ceiling. */
const decision = () => fc.record({
  isHeartbeat: fc.boolean(),
  semanticActivity: fc.boolean(),
  attempt: fc.integer({ min: 0, max: 40 }),
  maxAttempts: fc.integer({ min: 0, max: 40 }),
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 7: Heartbeat interruptions replay
// only before semantic activity (below max attempts)
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 7: Heartbeat interruptions replay only before semantic activity', () => {
  fc.assert(
    fc.property(decision(), (d) => {
      // The controller replays exactly when the interruption is a heartbeat,
      // no semantic activity has reached the UI, and we are below the ceiling.
      const expected = d.isHeartbeat
        && !d.semanticActivity
        && d.attempt < d.maxAttempts;

      assert.equal(shouldRetryInterruptedStream(d), expected);
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 7: a non-heartbeat interruption or
// any observed semantic activity is never replayed, regardless of attempts.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 7: non-heartbeat or semantic activity never replays', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.boolean(),
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 0, max: 40 }),
      (isHeartbeat, semanticActivity, attempt, maxAttempts) => {
        // Force at least one disqualifying condition: not a heartbeat, or
        // semantic output already emitted.
        fc.pre(!isHeartbeat || semanticActivity);
        assert.equal(
          shouldRetryInterruptedStream({ isHeartbeat, semanticActivity, attempt, maxAttempts }),
          false,
        );
      },
    ),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 7: the attempt ceiling is honored
// for otherwise-replayable heartbeat interruptions.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 7: heartbeat replays only below the attempt ceiling', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 40 }),
      fc.integer({ min: 0, max: 40 }),
      (attempt, maxAttempts) => {
        // Heartbeat with no semantic activity isolates the ceiling condition.
        const result = shouldRetryInterruptedStream({
          isHeartbeat: true,
          semanticActivity: false,
          attempt,
          maxAttempts,
        });
        assert.equal(result, attempt < maxAttempts);
      },
    ),
    { numRuns: RUNS },
  );
});
