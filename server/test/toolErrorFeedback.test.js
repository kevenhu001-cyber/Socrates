import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildToolErrorFeedback,
  canonicalToolExample,
  canonicalToolExampleJson,
  describeToolSchema,
} from '../src/services/toolErrorFeedback.ts';
import { PLAN_TOOL, SPEC_TOOL, executePlan, executeSpec } from '../src/services/planning.ts';
import { VISUALIZATION_TOOL, executeVisualization } from '../src/services/visualization.ts';
import { WEB_SEARCH_TOOL } from '../src/services/webSearch.ts';
import { WEB_FETCH_TOOL } from '../src/services/fetchBatch.ts';
import { repairToolArguments } from '../src/services/toolCallSafety.ts';

/* The whole point of shipping an example is that a model can copy it
   verbatim and succeed. Assert that against each tool's real executor. */
test('canonical examples pass the executors that validate them', () => {
  const plan = executePlan(canonicalToolExample('create_plan', PLAN_TOOL.function.parameters));
  assert.equal(plan.status, 'completed', `plan example rejected: ${JSON.stringify(plan.detail)}`);

  const spec = executeSpec(canonicalToolExample('create_spec', SPEC_TOOL.function.parameters));
  assert.equal(spec.status, 'completed', `spec example rejected: ${JSON.stringify(spec.detail)}`);

  const visual = executeVisualization(canonicalToolExample('render_visualization', VISUALIZATION_TOOL.function.parameters));
  assert.equal(visual.status, 'completed', `visual example rejected: ${JSON.stringify(visual.detail)}`);
});

test('web search asks for natural prose and separately displayed sources instead of raw citation markers', () => {
  const description = WEB_SEARCH_TOOL.function.description;
  assert.match(description, /Do NOT add \[1\]\/\[2\] citation markers/);
  assert.match(description, /source card/i);
  assert.doesNotMatch(description, /cite material claims inline/i);
});

test('canonical examples satisfy their own schemas without repair', () => {
  const cases = [
    ['web_search', WEB_SEARCH_TOOL.function.parameters],
    ['web_fetch', WEB_FETCH_TOOL.function.parameters],
    ['create_plan', PLAN_TOOL.function.parameters],
    ['create_spec', SPEC_TOOL.function.parameters],
    ['render_visualization', VISUALIZATION_TOOL.function.parameters],
  ];
  for (const [name, schema] of cases) {
    const json = canonicalToolExampleJson(name, schema);
    assert.ok(json, `${name} should have an example`);
    const repaired = repairToolArguments(json, schema);
    assert.equal(repaired.ok, true, `${name} example must parse`);
    assert.deepEqual(repaired.repairs, [], `${name} example must need no repair`);
  }
});

test('canonicalToolExample falls back to a schema-derived skeleton', () => {
  const example = canonicalToolExample('some_new_tool', {
    type: 'object',
    required: ['name', 'limit', 'tags'],
    properties: {
      name: { type: 'string' },
      limit: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
      mode: { type: 'string', enum: ['fast', 'slow'] },
    },
  });
  assert.deepEqual(example, { name: '<name>', limit: 1, tags: ['<tags>'] });
});

test('describeToolSchema lists fields, types, enums and required flags', () => {
  const described = describeToolSchema({
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      count: { type: 'integer' },
      freshness: { type: 'string', enum: ['day', 'week'] },
      sites: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  });
  assert.match(described, /- query: string \(required\)/);
  assert.match(described, /- count: integer$/m);
  assert.match(described, /- freshness: one of "day" \| "week"/);
  assert.match(described, /- sites: array of string/);
  assert.match(described, /no other top-level fields/);
});

test('buildToolErrorFeedback embeds field errors, schema and a copyable example', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'web_search',
    schema: WEB_SEARCH_TOOL.function.parameters,
    errorCode: 'invalid_tool_arguments',
    fieldErrors: 'query: expected string, received object',
    retryable: true,
  });
  assert.match(feedback.modelMessage, /invalid_tool_arguments/);
  assert.match(feedback.modelMessage, /query: expected string/);
  assert.match(feedback.modelMessage, /- query: string \(required\)/);
  assert.match(feedback.modelMessage, /"query":"Python 3\.13 release date"/);
  assert.match(feedback.modelMessage, /no `input`\/`arguments` wrapper/);
  assert.match(feedback.modelMessage, /Send one corrected call/);
  assert.match(feedback.detail, /example: \{"query"/);
  assert.match(feedback.userMessage, /正确格式示例/);
});

test('buildToolErrorFeedback tells the model to stop when retries are exhausted', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'render_visualization',
    schema: VISUALIZATION_TOOL.function.parameters,
    errorCode: 'visual_spec_invalid',
    fieldErrors: ['payload.series: required'],
    retryable: false,
  });
  assert.match(feedback.modelMessage, /Do not repeat this call/);
  assert.doesNotMatch(feedback.modelMessage, /Send one corrected call/);
});

test('buildToolErrorFeedback lists callable tools for an unknown tool', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'delete_database',
    errorCode: 'unknown_tool',
    retryable: false,
    availableTools: ['web_search', 'code_interpreter'],
  });
  assert.match(feedback.modelMessage, /Callable tools for this turn: `web_search`, `code_interpreter`/);
  assert.doesNotMatch(feedback.modelMessage, /Expected arguments/);
});

test('buildToolErrorFeedback handles a turn with no callable tools', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'web_search',
    errorCode: 'tool_not_available',
    retryable: false,
    availableTools: [],
  });
  assert.match(feedback.modelMessage, /No native tools are callable/);
});
