import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asVisualizationSpec,
  visualizationSpecOf,
} from '../src/render/visualizationSpec.ts';

/* The v1 spec is model output. These cases pin the contract the renderers
   rely on: a non-empty template and an object payload, with everything
   else passed through untouched. */

test('rejects values that are not a spec object', () => {
  for (const value of [null, undefined, 'chart', 42, true, ['line']]) {
    assert.equal(asVisualizationSpec(value), null, `expected null for ${JSON.stringify(value)}`);
  }
});

test('rejects a spec without a usable template', () => {
  assert.equal(asVisualizationSpec({ payload: {} }), null);
  assert.equal(asVisualizationSpec({ template: '', payload: {} }), null);
  assert.equal(asVisualizationSpec({ template: '   ', payload: {} }), null);
  assert.equal(asVisualizationSpec({ template: 7, payload: {} }), null);
});

test('keeps a well-formed spec by identity', () => {
  const spec = { version: 1, template: 'line', payload: { series: [] } };
  assert.equal(asVisualizationSpec(spec), spec);
});

test('normalises a missing payload to an empty object', () => {
  const spec = asVisualizationSpec({ version: 1, template: 'whiteboard' });
  assert.deepEqual(spec.payload, {});
  assert.equal(spec.template, 'whiteboard');
});

test('normalises a non-object payload to an empty object', () => {
  for (const payload of [null, 'series', 12, [1, 2, 3]]) {
    const spec = asVisualizationSpec({ version: 1, template: 'line', payload });
    assert.deepEqual(spec.payload, {}, `payload ${JSON.stringify(payload)} should collapse`);
  }
});

test('preserves unknown fields for forward compatibility', () => {
  const spec = asVisualizationSpec({
    version: 1,
    template: 'tree',
    title: 'Graph',
    payload: { nodes: [] },
    futureField: { a: 1 },
  });
  assert.equal(spec.title, 'Graph');
  assert.deepEqual(spec.futureField, { a: 1 });
  assert.equal(spec.template, 'tree');
});

test('visualizationSpecOf prefers the persisted visualization', () => {
  const persisted = { version: 1, template: 'bar', payload: { series: [] } };
  const call = { name: 'render_visualization', visualization: persisted, input: { version: 1, template: 'line', payload: {} } };
  assert.equal(visualizationSpecOf(call), persisted);
});

test('visualizationSpecOf falls back to the streaming input', () => {
  const call = { name: 'render_visualization', input: { version: 1, template: 'line', payload: { series: [] } } };
  assert.equal(visualizationSpecOf(call).template, 'line');
});

test('visualizationSpecOf ignores calls that failed', () => {
  const base = { name: 'render_visualization', input: { version: 1, template: 'line', payload: {} } };
  assert.equal(visualizationSpecOf({ ...base, isError: true }), null);
  assert.equal(visualizationSpecOf({ ...base, status: 'cancelled' }), null);
  assert.equal(visualizationSpecOf({ ...base, _run: { phase: 'timed_out' } }), null);
});

test('visualizationSpecOf ignores non-v1 payloads', () => {
  assert.equal(visualizationSpecOf({ name: 'render_visualization', input: { version: 2, template: 'line' } }), null);
  assert.equal(visualizationSpecOf({ name: 'render_visualization', visualization: { template: 'line' } }), null);
});

test('visualizationSpecOf drops a v1 payload with no template', () => {
  assert.equal(visualizationSpecOf({ name: 'render_visualization', input: { version: 1, payload: {} } }), null);
});
