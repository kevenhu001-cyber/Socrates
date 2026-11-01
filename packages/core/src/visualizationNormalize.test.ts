import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_VISUALIZATION_POINTS,
  coerceNumber,
  normalizeFunctionExpression,
  normalizeVisualizationSpec,
  visualizationTableRows,
} from './visualizationNormalize.js';
import { parseFunctionExpression } from './visualizationMath.js';

type Payload = Record<string, unknown>;
const spec = (template: string, payload: unknown, extra: Payload = {}) => ({ version: 1, template, title: 'T', accessibilitySummary: 's', payload, ...extra });
const payloadOf = (input: unknown) => (normalizeVisualizationSpec(input).spec as { payload: Payload }).payload;

/* Every failing sample from the V1 visualization audit (server probe + client
   probe), with the canonical payload the shared normalizer must produce. */
const AUDIT_CASES: Array<{ name: string; template: string; payload: unknown; expected: Payload; warning?: RegExp }> = [
  { name: 'string numbers', template: 'bar', payload: { categories: ['甲', '乙', '丙'], series: [{ name: '分数', data: ['3', '5', '4'] }] }, expected: { categories: ['甲', '乙', '丙'], series: [{ name: '分数', data: [3, 5, 4] }] } },
  { name: 'percent and thousands strings', template: 'bar', payload: { categories: ['甲', '乙'], series: [{ name: '占比', data: ['45%', '1,200'] }] }, expected: { categories: ['甲', '乙'], series: [{ name: '占比', data: [45, 1200] }] } },
  { name: 'labels/values aliases', template: 'bar', payload: { labels: ['甲', '乙', '丙'], values: [3, 5, 4] }, expected: { categories: ['甲', '乙', '丙'], series: [{ data: [3, 5, 4] }] } },
  { name: 'ECharts-style xAxis/yAxis arrays', template: 'line', payload: { xAxis: ['1月', '2月'], yAxis: [1, 2] }, expected: { categories: ['1月', '2月'], series: [{ data: [1, 2] }] } },
  { name: 'ECharts-style xAxis.data with series', template: 'line', payload: { xAxis: { type: 'category', data: ['a', 'b'], name: '月' }, yAxis: { type: 'value', name: '分' }, series: [{ type: 'line', data: [1, 2] }] }, expected: { categories: ['a', 'b'], xLabel: '月', yLabel: '分', series: [{ kind: 'line', data: [1, 2] }] } },
  { name: 'series as an object', template: 'bar', payload: { categories: ['甲', '乙'], series: { name: 'v', data: [1, 2] } }, expected: { categories: ['甲', '乙'], series: [{ name: 'v', data: [1, 2] }] } },
  { name: 'series as a name → values map', template: 'line', payload: { categories: ['a', 'b'], series: { 本周: [1, 2], 上周: [3, 4] } }, expected: { categories: ['a', 'b'], series: [{ name: '本周', data: [1, 2] }, { name: '上周', data: [3, 4] }] } },
  { name: '{name,value} points in a series', template: 'bar', payload: { series: [{ name: 'v', data: [{ name: '甲', value: 1 }, { name: '乙', value: 2 }] }] }, expected: { categories: ['甲', '乙'], series: [{ name: 'v', data: [1, 2] }] } },
  { name: 'pie {name,value} points', template: 'pie', payload: { series: [{ data: [{ name: 'A', value: 40 }, { name: 'B', value: 60 }] }] }, expected: { categories: ['A', 'B'], series: [{ data: [40, 60] }] } },
  { name: 'pie top-level data points', template: 'pie', payload: { data: [{ name: 'A', value: '40' }, { name: 'B', value: 60 }] }, expected: { categories: ['A', 'B'], series: [{ data: [40, 60] }] } },
  { name: 'flat {name,value} list as series', template: 'bar', payload: { series: [{ name: 'a', value: 1 }, { name: 'b', value: 2 }] }, expected: { categories: ['a', 'b'], series: [{ data: [1, 2] }] } },
  { name: 'line with null gaps', template: 'line', payload: { categories: ['1', '2', '3'], series: [{ name: 'v', data: [1, null, 3] }] }, expected: { categories: ['1', '2', '3'], series: [{ name: 'v', data: [1, null, 3] }] } },
  { name: 'missing-value strings', template: 'line', payload: { categories: ['1', '2', '3'], series: [{ data: [1, '-', 'N/A'] }] }, expected: { categories: ['1', '2', '3'], series: [{ data: [1, null, null] }] } },
  { name: 'single short series trims categories', template: 'line', payload: { categories: ['1', '2', '3'], series: [{ name: 'v', data: [1, 2] }] }, expected: { categories: ['1', '2'], series: [{ name: 'v', data: [1, 2] }] }, warning: /Dropped 1 category/ },
  { name: 'long series trims to categories', template: 'bar', payload: { categories: ['a', 'b'], series: [{ data: [1, 2, 3] }] }, expected: { categories: ['a', 'b'], series: [{ data: [1, 2] }] }, warning: /beyond the last category/ },
  { name: 'multi-series pads short series with gaps', template: 'line', payload: { categories: ['a', 'b'], series: [{ name: 'x', data: [1] }, { name: 'y', data: [1, 2] }] }, expected: { categories: ['a', 'b'], series: [{ name: 'x', data: [1, null] }, { name: 'y', data: [1, 2] }] }, warning: /Filled 1 missing value/ },
  { name: 'series[].values/title aliases', template: 'line', payload: { categories: ['a', 'b'], series: [{ title: 'n', values: [1, 2] }] }, expected: { categories: ['a', 'b'], series: [{ name: 'n', data: [1, 2] }] } },
  { name: 'series as a plain number array', template: 'bar', payload: { categories: ['a', 'b'], series: [1, 2] }, expected: { categories: ['a', 'b'], series: [{ data: [1, 2] }] } },
  { name: 'scatter x/y columns', template: 'scatter', payload: { x: [1, 2, 3], y: [2, 4, 3] }, expected: { series: [{ data: [[1, 2], [2, 4], [3, 3]] }] } },
  { name: 'scatter {x,y} points with strings', template: 'scatter', payload: { series: [{ data: [{ x: '1', y: 2 }] }] }, expected: { series: [{ data: [[1, 2]] }] } },
  { name: 'flowchart Chinese ids', template: 'flowchart', payload: { nodes: [{ id: '开始', label: '开始' }, { id: '结束', label: '结束' }], edges: [{ from: '开始', to: '结束' }] }, expected: { nodes: [{ id: 'n1', label: '开始' }, { id: 'n2', label: '结束' }], edges: [{ from: 'n1', to: 'n2' }] }, warning: /node ids/ },
  { name: 'flowchart hyphenated ids', template: 'flowchart', payload: { nodes: [{ id: 'step-1', label: 'A' }, { id: 'step-2', label: 'B' }], edges: [{ from: 'step-1', to: 'step-2' }] }, expected: { nodes: [{ id: 'step_1', label: 'A' }, { id: 'step_2', label: 'B' }], edges: [{ from: 'step_1', to: 'step_2' }] } },
  { name: 'graph source/target and name aliases', template: 'network', payload: { nodes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], links: [{ source: 'a', target: 'b' }] }, expected: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } },
  { name: 'timeline over the item limit', template: 'timeline', payload: { items: Array.from({ length: 13 }, (_, i) => ({ label: `事件${i}`, value: String(2000 + i) })) }, expected: { items: Array.from({ length: 12 }, (_, i) => ({ label: `事件${i}`, value: String(2000 + i) })) }, warning: /first 12 of 13/ },
  { name: 'implicit multiplication', template: 'function', payload: { functions: [{ expression: '2x^2+3x' }] }, expected: { functions: [{ expression: '2*x^2+3*x', label: '2x^2+3x' }] } },
  { name: 'y = prefix', template: 'function', payload: { functions: [{ expression: 'y = x^2' }] }, expected: { functions: [{ expression: 'x^2', label: 'y = x^2' }] } },
  { name: 'heatmap [x,y,v] triples', template: 'heatmap', payload: { xCategories: ['a', 'b'], yCategories: ['x', 'y'], data: [[0, 0, 1], [1, 1, 2]] }, expected: { xCategories: ['a', 'b'], yCategories: ['x', 'y'], values: [[1, null], [null, 2]] } },
  { name: 'heatmap labelled triples without categories', template: 'heatmap', payload: { data: [['Mon', 'AM', 2], ['Tue', 'PM', '3']] }, expected: { xCategories: ['Mon', 'Tue'], yCategories: ['AM', 'PM'], values: [[2, null], [null, 3]] } },
  { name: 'radar string indicators', template: 'radar', payload: { indicators: ['速度', '力量', '专注'], series: [{ data: ['8', 6, 9] }] }, expected: { indicators: [{ name: '速度' }, { name: '力量' }, { name: '专注' }], series: [{ data: [8, 6, 9] }] } },
];

