import assert from 'node:assert/strict';
import test from 'node:test';

import { createToolTurnPolicy, hashToolArguments } from '../src/services/toolTurnPolicy.ts';

const ALL_TOOLS = ['web_search', 'code_interpreter', 'render_visualization', 'workspace_agent'];

test('default budget offers tools for twelve hops', () => {
  const policy = createToolTurnPolicy();
  assert.equal(policy.maxIterations, 12);
  assert.equal(policy.toolsAllowed(0), true);
  assert.equal(policy.toolsAllowed(11), true);
  assert.equal(policy.toolsAllowed(12), false);
});

test('two malformed calls no longer disable the toolset', () => {
  const policy = createToolTurnPolicy();
  policy.recordResult('web_search', false, 'invalid_tool_arguments');
  policy.recordResult('web_search', false, 'invalid_tool_arguments');
  assert.equal(policy.toolsAllowed(1), true);
  assert.deepEqual(policy.enabledToolNames(ALL_TOOLS), ALL_TOOLS);
  assert.equal(policy.remainingRetries('web_search'), 1);
});

test('a third consecutive failure withdraws only the failing tool', () => {
  const policy = createToolTurnPolicy();
  for (let i = 0; i < 3; i++) policy.recordResult('render_visualization', false, 'visual_spec_invalid');
  assert.deepEqual(policy.enabledToolNames(ALL_TOOLS), [
    'web_search', 'code_interpreter', 'workspace_agent',
  ]);
  assert.deepEqual(policy.disabledTools(), [{ name: 'render_visualization', reason: 'visual_spec_invalid' }]);
  assert.equal(policy.disabledReason('render_visualization'), 'visual_spec_invalid');
  assert.equal(policy.disabledReason('web_search'), null);
  assert.equal(policy.remainingRetries('render_visualization'), 0);
  // Other tools are untouched and the turn continues.
  assert.equal(policy.toolsAllowed(3), true);
});

test('a success resets the failure streak for that tool', () => {
  const policy = createToolTurnPolicy();
  policy.recordResult('code_interpreter', false, 'execution_failed');
  policy.recordResult('code_interpreter', false, 'execution_failed');
  policy.recordResult('code_interpreter', true);
  policy.recordResult('code_interpreter', false, 'execution_failed');
  assert.deepEqual(policy.disabledTools(), []);
  assert.equal(policy.remainingRetries('code_interpreter'), 2);
});

test('failures are tracked per tool, not globally', () => {
  const policy = createToolTurnPolicy();
  policy.recordResult('web_search', false, 'web_search_failed');
  policy.recordResult('code_interpreter', false, 'execution_failed');
  policy.recordResult('render_visualization', false, 'visual_spec_invalid');
  assert.deepEqual(policy.disabledTools(), []);
  assert.deepEqual(policy.enabledToolNames(ALL_TOOLS), ALL_TOOLS);
});

test('duplicate identical calls are detected before execution', () => {
  const policy = createToolTurnPolicy();
  const hash = hashToolArguments({ query: 'same' });
  assert.equal(policy.isDuplicate('web_search', hash), false);
  policy.registerCall('web_search', hash);
  assert.equal(policy.isDuplicate('web_search', hash), true);
  // A different tool or different arguments is not a duplicate.
  assert.equal(policy.isDuplicate('web_fetch', hash), false);
  assert.equal(policy.isDuplicate('web_search', hashToolArguments({ query: 'other' })), false);
});

test('a failed call releases its duplicate slot so an identical retry can run', () => {
  /* Transient failures (timeout, 429, flaky engine) make a same-args
     retry the correct recovery — the pair must not stay pinned. */
  const policy = createToolTurnPolicy();
  const hash = hashToolArguments({ query: 'flaky' });
  policy.registerCall('web_search', hash);
  assert.equal(policy.isDuplicate('web_search', hash), true);
  policy.unmarkCall('web_search', hash);
  assert.equal(policy.isDuplicate('web_search', hash), false);
  /* The call still counted against the budget — unmarking only frees
     the seen-pair, it is not a refund. */
  assert.equal(policy.snapshot().callsUsed, 1);
  /* Unmarking an unknown pair is a no-op, not an error. */
  policy.unmarkCall('web_search', 'never-registered');
  assert.equal(policy.isDuplicate('web_search', 'never-registered'), false);
});

