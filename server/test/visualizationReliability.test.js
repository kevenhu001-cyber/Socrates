/* V1 visualization reliability: every sample the audit saw rejected (or
 * accepted but drawn empty) must now validate through BOTH the direct path
 * and the OpenUI path, rejected calls must carry template-specific guidance,
 * and truncation must be named as truncation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVisualizationSpec, MAX_VISUALIZATION_POINTS } from '../src/services/visualization.js';
import { inspectOpenUiProgram } from '../src/services/openUiProgram.js';
import { validateIntelligentUi } from '../src/services/intelligentUi.js';
import { executeIntelligentUi } from '../src/routes/chat/pipeline/executors/intelligentUi.js';
import { looksTruncatedToolArguments, truncatedArgumentsHint } from '../src/services/tools/toolCallSafety.js';
import { visualizationValidationTally } from '../src/lib/telemetry.js';

const cats = (n) => Array.from({ length: n }, (_, i) => `D${i + 1}`);
const wave = (n) => Array.from({ length: n }, (_, i) => Math.round(Math.sin(i / 20) * 100) / 10);
const program = (template, title, payload, summary = '"s"') => `root = Col([v])\nv = Visualization(${JSON.stringify(template)}, ${JSON.stringify(title)}, ${JSON.stringify(payload)}${summary ? `, ${summary}` : ''})`;

const NOW_ACCEPTED = [
  ['string numbers', 'bar', { categories: ['甲', '乙', '丙'], series: [{ name: '分数', data: ['3', '5', '4'] }] }],
  ['percent and thousands strings', 'bar', { categories: ['甲', '乙'], series: [{ name: '占比', data: ['45%', '1,200'] }] }],
  ['labels/values aliases', 'bar', { labels: ['甲', '乙', '丙'], values: [3, 5, 4] }],
  ['ECharts xAxis/yAxis', 'line', { xAxis: ['1月', '2月'], yAxis: [1, 2] }],
  ['series object', 'bar', { categories: ['甲', '乙'], series: { name: 'v', data: [1, 2] } }],
  ['{name,value} points', 'bar', { series: [{ name: 'v', data: [{ name: '甲', value: 1 }, { name: '乙', value: 2 }] }] }],
  ['pie {name,value}', 'pie', { series: [{ data: [{ name: 'A', value: 40 }, { name: 'B', value: 60 }] }] }],
  ['line null gaps', 'line', { categories: ['1', '2', '3'], series: [{ name: 'v', data: [1, null, 3] }] }],
  ['category/data length mismatch', 'line', { categories: ['1', '2', '3'], series: [{ name: 'v', data: [1, 2] }] }],
  ['scatter x/y columns', 'scatter', { x: [1, 2, 3], y: [2, 4, 3] }],
  ['flowchart Chinese ids', 'flowchart', { nodes: [{ id: '开始', label: '开始' }, { id: '结束', label: '结束' }], edges: [{ from: '开始', to: '结束' }] }],
  ['flowchart hyphen ids', 'flowchart', { nodes: [{ id: 'step-1', label: 'A' }, { id: 'step-2', label: 'B' }], edges: [{ from: 'step-1', to: 'step-2' }] }],
  ['timeline 13 items', 'timeline', { items: Array.from({ length: 13 }, (_, i) => ({ label: `事件${i}`, value: String(2000 + i) })) }],
  ['implicit multiplication', 'function', { functions: [{ expression: '2x^2+3x' }] }],
  ['y = prefix', 'function', { functions: [{ expression: 'y = x^2' }] }],
  ['5000 points with categories', 'line', { categories: cats(5000), series: [{ name: 'v', data: wave(5000) }] }],
  ['6000 points (downsampled)', 'line', { categories: cats(6000), series: [{ name: 'v', data: wave(6000) }] }],
  ['heatmap triples', 'heatmap', { xCategories: ['a', 'b'], yCategories: ['x', 'y'], data: [[0, 0, 1], [1, 1, 2]] }],
  ['series[].values/title', 'line', { categories: ['a', 'b'], series: [{ title: 'n', values: [1, 2] }] }],
  ['series number array', 'bar', { categories: ['a', 'b'], series: [1, 2] }],
];

for (const [name, template, payload] of NOW_ACCEPTED) {
  test(`audit sample accepted on both paths: ${name}`, () => {
    const direct = validateVisualizationSpec({ version: 1, template, title: name, accessibilitySummary: 's', payload });
    assert.equal(direct.ok, true, JSON.stringify(direct.issues));
    const viaOpenUi = inspectOpenUiProgram(program(template, name, payload));
    assert.deepEqual(viaOpenUi.issues, []);
    assert.equal(viaOpenUi.visualizations.length, 1);
    /* The accepted spec is canonical: series is an array of numeric data. */
    const accepted = viaOpenUi.visualizations[0];
    if (Array.isArray(accepted.payload.series)) {
      for (const series of accepted.payload.series) {
        assert.ok(Array.isArray(series.data) && series.data.length > 0);
        assert.ok(series.data.length <= MAX_VISUALIZATION_POINTS);
      }
    }
  });
}