describe('normalizeVisualizationSpec — audit failure samples', () => {
  for (const sample of AUDIT_CASES) {
    it(sample.name, () => {
      const result = normalizeVisualizationSpec(spec(sample.template, sample.payload));
      assert.deepEqual((result.spec as { payload: Payload }).payload, sample.expected);
      if (sample.warning) assert.ok(result.warnings.some((line) => sample.warning!.test(line)), result.warnings.join(' | '));
    });
  }
});

describe('normalizeVisualizationSpec — envelope and limits', () => {
  it('never mutates its input', () => {
    const input = spec('bar', { labels: ['a'], values: ['1'] });
    const before = JSON.stringify(input);
    normalizeVisualizationSpec(input);
    assert.equal(JSON.stringify(input), before);
  });
  it('returns non-objects unchanged and never throws', () => {
    assert.equal(normalizeVisualizationSpec(null).spec, null);
    assert.equal(normalizeVisualizationSpec('x').spec, 'x');
    const cyclic: Record<string, unknown> = { template: 'bar' };
    cyclic.self = cyclic;
    assert.doesNotThrow(() => normalizeVisualizationSpec(cyclic));
  });
  it('fills version and accessibilitySummary, moves top-level keys into payload', () => {
    const result = normalizeVisualizationSpec({ template: 'bar', title: 'Scores', categories: ['a'], series: [{ data: [1] }] }).spec as Payload;
    assert.equal(result.version, 1);
    assert.equal(result.accessibilitySummary, 'Visualization of Scores.');
    assert.deepEqual(result.payload, { categories: ['a'], series: [{ data: [1] }] });
  });
  it('maps template aliases', () => {
    assert.equal((normalizeVisualizationSpec(spec('Bar_Chart', { categories: ['a'], series: [{ data: [1] }] })).spec as Payload).template, 'bar');
  });
  it(`downsamples beyond ${MAX_VISUALIZATION_POINTS} points instead of rejecting`, () => {
    const n = 6000;
    const result = normalizeVisualizationSpec(spec('line', { categories: Array.from({ length: n }, (_, i) => `D${i}`), series: [{ data: Array.from({ length: n }, (_, i) => i) }] }));
    const payload = (result.spec as { payload: { categories: unknown[]; series: Array<{ data: number[] }> } }).payload;
    assert.equal(payload.series[0].data.length, MAX_VISUALIZATION_POINTS);
    assert.equal(payload.categories.length, MAX_VISUALIZATION_POINTS);
    assert.equal(payload.series[0].data[0], 0);
    assert.equal(payload.series[0].data.at(-1), n - 1);
    assert.ok(result.warnings.some((line) => /Downsampled 6000/.test(line)));
  });
  it('keeps exactly 5000 points untouched', () => {
    const payload = payloadOf(spec('line', { series: [{ data: Array.from({ length: 5000 }, (_, i) => i) }] })) as { series: Array<{ data: number[] }> };
    assert.equal(payload.series[0].data.length, 5000);
  });
  it('leaves already canonical payloads byte-identical', () => {
    const canonical = { categories: ['A', 'B', 'C'], series: [{ name: 'Value', data: [3, 5, 4] }] };
    assert.deepEqual(payloadOf(spec('bar', canonical)), canonical);
  });
});

