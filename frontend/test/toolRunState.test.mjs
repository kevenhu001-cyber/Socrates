import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOOL_RUN_PHASES,
  phaseFromProgress,
  summarizeToolRuns,
  transitionToolRun,
} from '../src/chat/toolRunState.js';

test('tool run state keeps the first terminal SSE result', () => {
  const running = { id: 'run-1', phase: TOOL_RUN_PHASES.running };
  const failed = transitionToolRun(running, TOOL_RUN_PHASES.failed);
  const lateSuccess = transitionToolRun(failed, TOOL_RUN_PHASES.succeeded);
  assert.equal(failed.phase, TOOL_RUN_PHASES.failed);
  assert.equal(lateSuccess, failed);
});

test('timeout warnings remain active until an actual terminal result arrives', () => {
  assert.equal(phaseFromProgress({ phase: 'timeout_warning' }), TOOL_RUN_PHASES.running);
  assert.equal(phaseFromProgress({ phase: 'timeout' }), TOOL_RUN_PHASES.timed_out);
});

test('tool run summaries distinguish active, completed, and failed work', () => {
  const summary = summarizeToolRuns([
    { phase: TOOL_RUN_PHASES.running },
    { phase: TOOL_RUN_PHASES.succeeded },
    { phase: TOOL_RUN_PHASES.failed },
  ]);
  assert.deepEqual(summary, { total: 3, active: 1, succeeded: 1, failed: 1, cancelled: 0, timed_out: 0 });
});
