/**
 * toolRunConformance — the TypeScript half of the twin-implementation test.
 *
 * The ToolRun phase state machine exists twice: here in TypeScript (used by
 * the web SPA's JS fallback and by mobile) and in Rust
 * (tools-rust/crates/socrates-protocol/src/phases.rs, compiled to the WASM
 * the SPA prefers when it loads). Both read
 * packages/contracts/toolRunConformance.fixture.json and assert against the
 * same `expected` values, so a change to one implementation fails the other's
 * test run instead of producing a client-dependent bug.
 *
 * Run with:  node --experimental-strip-types --test packages/core/src/toolRunConformance.test.ts
 * (also picked up by the `shared` CI job)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pureToolRunApi, TOOL_RUN_PHASES } from './toolRun.ts';

interface Fixture {
  phases: Record<string, string>;
  isTerminal: Array<{ phase: string; expected: boolean }>;
  phaseFromProgress: Array<{ input: string; expected: string; why?: string }>;
  transition: Array<{ current: string; next: string; expected: string; why?: string }>;
  summarize: Array<{
    runs: (string | null)[];
    expected: { total: number; succeeded: number; failed: number; cancelled: number; timed_out: number; active: number };
    why?: string;
  }>;
}

const FIXTURE_PATH = fileURLToPath(
  new URL('../../contracts/toolRunConformance.fixture.json', import.meta.url),
);
const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

const api = pureToolRunApi;

describe('toolRun conformance: phase vocabulary', () => {
  test('TOOL_RUN_PHASES matches the fixture exactly', () => {
    // Both implementations hard-code this list. If they drift, every other
    // case below becomes untrustworthy, so check it first.
    assert.deepEqual(
      Object.fromEntries(Object.entries(TOOL_RUN_PHASES)),
      fixture.phases,
      'the phase vocabulary diverged from the shared fixture',
    );
  });
});

describe('toolRun conformance: isTerminalToolPhase', () => {
  for (const c of fixture.isTerminal) {
    test(`${JSON.stringify(c.phase)} -> ${c.expected}`, () => {
      assert.equal(api.isTerminalToolPhase(c.phase), c.expected);
    });
  }
});

describe('toolRun conformance: phaseFromProgress', () => {
  for (const c of fixture.phaseFromProgress) {
    test(`${JSON.stringify(c.input)} -> ${c.expected}${c.why ? ` (${c.why.slice(0, 60)}…)` : ''}`, () => {
      assert.equal(api.phaseFromProgress({ phase: c.input }), c.expected, c.why);
    });
  }

  test('a null progress object is treated as running, not as an error', () => {
    assert.equal(api.phaseFromProgress(null), TOOL_RUN_PHASES.running);
  });
});

describe('toolRun conformance: transitionToolRun', () => {
  for (const c of fixture.transition) {
    test(`${c.current} + ${JSON.stringify(c.next)} -> ${c.expected}${c.why ? ' *' : ''}`, () => {
      const run = { id: 'r', tool: 't', phase: c.current, startedAt: 0 };
      assert.equal(api.transitionToolRun(run, c.next).phase, c.expected, c.why);
    });
  }

  test('a patch is applied on a non-terminal run', () => {
    const run = { id: 'r', tool: 't', phase: 'running', startedAt: 0 };
    const next = api.transitionToolRun(run, 'succeeded', { output: 'done' } as never);
    assert.equal(next.phase, 'succeeded');
    assert.equal((next as { output?: string }).output, 'done');
  });

  test('a patch is NOT applied once the run is terminal', () => {
    // Same stickiness rule as the phase: a late frame must not rewrite the
    // recorded result of a finished run.
    const run = { id: 'r', tool: 't', phase: 'succeeded', startedAt: 0, output: 'first' };
    const next = api.transitionToolRun(run as never, 'failed', { output: 'second' } as never);
    assert.equal(next.phase, 'succeeded');
    assert.equal((next as { output?: string }).output, 'first');
  });
});

describe('toolRun conformance: summarizeToolRuns', () => {
  for (const [i, c] of fixture.summarize.entries()) {
    test(`case ${i}: [${c.runs.map((r) => (r === null ? 'null' : JSON.stringify(r))).join(', ')}]`, () => {
      const runs = c.runs.map((phase) =>
        phase === null ? null : { id: 'r', tool: 't', phase, startedAt: 0 });
      const got = api.summarizeToolRuns(runs as never);
      assert.deepEqual(
        {
          total: got.total,
          succeeded: got.succeeded,
          failed: got.failed,
          cancelled: got.cancelled,
          timed_out: got.timed_out,
          active: got.active,
        },
        c.expected,
        c.why,
      );
    });
  }
});