describe('coerceNumber', () => {
  const cases: Array<[unknown, number | null | undefined]> = [
    [3, 3], ['3', 3], [' 3.5 ', 3.5], ['1,200', 1200], ['45%', 45], ['-2', -2], ['−2', -2], ['１２', 12],
    [null, null], ['', null], ['-', null], ['NaN', null], [Number.NaN, null], ['abc', undefined], [true, undefined], ['1,2', undefined],
  ];
  for (const [input, expected] of cases) it(`${JSON.stringify(input)} → ${String(expected)}`, () => assert.equal(coerceNumber(input), expected));
});

describe('normalizeFunctionExpression', () => {
  const cases: Array<[string, string]> = [
    ['2x', '2*x'], ['3sin(x)', '3*sin(x)'], ['x(x+1)', 'x*(x+1)'], ['2πx', '2*pi*x'], ['x²+1', 'x^2+1'],
    ['f(x) = x^3', 'x^3'], ['2(x+1)(x-1)', '2*(x+1)*(x-1)'], ['e^x', 'e^x'], ['xsin(x)', 'x*sin(x)'], ['√x', 'sqrt(x)'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      const output = normalizeFunctionExpression(input);
      assert.equal(output, expected);
      assert.doesNotThrow(() => parseFunctionExpression(output));
    });
  }
  it('keeps already valid expressions in the spec as written', () => {
    assert.deepEqual(payloadOf(spec('function', { functions: [{ expression: 'sin(x)', label: 'sin' }] })), { functions: [{ expression: 'sin(x)', label: 'sin' }] });
  });
});

describe('visualizationTableRows', () => {
  it('builds rows from an alias payload the client used to draw as an empty axis', () => {
    assert.deepEqual(visualizationTableRows(spec('bar', { labels: ['甲', '乙'], values: ['3', 5] })), [['category', 'Series 1'], ['甲', 3], ['乙', 5]]);
  });
  it('covers scatter, radar, heatmap, items and graphs', () => {
    assert.equal(visualizationTableRows(spec('scatter', { x: [1], y: [2] })).length, 2);
    assert.equal(visualizationTableRows(spec('radar', { indicators: ['a', 'b', 'c'], series: [{ data: [1, 2, 3] }] })).length, 4);
    assert.equal(visualizationTableRows(spec('heatmap', { xCategories: ['a'], yCategories: ['x'], values: [[1]] })).length, 2);
    assert.equal(visualizationTableRows(spec('timeline', { items: ['a', 'b'] })).length, 3);
    assert.equal(visualizationTableRows(spec('flowchart', { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] })).length, 2);
  });
  it('returns [] when there is nothing tabular', () => {
    assert.deepEqual(visualizationTableRows(spec('svg_illustration', { source: '<svg/>' })), []);
    assert.deepEqual(visualizationTableRows(null), []);
  });
});
