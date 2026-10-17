import test from 'node:test';
import assert from 'node:assert/strict';
import { optionForChart } from '../src/render/visualizationOptions.ts';

const colors = {
  text: '#222', muted: '#777', line: '#ccc', grid: '#eee', surface: '#fff',
  primary: '#36c', secondary: '#198', comparison: '#86c', highlight: '#d83', baseline: '#888',
};

test('heatmap gets matrix axes, flattened cells and a valid color scale', () => {
  const option = optionForChart({
    template: 'heatmap', accessibilitySummary: 'Two days split by time',
    payload: { xCategories: ['Mon', 'Tue'], yCategories: ['AM', 'PM'], values: [[2, 4], [3, 1]] },
  }, colors);

  assert.deepEqual(option.xAxis.data, ['Mon', 'Tue']);
  assert.deepEqual(option.yAxis.data, ['AM', 'PM']);
  assert.equal(option.yAxis.inverse, true);
  assert.deepEqual(option.series[0].data, [[0, 0, 2], [1, 0, 4], [0, 1, 3], [1, 1, 1]]);
  assert.equal(option.visualMap.min, 1);
  assert.equal(option.visualMap.max, 4);
});

test('radar data becomes named radar values with a range for every indicator', () => {
  const option = optionForChart({
    template: 'radar', accessibilitySummary: 'Two profiles',
    payload: {
      indicators: [{ name: 'Speed', max: 10 }, { name: 'Power' }, { name: 'Focus' }],
      series: [{ name: 'A', data: [8, 6, 9] }, { name: 'B', data: [5, 9, 4] }],
    },
  }, colors);

  assert.deepEqual(option.radar.indicator.map(({ name }) => name), ['Speed', 'Power', 'Focus']);
  assert.ok(option.radar.indicator.every(({ min, max }) => Number.isFinite(min) && Number.isFinite(max) && min < max));
  assert.deepEqual(option.series[0].data[0], { name: 'A', value: [8, 6, 9], itemStyle: { color: colors.primary }, lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 } });
});

test('scatter accepts both tuple and object points as numeric coordinates', () => {
  const option = optionForChart({
    template: 'scatter', accessibilitySummary: 'Three observations',
    payload: { xLabel: '<x>', yLabel: 'y', series: [{ name: 'Samples', data: [[1, 2], { x: 3, y: 4 }] }] },
  }, colors);

  assert.equal(option.xAxis.type, 'value');
  assert.deepEqual(option.series[0].data, [[1, 2], [3, 4]]);
  assert.match(option.tooltip.formatter({ seriesName: '<script>', value: [1, 2] }), /&lt;script&gt;/);
  assert.doesNotMatch(option.tooltip.formatter({ seriesName: '<script>', value: [1, 2] }), /<script>/);
});

test('category charts without labels synthesize readable ordinal categories', () => {
  const option = optionForChart({
    template: 'bar', accessibilitySummary: 'Three values',
    payload: { series: [{ data: [4, 2, 7] }] },
  }, colors);

  assert.deepEqual(option.xAxis.data, ['1', '2', '3']);
  assert.equal(option.series[0].type, 'bar');
});

test('function chart surfaces invalid expressions to the repair affordance', () => {
  assert.throws(() => optionForChart({
    template: 'function', accessibilitySummary: 'Invalid',
    payload: { functions: [{ expression: 'window.alert(1)' }] },
  }, colors), /Unsupported|Expected/);
});
