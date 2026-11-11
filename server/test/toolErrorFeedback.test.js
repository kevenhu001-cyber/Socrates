import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildToolErrorFeedback,
  canonicalToolExample,
  canonicalToolExampleJson,
  describeToolSchema,
} from '../src/services/tools/toolErrorFeedback.js';
import { DOCUMENT_TOOL, executeDocument } from '../src/services/core/planning.js';
import { INTELLIGENT_UI_TOOL, validateIntelligentUi } from '../src/services/intelligentUi.js';
import { WEB_SEARCH_TOOL } from '../src/services/webSearch.ts';
import { WEB_FETCH_TOOL } from '../src/services/util/fetchBatch.js';
import { repairToolArguments } from '../src/services/tools/toolCallSafety.js';

/* The whole point of shipping an example is that a model can copy it
   verbatim and succeed. Assert that against each tool's real executor. */
test('canonical examples pass the executors that validate them', () => {
  const document = executeDocument(canonicalToolExample('create_document', DOCUMENT_TOOL.function.parameters));
  assert.equal(document.status, 'completed');
});

test('the canonical render_intelligent_ui example is a minimal text node', () => {
  const example = canonicalToolExample('render_intelligent_ui', INTELLIGENT_UI_TOOL.function.parameters);
  assert.ok(example);
  assert.equal(example.nodes[0].type, 'text');
  const result = validateIntelligentUi(example);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
});

test('web search asks for natural prose and separately displayed sources instead of raw citation markers', () => {
  const description = WEB_SEARCH_TOOL.function.description;
  /* Contract after e6331030 (structured citations): the model writes prose and
   * calls cite_sources; it must not emit numeric markers itself, and the UI
   * renders inline citations plus a Sources list. */
  assert.match(description, /Do not invent source IDs or write numerical reference markers/);
  assert.match(description, /Sources list/i);
  assert.doesNotMatch(description, /cite material claims inline/i);
});

test('canonical examples satisfy their own schemas without repair', () => {
  const cases = [
    ['create_document', DOCUMENT_TOOL.function.parameters],
    ['web_search', WEB_SEARCH_TOOL.function.parameters],
    ['web_fetch', WEB_FETCH_TOOL.function.parameters],
    ['initialize_workspace', {
      type: 'object',
      properties: {
        max_memory_mb: { type: 'integer', minimum: 64, maximum: 4096 },
        max_disk_mb: { type: 'integer', minimum: 16, maximum: 8192 },
        reset: { type: 'boolean' },
      },
      additionalProperties: false,
    }],
    ['create_site', {
      type: 'object',
      required: ['title', 'source'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 120 },
        source: { type: 'string', minLength: 15 },
        visibility: { type: 'string', enum: ['private', 'unlisted', 'public'] },
      },
      additionalProperties: false,
    }],
    ['patch_intelligent_ui', {
      type: 'object',
      required: ['surfaceId', 'revision', 'operations'],
      properties: {
        surfaceId: { type: 'string', minLength: 1 },
        revision: { type: 'integer', minimum: 0 },
        operations: { type: 'array', minItems: 1, items: { type: 'object', required: ['op'], properties: { op: { type: 'string', enum: ['add', 'patch', 'remove'] }, node: { type: 'object' } } } },
      },
      additionalProperties: false,
    }],
    ['read_attachment', {
      type: 'object',
      required: ['fileId'],
      properties: { fileId: { type: 'string' }, offset: { type: 'number', minimum: 0 }, limit: { type: 'number', minimum: 1, maximum: 30000 } },
      additionalProperties: false,
    }],
    ['cite_sources', {
      type: 'object',
      required: ['claims'],
      properties: { claims: { type: 'array', minItems: 1, items: { type: 'object', required: ['quote', 'sourceIds'], properties: { quote: { type: 'string' }, sourceIds: { type: 'array', minItems: 1, items: { type: 'string' } } } } } },
      additionalProperties: false,
    }],
  ];
  for (const [name, schema] of cases) {
    const json = canonicalToolExampleJson(name, schema);
    assert.ok(json, `${name} should have an example`);
    const repaired = repairToolArguments(json, schema);
    assert.equal(repaired.ok, true, `${name} example must parse`);
    assert.deepEqual(repaired.repairs, [], `${name} example must need no repair`);
  }
});

test('generated examples respect numeric, string and array bounds', () => {
  const example = canonicalToolExample('bounded_tool', {
    type: 'object',
    required: ['memory', 'disk', 'language', 'tags'],
    properties: {
      memory: { type: 'integer', minimum: 64, maximum: 4096 },
      disk: { type: 'integer', minimum: 16, maximum: 8192 },
      language: { type: 'string', minLength: 2, maxLength: 2 },
      tags: { type: 'array', minItems: 2, items: { type: 'string' } },
    },
  });
  assert.deepEqual(example, { memory: 64, disk: 16, language: 'xx', tags: ['<tags>', '<tags>'] });
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
  assert.match(feedback.modelMessage, /tool card already shows it/);
  assert.match(feedback.detail, /example: \{"query"/);
  assert.match(feedback.userMessage, /正确格式示例/);
});

test('buildToolErrorFeedback tells the model to stop when retries are exhausted', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'render_intelligent_ui',
    schema: INTELLIGENT_UI_TOOL.function.parameters,
    errorCode: 'visual_spec_invalid',
    fieldErrors: ['payload.series: required'],
    retryable: false,
  });
  assert.match(feedback.modelMessage, /Do not repeat this call/);
  assert.doesNotMatch(feedback.modelMessage, /Send one corrected call/);
  assert.match(feedback.modelMessage, /tool card already shows it/);
});

test('tool correction feedback can replace a generic example with the rejected visualization template', () => {
  const feedback = buildToolErrorFeedback({
    toolName: 'render_intelligent_ui',
    schema: INTELLIGENT_UI_TOOL.function.parameters,
    errorCode: 'visual_spec_invalid',
    fieldErrors: 'payload.values: must match yCategories',
    retryable: true,
    hint: 'Use a matrix with one value per category pair.',
    exampleOverride: { version: 1, template: 'heatmap', title: 'Activity', accessibilitySummary: 'A two by two heatmap.', payload: { xCategories: ['Mon', 'Tue'], yCategories: ['AM', 'PM'], values: [[2, 4], [3, 1]] } },
  });
  assert.match(feedback.modelMessage, /Use a matrix with one value per category pair/);
  assert.match(feedback.modelMessage, /"template":"heatmap"/);
  assert.match(feedback.modelMessage, /"xCategories"/);
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
