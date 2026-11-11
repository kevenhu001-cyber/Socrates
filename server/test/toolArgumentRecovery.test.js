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
} from '../src/services/tools/toolCallSafety.js';
import { toolArgumentPolicy } from '../src/services/tools/toolArgumentPolicy.js';
import { validateVisualizationSpec } from '../src/services/visualization.js';
import { DOCUMENT_TOOL, executeDocument } from '../src/services/core/planning.js';
import { CREATE_SITE_TOOL } from '../src/services/siteCreation.js';
import { INTELLIGENT_UI_TOOL } from '../src/services/intelligentUi.js';
import { PATCH_INTELLIGENT_UI_TOOL } from '../src/services/turnRuntimeTools.js';
import { buildToolErrorFeedback } from '../src/services/tools/toolErrorFeedback.js';
import { PROJECT_CONNECTOR_TOOLS, PROJECT_CONNECTOR_TOOL_NAMES } from '../src/services/integrations/projectConnectorTools.js';


/** What the pipeline does with one streamed argument string. */
function prepareArguments(toolName, raw, schema) {
  const policy = toolArgumentPolicy(toolName);
  const repaired = repairToolArguments(raw, schema, { dropUnknown: policy.dropUnknown, toolName });
  if (!repaired.ok) return { ok: false, code: repaired.error, args: null };
  const validation = policy.validation === 'schema'
    ? validateToolArguments(repaired.value, schema)
    : policy.validation === 'tool' && policy.validate
      ? policy.validate(repaired.value)
      : { ok: true, fieldErrors: [] };
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.errorCode || TOOL_ARGUMENT_ERRORS.schema,
      args: repaired.value,
      fieldErrors: validation.fieldErrors,
    };
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

test('executor-supported aliases are normalized before schema pruning', () => {
  const querySchema = {
    type: 'object',
    required: ['query'],
    properties: { query: { type: 'string' } },
    additionalProperties: false,
  };
  for (const alias of ['q', 'search_query', 'keyword']) {
    const prepared = prepareArguments('web_search', JSON.stringify({ [alias]: 'reliable query' }), querySchema);
    assert.equal(prepared.ok, true);
    assert.deepEqual(prepared.args, { query: 'reliable query' });
  }
  const wrapped = prepareArguments('web_search', '{"input":{"q":"wrapped query"}}', querySchema);
  assert.equal(wrapped.ok, true);
  assert.deepEqual(wrapped.args, { query: 'wrapped query' });

  const attachment = prepareArguments('read_attachment', '{"file_id":"file-1"}', {
    type: 'object',
    required: ['fileId'],
    properties: { fileId: { type: 'string' } },
    additionalProperties: false,
  });
  assert.equal(attachment.ok, true);
  assert.deepEqual(attachment.args, { fileId: 'file-1' });

  for (const alias of ['script', 'python', 'source']) {
    const code = prepareArguments('code_interpreter', JSON.stringify({ [alias]: 'print(1)' }), {
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string' } },
      additionalProperties: false,
    });
    assert.equal(code.ok, true);
    assert.deepEqual(code.args, { code: 'print(1)' });
  }
});

test('empty arguments are accepted only for tools with no required fields', () => {
  const identityTool = PROJECT_CONNECTOR_TOOLS.find(
    (tool) => tool.function.name === PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY,
  );
  assert.ok(identityTool);
  for (const raw of ['', null, undefined]) {
    const identity = prepareArguments(
      PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY,
      raw,
      identityTool.function.parameters,
    );
    assert.equal(identity.ok, true);
    assert.deepEqual(identity.args, {});
  }

  const required = prepareArguments('web_search', '', {
    type: 'object',
    required: ['query'],
    properties: { query: { type: 'string' } },
    additionalProperties: false,
  });
  assert.equal(required.ok, false);
  assert.equal(required.code, TOOL_ARGUMENT_ERRORS.parse);
});

/* ── the calls that used to fail ──────────────────────────────────── */

