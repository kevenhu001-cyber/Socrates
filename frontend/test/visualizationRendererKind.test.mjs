import test from 'node:test';
import assert from 'node:assert/strict';
import { chartPrefersCanvas, visualizationRendererKind } from '../src/render/visualizationRendererKind.ts';

test('every template maps to the engine whose stage height the skeleton reserves', () => {
  assert.equal(visualizationRendererKind('bar'), 'echarts');
  assert.equal(visualizationRendererKind('heatmap'), 'echarts');
  assert.equal(visualizationRendererKind('function'), 'plotly');
  assert.equal(visualizationRendererKind('geometry_3d'), 'three');
  assert.equal(visualizationRendererKind('math_construction'), 'geogebra');
  assert.equal(visualizationRendererKind('whiteboard'), 'tldraw');
  assert.equal(visualizationRendererKind('flowchart'), 'mermaid');
  assert.equal(visualizationRendererKind('svg_illustration'), 'extension');
  assert.equal(visualizationRendererKind('timeline'), 'semantic');
  assert.equal(visualizationRendererKind(undefined), 'semantic');
});

test('charts stay vector unless the data is large', () => {
  const grid = (rows, cols) => ({ values: Array.from({ length: rows }, () => Array(cols).fill(1)) });
  assert.equal(chartPrefersCanvas('heatmap', grid(3, 5)), false);
  assert.equal(chartPrefersCanvas('heatmap', grid(50, 50)), false);
  assert.equal(chartPrefersCanvas('heatmap', grid(51, 50)), true);
  assert.equal(chartPrefersCanvas('heatmap', {}), false);
  assert.equal(chartPrefersCanvas('line', { series: [{ data: Array(1200).fill(1) }] }), false);
  assert.equal(chartPrefersCanvas('line', { series: [{ data: Array(1201).fill(1) }] }), true);
  assert.equal(chartPrefersCanvas('bar', null), false);
});

test('formula labels retain SVG typesetting even for large datasets', () => {
  const payload = { categories: ['$x^2$'], series: [{ name: 'n', data: Array(2000).fill(1) }] };
  assert.equal(chartPrefersCanvas('line', payload), false);
});
