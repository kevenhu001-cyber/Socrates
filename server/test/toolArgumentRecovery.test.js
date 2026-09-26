// @ts-check
/**
 * toolArgumentRecovery — regressions for the tool-call "format error" chain.
 *
 * Every case here is a call that a user saw rejected as
 * `invalid_tool_arguments` ("工具参数格式无效") even though nothing was wrong
 * with the model's intent. The failures came from three layers cooperating
 * badly rather than from the model:
 *
 *   1. transport — the SSE accumulator dropped deltas that looked like a
 *      repeat of the accumulated tail (covered in llm.test.js),
 *   2. repair — unknown keys were deleted before the executor's own
 *      normalizer could move them where they belong,
 *   3. validation — the pipeline's shallow pre-pass rejected shapes the
 *      executor's zod schema accepts after normalization.
 *
 * The tests below pin the recovered behaviour at each boundary and the
 * size contract that has to hold between a schema and the transport cap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TOOL_ARGUMENT_CHARS,
  MAX_TOOL_STRING_FIELD_CHARS,
  TOOL_ARGUMENT_ERRORS,
  parseToolArguments,
  repairToolArguments,
  validateToolArguments,
} from '../src/services/toolCallSafety.js';
import { SELF_NORMALIZING_TOOLS } from '../src/services/toolRegistry.js';
import { VISUALIZATION_TOOL, executeVisualization, validateVisualizationSpec } from '../src/services/visualization.js';
import { PLAN_TOOL, SPEC_TOOL, executePlan, executeSpec } from '../src/services/planning.js';
import { CREATE_SITE_TOOL } from '../src/services/siteCreation.js';
import { buildToolErrorFeedback } from '../src/services/toolErrorFeedback.js';

const VIZ_SCHEMA = VISUALIZATION_TOOL.function.parameters;
const PLAN_SCHEMA = PLAN_TOOL.function.parameters;

/** What the pipeline does with one streamed argument string. */
function prepareArguments(toolName, raw, schema) {
  const selfNormalizing = SELF_NORMALIZING_TOOLS.has(toolName);
  const repaired = repairToolArguments(raw, schema, { dropUnknown: !selfNormalizing });
  if (!repaired.ok) return { ok: false, code: repaired.error, args: null };
  if (!selfNormalizing) {
    const validation = validateToolArguments(repaired.value, schema);
    if (!validation.ok) {
      return { ok: false, code: TOOL_ARGUMENT_ERRORS.schema, args: repaired.value, fieldErrors: validation.fieldErrors };
    }
  }
  return { ok: true, code: null, args: repaired.value, repairs: repaired.repairs };
}

/* ── parse boundary ───────────────────────────────────────────────── */

test('parseToolArguments recovers a complete object with junk around it', () => {
  /* Stray text behind the object (a fragment stream that over-ran) … */
  assert.deepEqual(parseToolArguments('{"query":"safe"}"junk'), { ok: true, value: { query: 'safe' } });
  /* … and a `{}` placeholder in front of it. */
  assert.deepEqual(parseToolArguments('{}{"query":"safe"}'), { ok: true, value: { query: 'safe' } });
  /* An empty object on its own is still a valid (empty) argument set. */
  assert.deepEqual(parseToolArguments('{}'), { ok: true, value: {} });
});

test('parseToolArguments refuses to invent an object from a truncated one', () => {
  /* The outer object never closes: recovering the inner `{"b":1}` would
     silently run the tool with the wrong arguments. */
  const result = parseToolArguments('{"a":{"b":1}');
  assert.equal(result.ok, false);
  assert.equal(result.error, TOOL_ARGUMENT_ERRORS.parse);
});

test('oversized arguments report their own error code', () => {
  const huge = `{"code":"${'x'.repeat(MAX_TOOL_ARGUMENT_CHARS)}"}`;
  assert.equal(parseToolArguments(huge).error, TOOL_ARGUMENT_ERRORS.tooLarge);
  /* Truncated at exactly the cap (what normalizeToolCalls does) still
     reports "too large" rather than a generic parse failure. */
  const truncated = huge.slice(0, MAX_TOOL_ARGUMENT_CHARS);
  assert.equal(repairToolArguments(truncated).error, TOOL_ARGUMENT_ERRORS.tooLarge);
});

test('unparseable arguments report the parse code', () => {
  assert.equal(repairToolArguments('{"query":').error, TOOL_ARGUMENT_ERRORS.parse);
});

/* ── repair boundary ──────────────────────────────────────────────── */

test('repairToolArguments keeps unknown keys when the executor normalizes them', () => {
  const schema = {
    type: 'object',
    required: ['query'],
    properties: { query: { type: 'string' } },
    additionalProperties: false,
  };
  const dropped = repairToolArguments('{"query":"safe","extra":1}', schema);
  assert.deepEqual(dropped.value, { query: 'safe' });
  assert.deepEqual(dropped.repairs, ['dropped_unknown:extra']);

  const kept = repairToolArguments('{"query":"safe","extra":1}', schema, { dropUnknown: false });
  assert.deepEqual(kept.value, { query: 'safe', extra: 1 });
  assert.deepEqual(kept.repairs, []);
});

/* ── the calls that used to fail ──────────────────────────────────── */

