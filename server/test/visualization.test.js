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

test('visual spec repairs common model field aliases without mutating input', () => {
  const input = {
    version: '1',
    type: 'bar',
    title: 'Long labels',
    summary: 'A bar chart.',
    labels: ['First', 'Second'],
    series: [{ title: 'Result', values: [1, 2] }],
  };
  const before = JSON.stringify(input);
  const result = validateVisualizationSpec(input);
  assert.equal(result.ok, true);
  assert.equal(result.spec.version, 1);
  assert.equal(result.spec.template, 'bar');
  assert.deepEqual(result.spec.payload.categories, ['First', 'Second']);
  assert.deepEqual(result.spec.payload.series, [{ name: 'Result', data: [1, 2] }]);
  assert.equal(JSON.stringify(input), before);
});

test('visual spec repairs common function and graph aliases', () => {
  const fn = validateVisualizationSpec({
    version: 1, template: 'function', title: 'Curve',
    accessibilitySummary: 'A curve.', payload: { formula: 'sin(x)' },
  });
  assert.equal(fn.ok, true);
  assert.equal(fn.spec.payload.functions[0].expression, 'sin(x)');

  const graph = validateVisualizationSpec({
    spec: {
      version: 1, template: 'flowchart', title: 'Flow',
      accessibilitySummary: 'A flow.',
      payload: {
        nodes: [{ id: 'a', name: 'Start' }, { id: 'b', text: 'End' }],
        edges: [{ source: 'a', target: 'b' }],
      },
    },
  });
  assert.equal(graph.ok, true);
  assert.equal(graph.spec.payload.nodes[0].label, 'Start');
  assert.equal(graph.spec.payload.edges[0].from, 'a');
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

/* P_interactive-sim-scripts — interactive_simulation is allowed inline
   <script> and event handlers (the sandboxed iframe runs opaque-origin
   with connect-src 'none'); svg_illustration stays script-free.
   Nested iframes, network APIs and dangerous URL schemes stay banned
   for both. */
test('interactive_simulation accepts inline scripts; svg_illustration does not', () => {
  const sim = {
    version: 1, template: 'interactive_simulation', title: 'Pendulum',
    accessibilitySummary: 'A pendulum the reader can swing.',
    payload: { source: '<div><canvas id="c"></canvas><button onclick="reset()">Reset</button><script>function reset(){document.getElementById("c").getContext("2d").clearRect(0,0,9,9)}</script></div>' },
  };
  assert.equal(validateVisualizationSpec(sim).ok, true);

  const svgWithScript = {
    version: 1, template: 'svg_illustration', title: 'Art',
    accessibilitySummary: 'A static illustration.',
    payload: { source: '<svg><script>alert(1)</script></svg>' },
  };
  assert.equal(validateVisualizationSpec(svgWithScript).ok, false);
});

test('interactive_simulation still rejects nested frames, network APIs and dangerous schemes', () => {
  const base = { version: 1, template: 'interactive_simulation', title: 'Sim', accessibilitySummary: 'A sim.' };
  const cases = [
    '<div><iframe src="https://example.com"></iframe></div>',
    '<script>const ws = new WebSocket("wss://x")</script>',
    '<a href="javascript:alert(1)">go</a>',
    '<form action="https://example.com"></form>',
  ];
  for (const source of cases) {
    const result = validateVisualizationSpec({ ...base, payload: { source } });
    assert.equal(result.ok, false, source);
  }
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
