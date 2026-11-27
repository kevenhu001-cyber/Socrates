import assert from 'node:assert/strict';
import test from 'node:test';

import { createToolTurnPolicy, hashToolArguments } from '../src/services/tools/toolTurnPolicy.js';

const ALL_TOOLS = ['web_search', 'code_interpreter', 'render_intelligent_ui', 'workspace_agent'];

test('default budget offers tools for twelve hops', () => {
  const policy = createToolTurnPolicy();
  assert.equal(policy.maxIterations, 12);
  assert.equal(policy.toolsAllowed(0), true);
  assert.equal(policy.toolsAllowed(11), true);
  assert.equal(policy.toolsAllowed(12), false);
});

test('reasoning effort scales the tool budget down for quick answers', () => {
  const instant = createToolTurnPolicy({ reasoningEffort: 'none' });
  assert.equal(instant.maxIterations, 2);
  assert.equal(instant.maxCallsPerIteration, 4);
  assert.equal(instant.snapshot().maxTotalCalls, 4);

  const low = createToolTurnPolicy({ reasoningEffort: 'low' });
  assert.equal(low.maxIterations, 4);
  assert.equal(low.maxCallsPerIteration, 6);
  assert.equal(low.snapshot().maxTotalCalls, 8);
  assert.equal(low.toolsAllowed(3), true);
  assert.equal(low.toolsAllowed(4), false);

  const medium = createToolTurnPolicy({ reasoningEffort: 'medium' });
  assert.equal(medium.maxIterations, 8);
  assert.equal(medium.snapshot().maxTotalCalls, 16);

  const high = createToolTurnPolicy({ reasoningEffort: 'high' });
  assert.equal(high.maxIterations, 12);
  assert.equal(high.snapshot().maxTotalCalls, 24);
});

test('an explicit environment budget wins over the effort default', () => {
  const previous = process.env.CHAT_MAX_TOOL_ITERATIONS;
  process.env.CHAT_MAX_TOOL_ITERATIONS = '9';
  try {
    const low = createToolTurnPolicy({ reasoningEffort: 'low' });
    assert.equal(low.maxIterations, 9);
  } finally {
    if (previous === undefined) delete process.env.CHAT_MAX_TOOL_ITERATIONS;
    else process.env.CHAT_MAX_TOOL_ITERATIONS = previous;
  }
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
  for (let i = 0; i < 3; i++)
    policy.recordResult('render_intelligent_ui', false, 'invalid_tool_arguments');
  assert.deepEqual(policy.enabledToolNames(ALL_TOOLS), [
    'web_search',
    'code_interpreter',
    'workspace_agent',
  ]);
  assert.deepEqual(policy.disabledTools(), [
    { name: 'render_intelligent_ui', reason: 'invalid_tool_arguments' },
  ]);
  assert.equal(policy.disabledReason('render_intelligent_ui'), 'invalid_tool_arguments');
  assert.equal(policy.disabledReason('web_search'), null);
  assert.equal(policy.remainingRetries('render_intelligent_ui'), 0);
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
  policy.recordResult('render_intelligent_ui', false, 'invalid_tool_arguments');
  assert.deepEqual(policy.disabledTools(), []);
  assert.deepEqual(policy.enabledToolNames(ALL_TOOLS), ALL_TOOLS);
});

test('duplicate identical calls are detected before execution', () => {
  const policy = createToolTurnPolicy();
  const hash = hashToolArguments({ query: 'same' });
  assert.equal(policy.isDuplicate('web_search', hash), false);
  assert.equal(policy.registerCall('web_search', hash), null);
  assert.equal(policy.isDuplicate('web_search', hash), true);
  assert.equal(policy.registerCall('web_search', hash)?.code, 'duplicate_tool_call');
  assert.equal(policy.snapshot().callsUsed, 1);
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
  assert.equal(
    hashToolArguments({ a: 1, b: [2, { c: 3 }] }),
    hashToolArguments({ b: [2, { c: 3 }], a: 1 }),
  );
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

test('hashToolArguments distinguishes same-length edits in the middle of long arguments', () => {
  const head = 'a'.repeat(5000);
  const tail = 'z'.repeat(5000);
  const first = hashToolArguments({ code: head + 'return 1' + tail });
  const second = hashToolArguments({ code: head + 'return 2' + tail });
  assert.notEqual(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  const policy = createToolTurnPolicy();
  policy.registerCall('code_interpreter', first);
  assert.equal(policy.isDuplicate('code_interpreter', second), false);
  assert.equal(policy.isDuplicate('code_interpreter', first), true);
});

test('the absolute call ceiling stops tools even with iterations left', () => {
  const policy = createToolTurnPolicy({ maxTotalCalls: 2 });
  policy.registerCall('web_search', 'a');
  assert.equal(policy.budgetExhausted(), null);
  policy.registerCall('web_search', 'b');
  const exhausted = policy.budgetExhausted();
  assert.equal(exhausted?.code, 'tool_budget_exhausted');
  assert.equal(policy.toolsAllowed(1), false);
  assert.equal(policy.registerCall('web_search', 'c')?.code, 'tool_budget_exhausted');
  assert.equal(policy.snapshot().callsUsed, 2);
  assert.equal(policy.isDuplicate('web_search', 'c'), false);
});

test('the wall-clock ceiling stops tools', () => {
  let clock = 1_000;
  const policy = createToolTurnPolicy({ wallClockMs: 60_000, now: () => clock });
  assert.equal(policy.toolsAllowed(0), true);
  clock += 60_001;
  assert.equal(policy.budgetExhausted()?.code, 'tool_time_budget_exhausted');
  assert.equal(policy.toolsAllowed(0), false);
  assert.equal(policy.registerCall('web_search', 'late')?.code, 'tool_time_budget_exhausted');
  assert.equal(policy.snapshot().callsUsed, 0);
});

test('snapshot reports the live budget for prompt generation', () => {
  const policy = createToolTurnPolicy({
    maxIterations: 5,
    maxTotalCalls: 9,
    perToolFailureLimit: 2,
  });
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
    assert.deepEqual(policy.disabledTools(), [
      { name: 'web_search', reason: 'invalid_tool_arguments' },
    ]);
  } finally {
    process.env = previous;
  }
});
