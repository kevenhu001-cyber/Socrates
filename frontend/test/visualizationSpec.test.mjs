import test from 'node:test';
import assert from 'node:assert/strict';

import {
  asVisualizationSpec,
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
