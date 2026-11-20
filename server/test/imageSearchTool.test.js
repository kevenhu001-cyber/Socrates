import assert from 'node:assert/strict';
import test from 'node:test';
import { executeImageSearch } from '../src/routes/chat/pipeline/executors/imageSearch.js';
import { IMAGE_SEARCH_TOOL } from '../src/services/webSearch.js';
import { createToolRegistry } from '../src/services/tools/toolCapabilityCatalog.js';
import { validateIntelligentUi } from '@socrates/core/intelligentUiValidation';
import { normalizeIntelligentUiArgs } from '../src/services/intelligentUiNormalize.js';

test('image_search tool schema is well-formed', () => {
  assert.equal(IMAGE_SEARCH_TOOL.type, 'function');
  assert.equal(IMAGE_SEARCH_TOOL.function.name, 'image_search');
  assert.equal(IMAGE_SEARCH_TOOL.function.parameters.type, 'object');
  assert.deepEqual(IMAGE_SEARCH_TOOL.function.parameters.required, ['query']);
});

test('image_search is registered in toolCapabilityCatalog', () => {
  const registry = createToolRegistry({});
  const entry = registry.get('image_search');
  assert.ok(entry, 'image_search must be present in tool registry');
  assert.equal(entry.name, 'image_search');
  assert.equal(entry.enabled, true);
  assert.equal(entry.pure, true);
});

test('executeImageSearch rejects empty query', async () => {
  const events = [];
  const emitter = {
    event: (name, data) => events.push({ name, data }),
  };
  const ctx = { emitter, req: {} };
  const call = { id: 'call_1', name: 'image_search' };

  const { result } = await executeImageSearch({ query: '' }, call, ctx);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'invalid_query');
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'tool_result');
  assert.equal(events[0].data.ok, false);
});

test('executeImageSearch executes search and emits tool_result', async () => {
  const events = [];
  const emitter = {
    event: (name, data) => events.push({ name, data }),
  };
  const ctx = { emitter, req: {} };
  const call = { id: 'call_2', name: 'image_search' };

  const { result } = await executeImageSearch({ query: 'Moon Apollo', count: 2 }, call, ctx);
  assert.equal(result.status, 'completed');
  assert.ok(events.some((e) => e.name === 'tool_progress' && e.data.phase === 'searching'));
  assert.ok(events.some((e) => e.name === 'tool_result' && e.data.ok === true));
  assert.ok(result.output.length > 0);
});

test('validateIntelligentUi accepts image, accordion, steps, and badge nodes', () => {
  const doc = {
    version: 1,
    nodes: [
      {
        id: 'img1',
        type: 'image',
        url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg',
        alt: 'Full Moon',
        caption: 'The full moon seen from Earth',
      },
      {
        id: 'img2',
        type: 'image',
        url: '/api/v2/intelligent-ui/image?url=https%3A%2F%2Fexample.com%2Fpic.jpg',
        caption: 'Relative proxy image',
      },
      {
        id: 'acc1',
        type: 'accordion',
        items: [
          { id: 'sec1', title: 'Derivation Step 1', content: 'Let $x = 0$.' },
          { id: 'sec2', title: 'Derivation Step 2', content: 'Then $f(x) = 1$.' },
        ],
      },
      {
        id: 'steps1',
        type: 'steps',
        current: 1,
        items: [
          { title: 'Step 1: Hypothesis', status: 'completed' },
          { title: 'Step 2: Experiment', status: 'current' },
          { title: 'Step 3: Conclusion', status: 'upcoming' },
        ],
      },
      {
        id: 'badge1',
        type: 'badge',
        label: 'Verified',
        tone: 'success',
      },
    ],
  };

  const validation = validateIntelligentUi(doc);
  assert.equal(validation.ok, true, `Validation failed: ${validation.error}`);

  const normalized = normalizeIntelligentUiArgs(doc);
  assert.equal(normalized.version, 1);
  assert.equal(normalized.nodes.length, 5);
  assert.equal(
    normalized.nodes[0].src,
    'https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg',
  );
});
