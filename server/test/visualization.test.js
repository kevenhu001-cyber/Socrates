import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVisualization, validateVisualizationSpec, VISUALIZATION_TOOL } from '../src/services/visualization.js';

const lnSpec = {
  version: 1,
  template: 'function',
  title: 'y = ln(x)',
  accessibilitySummary: 'The natural logarithm is defined for x greater than zero and passes through (1, 0).',
  payload: { functions: [{ expression: 'ln(x)', label: 'ln(x)' }], xLabel: 'x', yLabel: 'y' },
};

test('visual spec normalizes a native ln(x) function request', () => {
  const result = validateVisualizationSpec(lnSpec);
  assert.equal(result.ok, true);
  assert.equal(result.spec.payload.mode, 'cartesian');
});

test('visual tool returns structured field errors instead of a Python fallback', () => {
  const result = executeVisualization({ ...lnSpec, payload: { functions: [{ expression: '' }] } });
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'visual_spec_invalid');
  assert.ok(Array.isArray(result.detail));
});

test('visual spec caps graph nodes and extension source', () => {
  const graph = { version: 1, template: 'flowchart', title: 'Flow', accessibilitySummary: 'A flow.', payload: { nodes: Array.from({ length: 201 }, (_, i) => ({ id: String(i), label: String(i) })), edges: [] } };
  assert.equal(validateVisualizationSpec(graph).ok, false);
  const extension = { version: 1, template: 'svg_illustration', title: 'Illustration', accessibilitySummary: 'A simple visual.', payload: { source: 'x'.repeat(100001) } };
  assert.equal(validateVisualizationSpec(extension).ok, false);
  const unsafeExtension = { version: 1, template: 'interactive_simulation', title: 'Unsafe', accessibilitySummary: 'Unsafe extension.', payload: { source: '<script>fetch("https://example.com")</script>' } };
  assert.equal(validateVisualizationSpec(unsafeExtension).ok, false);
});

test('tool declaration exposes the versioned visual contract', () => {
  assert.equal(VISUALIZATION_TOOL.function.name, 'render_visualization');
  assert.deepEqual(VISUALIZATION_TOOL.function.parameters.properties.version.enum, [1]);
});

test('specialized mature-renderer templates validate semantic payloads', () => {
  const specs = [
    { version: 1, template: 'paper_chart', title: 'Paper', accessibilitySummary: 'A publication chart.', payload: { categories: ['A'], series: [{ name: 'Result', data: [1] }] } },
    { version: 1, template: 'math_construction', title: 'Circle', accessibilitySummary: 'An editable circle construction.', payload: { commands: ['A=(0,0)', 'Circle(A,4)'] } },
    { version: 1, template: 'geometry_3d', title: 'Solid', accessibilitySummary: 'A rotatable sphere.', payload: { objects: [{ type: 'sphere', position: [0, 1, 0], size: [1, 1, 1] }] } },
    { version: 1, template: 'whiteboard', title: 'Ideas', accessibilitySummary: 'An editable idea board.', payload: { items: [{ label: 'Start here' }] } },
  ];
  specs.forEach((spec) => assert.equal(validateVisualizationSpec(spec).ok, true, spec.template));
});