test('OpenUI accessibilitySummary is optional and derived from the title', () => {
  const inspected = inspectOpenUiProgram(program('bar', 'Scores', { categories: ['a'], series: [{ data: [1] }] }, ''));
  assert.deepEqual(inspected.issues, []);
  assert.equal(inspected.visualizations[0].accessibilitySummary, 'Visualization of Scores.');
});

test('genuinely invalid data is still rejected with structured failures', () => {
  for (const [template, payload] of [
    ['radar', { indicators: [{ name: 'A' }, { name: 'B' }], series: [{ data: [1, 2] }] }],
    ['table', { columns: ['a'], rows: [[1]] }],
    ['bar', { categories: ['a', 'b'], series: [{ data: ['x', 'y'] }] }],
  ]) {
    const inspected = inspectOpenUiProgram(program(template, 'Bad', payload));
    assert.ok(inspected.issues.length > 0, template);
    assert.equal(inspected.failures.length, 1, template);
    assert.equal(inspected.failures[0].title, 'Bad');
  }
});

test('rejected Visualization calls get template guidance and a complete example', async () => {
  const events = [];
  const source = program('bar', 'Broken', { categories: ['a', 'b'], series: [{ data: ['x', 'y'] }] });
  const outcome = await executeIntelligentUi({ version: 1, nodes: [{ id: 'chart', type: 'openui', source }] }, { id: 'c1' }, { emitter: { event: (...args) => events.push(args) }, toolPolicy: { remainingRetries: () => 3 } });
  assert.equal(outcome.result.status, 'failed');
  assert.match(outcome.result.correction, /Visualization "bar" contract:/);
  assert.match(outcome.result.correction, /A valid call: v = Visualization\("bar"/);
  assert.match(outcome.result.correction, /JSON numbers/);
  assert.equal(outcome.result.detail.stage, 'visualization');
  assert.equal(outcome.result.detail.visualizations[0].template, 'bar');
  assert.equal(outcome.result.detail.visualizations[0].title, 'Broken');
  assert.equal(outcome.result.retryable, true);
  assert.match(outcome.result.userMessage, /bar/);
  assert.equal(events[0][1].ok, false);
});

test('a program cut off mid-stream is reported as truncation, not as a syntax error', async () => {
  const source = 'root = Col([v])\nv = Visualization("line", "Long", {"categories":["a","b"],"series":[{"name":"n","data":[1,';
  const validation = validateIntelligentUi({ version: 1, nodes: [{ id: 'chart', type: 'openui', source }] });
  assert.equal(validation.ok, false);
  assert.equal(validation.failure.stage, 'openui_truncated');
  const outcome = await executeIntelligentUi({ version: 1, nodes: [{ id: 'chart', type: 'openui', source }] }, { id: 'c2' }, { emitter: { event() {} } });
  assert.equal(outcome.result.errorCode, 'arguments_truncated');
  assert.match(outcome.result.correction, /cut off/);
  assert.match(outcome.result.correction, /fewer data points/);
  assert.equal(outcome.result.detail.truncated, true);
});

test('accepted surfaces return normalized specs tagged with their node', async () => {
  const source = program('bar', 'Alias', { labels: ['甲', '乙'], values: ['3', 5] });
  const outcome = await executeIntelligentUi({ version: 1, nodes: [{ id: 'chart', type: 'openui', source }] }, { id: 'c3' }, { emitter: { event() {} } });
  assert.equal(outcome.result.status, 'completed');
  const [spec] = outcome.result.visualizations;
  assert.equal(spec.nodeId, 'chart');
  assert.equal(spec.index, 0);
  assert.deepEqual(spec.payload, { categories: ['甲', '乙'], series: [{ data: [3, 5] }] });
});

test('validation outcomes are counted by tool, outcome, stage and template', async () => {
  const before = visualizationValidationTally()['render_intelligent_ui|rejected|visualization|bar'] || 0;
  const source = program('bar', 'Broken', { categories: ['a'], series: [{ data: ['nope'] }] });
  await executeIntelligentUi({ version: 1, nodes: [{ id: 'chart', type: 'openui', source }] }, { id: 'c4' }, { emitter: { event() {} } });
  assert.equal(visualizationValidationTally()['render_intelligent_ui|rejected|visualization|bar'], before + 1);
});

test('transport-level truncation detection', () => {
  assert.equal(looksTruncatedToolArguments('{"version":1,"nodes":[{"id":"a","source":"root = Col(['), true);
  assert.equal(looksTruncatedToolArguments('{"a":1'), true);
  assert.equal(looksTruncatedToolArguments('{"a":1}'), false);
  assert.equal(looksTruncatedToolArguments('not json'), false);
  assert.match(truncatedArgumentsHint('render_intelligent_ui'), /downsample/);
  assert.doesNotMatch(truncatedArgumentsHint('web_search'), /downsample/);
});