test('document validation runs before execution and preserves the selected content', () => {
  const schema = DOCUMENT_TOOL.function.parameters;
  const args = { kind: 'plan', content: { title: 'Review', steps: [{title:'Read'}] } };
  const prepared = prepareArguments('create_document', JSON.stringify(args), schema);
  assert.equal(prepared.ok, true);
  assert.equal(executeDocument(prepared.args).status, 'completed');
  assert.equal(prepareArguments('create_document', JSON.stringify({kind:'spec', content:{title:'x', requirements:[]}}), schema).code, 'plan_spec_invalid');
});

test('a tool-specific rejection keeps its own user message', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'create_document',
    schema: DOCUMENT_TOOL.function.parameters,
    errorCode: 'plan_spec_invalid',
    fieldErrors: 'requirements: Too small',
    retryable: true,
    userMessageOverride: '规格结构有字段不符合要求。',
  });
  assert.equal(feedback.userMessage, '规格结构有字段不符合要求。');
});

test('tools without their own normalizer are still pre-validated', () => {
  const schema = {
    type: 'object',
    required: ['query'],
    properties: { query: { type: 'string', minLength: 1 } },
    additionalProperties: false,
  };
  const prepared = prepareArguments('web_search', '{"unexpected":"missing the required name"}', schema);
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

/* ── XML-style demonstration payloads ────────────────────────────── */

test('XML-style item collections and quoted numbers are repaired before validation', () => {
  /* Some providers encode repeated elements as `{item: ...}` and every
     scalar as a string. The program schema names the properties, but a
     provider that has already collapsed a list into a single object still
     needs the render tool's own normalizer to rebuild the array. */
  const raw = JSON.stringify({
    version: '1',
    nodes: [{
      id: 'nr',
      type: 'demonstration',
      title: 'Newton rings',
      program: {
        version: '1',
        parameters: { item: [{ id: 'lam', label: 'λ', value: '550', min: '380', max: '750', step: '10' }] },
        definitions: { ringI: 'lam * x' },
        views: { item: [
          { kind: 'controls' },
          { kind: 'plot', x: { item: ['-0.003', '0.003'] }, y: { item: ['0', '1.05'] },
            curves: { item: [{ expression: 'ringI', label: 'I(r)' }] } },
        ] },
      },
    }],
  });
  const prepared = prepareArguments('render_intelligent_ui', raw, INTELLIGENT_UI_TOOL.function.parameters);
  assert.equal(prepared.ok, true);
  const program = prepared.args.nodes[0].program;
  assert.equal(program.version, 1);
  assert.deepEqual(program.parameters, [{ id: 'lam', label: 'λ', value: 550, min: 380, max: 750, step: 10 }]);
  assert.equal(program.views.length, 2);
  assert.deepEqual(program.views[1].x, [-0.003, 0.003]);
  assert.equal(program.views[1].curves.length, 1);
});

test('a valid demonstration program survives argument repair unchanged', () => {
  /* The program schema must not rewrite a payload the model already sent in
     the documented shape; coercion is only a repair path. */
  const program = {
    version: 1,
    parameters: [{ id: 'a', label: 'A', value: 1, min: 0, max: 2, step: 0.1 }],
    definitions: { f: 'a*x' },
    views: [{ kind: 'controls' }, { kind: 'plot', x: [0, 1], y: [0, 2], curves: [{ expression: 'f', label: 'a*x' }] }],
  };
  const args = { version: 1, nodes: [{ id: 'demo', type: 'demonstration', title: 'Demo', program }] };
  const prepared = prepareArguments('render_intelligent_ui', JSON.stringify(args), INTELLIGENT_UI_TOOL.function.parameters);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.repairs, []);
  assert.deepEqual(prepared.args.nodes[0].program, program);
});

test('patch operations normalize an XML-style demonstration program', () => {
  const raw = JSON.stringify({
    surfaceId: 'ui-call',
    revision: 0,
    operations: [{
      op: 'patch', nodeId: 'demo',
      props: { program: { version: '1', views: { item: [{ kind: 'controls' }] } } },
    }],
  });
  const prepared = prepareArguments('patch_intelligent_ui', raw, PATCH_INTELLIGENT_UI_TOOL.function.parameters);
  assert.equal(prepared.ok, true);
  const program = prepared.args.operations[0].props.program;
  assert.equal(program.version, 1);
  assert.deepEqual(program.views, [{ kind: 'controls' }]);
});