test('hashToolArguments ignores key order but not values', () => {
  assert.equal(hashToolArguments({ a: 1, b: [2, { c: 3 }] }), hashToolArguments({ b: [2, { c: 3 }], a: 1 }));
  assert.notEqual(hashToolArguments({ a: 1 }), hashToolArguments({ a: 2 }));
  assert.equal(typeof hashToolArguments(undefined), 'string');
});

test('hashToolArguments distinguishes large payloads that differ only in the tail', () => {
  /* Regression: a bare 4 KB prefix used to classify two distinct large
     code bodies as duplicates because the difference sat past the cut. */
  const head = 'x'.repeat(8000);
  assert.notEqual(
    hashToolArguments({ code: `${head}return 1` }),
    hashToolArguments({ code: `${head}return 2` }),
  );
  // Identical large payloads must still collapse to the same key.
  const big = { code: `${head}return 1` };
  assert.equal(hashToolArguments(big), hashToolArguments({ ...big }));
  // Key stays bounded even for 80 KB arguments.
  assert.ok(hashToolArguments(big).length < big.code.length);
});

test('the absolute call ceiling stops tools even with iterations left', () => {
  const policy = createToolTurnPolicy({ maxTotalCalls: 2 });
  policy.registerCall('web_search', 'a');
  assert.equal(policy.budgetExhausted(), null);
  policy.registerCall('web_search', 'b');
  const exhausted = policy.budgetExhausted();
  assert.equal(exhausted?.code, 'tool_budget_exhausted');
  assert.equal(policy.toolsAllowed(1), false);
});

test('the wall-clock ceiling stops tools', () => {
  let clock = 1_000;
  const policy = createToolTurnPolicy({ wallClockMs: 60_000, now: () => clock });
  assert.equal(policy.toolsAllowed(0), true);
  clock += 60_001;
  assert.equal(policy.budgetExhausted()?.code, 'tool_time_budget_exhausted');
  assert.equal(policy.toolsAllowed(0), false);
});

test('snapshot reports the live budget for prompt generation', () => {
  const policy = createToolTurnPolicy({ maxIterations: 5, maxTotalCalls: 9, perToolFailureLimit: 2 });
  policy.noteIteration();
  policy.registerCall('web_search', 'a');
  policy.recordResult('web_search', false, 'invalid_tool_arguments');
  policy.recordResult('web_search', false, 'invalid_tool_arguments');
  assert.deepEqual(policy.snapshot(), {
    maxIterations: 5,
    iterationsUsed: 1,
    maxCallsPerIteration: policy.maxCallsPerIteration,
    maxTotalCalls: 9,
    callsUsed: 1,
    perToolFailureLimit: 2,
    disabled: [{ name: 'web_search', reason: 'invalid_tool_arguments' }],
  });
});

test('environment variables tune the budget', () => {
  const previous = { ...process.env };
  process.env.CHAT_MAX_TOOL_ITERATIONS = '6';
  process.env.CHAT_MAX_TOOL_CALLS_PER_TURN = '3';
  process.env.CHAT_TOOL_FAILURE_LIMIT = '1';
  try {
    const policy = createToolTurnPolicy();
    assert.equal(policy.maxIterations, 6);
    assert.equal(policy.maxCallsPerIteration, 3);
    policy.recordResult('web_search', false, 'invalid_tool_arguments');
    assert.deepEqual(policy.disabledTools(), [{ name: 'web_search', reason: 'invalid_tool_arguments' }]);
  } finally {
    process.env = previous;
  }
});