test('render_visualization: top-level chart keys reach the executor', () => {
  /* The model puts template keys at the top level instead of under
     `payload` — exactly what visualization.ts normalizeSpec() exists to
     fix. The repair pass used to delete them first, and the call was
     rejected for "template / accessibilitySummary / payload missing". */
  const raw = JSON.stringify({
    version: 1,
    type: 'bar',
    title: '各科目得分',
    summary: '三科分数对比',
    categories: ['数学', '物理'],
    series: [{ name: '得分', data: [92, 85] }],
  });
  const prepared = prepareArguments('render_visualization', raw, VIZ_SCHEMA);
  assert.equal(prepared.ok, true);
  const result = executeVisualization(prepared.args);
  assert.equal(result.status, 'completed');
  assert.equal(result.visualization.template, 'bar');
  assert.deepEqual(result.visualization.payload.categories, ['数学', '物理']);
});

test('create_plan: steps under an alias, or as bare strings, still run', () => {
  const aliased = prepareArguments('create_plan', JSON.stringify({ title: '两周复习', items: ['梳理极限', '导数练习'] }), PLAN_SCHEMA);
  assert.equal(aliased.ok, true);
  const aliasedResult = executePlan(aliased.args);
  assert.equal(aliasedResult.status, 'completed');
  assert.equal(aliasedResult.plan.steps.length, 2);

  const bareStrings = prepareArguments('create_plan', JSON.stringify({ title: '两周复习', steps: ['梳理极限', '导数练习'] }), PLAN_SCHEMA);
  assert.equal(bareStrings.ok, true);
  const bareResult = executePlan(bareStrings.args);
  assert.equal(bareResult.status, 'completed');
  assert.deepEqual(bareResult.plan.steps.map((step) => step.title), ['梳理极限', '导数练习']);

  /* An extra per-step key is passed through rather than stripped: the
     plan schema is `passthrough()` on steps. */
  const extraKey = prepareArguments('create_plan', JSON.stringify({ title: 't', steps: [{ title: 'a', duration: '2天' }] }), PLAN_SCHEMA);
  assert.equal(extraKey.args.steps[0].duration, '2天');
  assert.equal(executePlan(extraKey.args).status, 'completed');
});

test('create_spec: snake_case aliases survive the pipeline', () => {
  const prepared = prepareArguments('create_spec', JSON.stringify({
    title: '导出 PDF',
    overview: '把会话导出为 PDF。',
    features: ['从会话菜单触发导出'],
    acceptance_criteria: ['A4 页面下不裁切图表'],
  }), SPEC_TOOL.function.parameters);
  assert.equal(prepared.ok, true);
  const result = executeSpec(prepared.args);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.spec.requirements, ['从会话菜单触发导出']);
  assert.deepEqual(result.spec.acceptanceCriteria, ['A4 页面下不裁切图表']);
});

test('tools without their own normalizer are still pre-validated', () => {
  const schema = {
    type: 'object',
    required: ['query'],
    properties: { query: { type: 'string', minLength: 1 } },
    additionalProperties: false,
  };
  const prepared = prepareArguments('web_search', '{"q":"missing the required name"}', schema);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.code, TOOL_ARGUMENT_ERRORS.schema);
  assert.match(prepared.fieldErrors.join('; '), /query: missing required field/);
});

/* ── size contract ───────────────────────────────────────────────── */

test('no tool advertises a field larger than the transport cap allows', () => {
  assert.ok(MAX_TOOL_STRING_FIELD_CHARS < MAX_TOOL_ARGUMENT_CHARS);
  assert.equal(CREATE_SITE_TOOL.function.parameters.properties.source.maxLength, MAX_TOOL_STRING_FIELD_CHARS);
  /* The visualization extension payload is validated by zod, so assert the
     behaviour rather than the schema literal. */
  const atLimit = {
    version: 1,
    template: 'svg_illustration',
    title: 'Illustration',
    accessibilitySummary: 'A simple visual.',
    payload: { source: `<svg>${'x'.repeat(MAX_TOOL_STRING_FIELD_CHARS - 11)}</svg>` },
  };
  assert.equal(atLimit.payload.source.length, MAX_TOOL_STRING_FIELD_CHARS);
  assert.equal(validateVisualizationSpec(atLimit).ok, true);
  const overLimit = {
    ...atLimit,
    payload: { source: `<svg>${'x'.repeat(MAX_TOOL_STRING_FIELD_CHARS)}</svg>` },
  };
  assert.equal(validateVisualizationSpec(overLimit).ok, false);
});

/* ── feedback copy ───────────────────────────────────────────────── */

test('each argument error code carries its own user and model copy', () => {
  const schema = { type: 'object', required: ['query'], properties: { query: { type: 'string' } } };
  const seen = new Set();
  for (const code of Object.values(TOOL_ARGUMENT_ERRORS)) {
    const feedback = buildToolErrorFeedback({ toolName: 'web_search', schema, errorCode: code, retryable: true });
    assert.ok(feedback.userMessage, `${code} needs a user message`);
    assert.equal(seen.has(feedback.userMessage), false, `${code} must not reuse another code's copy`);
    seen.add(feedback.userMessage);
    assert.match(feedback.modelMessage, new RegExp(code));
  }
  /* The size failure tells the model to shrink the call; the schema
     failure tells it to fix fields. */
  const tooLarge = buildToolErrorFeedback({ toolName: 'create_site', errorCode: TOOL_ARGUMENT_ERRORS.tooLarge, retryable: true });
  assert.match(tooLarge.modelMessage, /smaller payload/i);
  const parseFailed = buildToolErrorFeedback({ toolName: 'web_search', errorCode: TOOL_ARGUMENT_ERRORS.parse, retryable: true });
  assert.match(parseFailed.modelMessage, /single JSON object/i);
});
