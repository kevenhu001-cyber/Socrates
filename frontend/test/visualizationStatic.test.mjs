import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderComparisonVisualization,
  renderGeometryVisualization,
  renderNumberLineVisualization,
  renderProcessVisualization,
  renderSemanticVisualization,
  renderStructureVisualization,
  renderTimelineVisualization,
  renderVisualizationTable,
} from '../src/render/visualizationStatic.ts';

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>\'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}

function truncateLabel(value, max) {
  const chars = Array.from(String(value || ''));
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}

test('visualization tables escape cells and cap rendered rows', () => {
  const functionTable = renderVisualizationTable({
    template: 'function',
    payload: { functions: [{ label: '<img>', expression: 'x < 2', domain: [-1, 1] }] },
  }, escapeHtml, (_key, fallback) => fallback);

  assert.match(functionTable, /&lt;img&gt;/);
  assert.match(functionTable, /x &lt; 2/);

  const capped = renderVisualizationTable({
    template: 'bar',
    payload: {
      categories: Array.from({ length: 121 }, (_, index) => 'Category ' + index),
      series: [{ name: 'Values', data: Array.from({ length: 121 }, (_, index) => index) }],
    },
  }, escapeHtml, (_key, fallback) => fallback);
  assert.equal((capped.match(/<tr>/g) || []).length, 121);
});

test('structure renderer uses caller-owned marker ids and escapes labels', () => {
  const svg = renderStructureVisualization({
    accessibilitySummary: 'A <diagram>',
    payload: {
      nodes: [{ id: 'a', label: '<script>alert(1)</script>' }, { id: 'b', label: 'Result' }],
      edges: [{ from: 'a', to: 'b', label: 'leads to' }, { from: 'missing', to: 'b' }],
    },
  }, 'visual-arrow-test', escapeHtml, 'Noto Sans SC', truncateLabel);

  assert.match(svg, /id="visual-arrow-test"/);
  assert.match(svg, /marker-end="url\(#visual-arrow-test\)"/);
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /A &lt;diagram&gt;/);
});

test('semantic renderers use the structure that matches each template', () => {
  const timeline = renderTimelineVisualization({
    template: 'timeline', accessibilitySummary: 'Dates',
    payload: { items: [{ label: 'Start', value: '2020' }, { label: 'Finish', value: '2024' }] },
  }, escapeHtml, 'Noto Sans SC', truncateLabel);
  assert.match(timeline, /visualization-timeline/);
  assert.match(timeline, />2020</);

  const process = renderProcessVisualization({
    template: 'process', accessibilitySummary: 'Steps',
    payload: { items: [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }] },
  }, 'process-arrow-test', escapeHtml, 'Noto Sans SC', truncateLabel);
  assert.match(process, /marker-end="url\(#process-arrow-test\)"/);
  assert.match(process, />Three</);

  const comparison = renderComparisonVisualization({
    template: 'comparison', accessibilitySummary: 'Two options',
    payload: { items: [{ label: 'A', value: 'Fast' }, { label: 'B', value: 'Cheap' }] },
  }, escapeHtml, 'Noto Sans SC', truncateLabel);
  assert.match(comparison, /visualization-comparison/);
  assert.match(comparison, />Cheap</);

  const hierarchy = renderSemanticVisualization({
    template: 'tree', accessibilitySummary: 'A hierarchy',
    payload: { nodes: [{ id: 'root', label: 'Root' }, { id: 'child', label: 'Child' }], edges: [{ from: 'root', to: 'child' }] },
  }, 'tree-arrow-test', escapeHtml, 'Noto Sans SC', truncateLabel);
  assert.match(hierarchy, /M380 90 C380 118, 380 118, 380 146/);
});

test('number-line and geometry renderers include points and labels safely', () => {
  const numberLine = renderNumberLineVisualization({
    template: 'number_line', accessibilitySummary: 'Three values',
    payload: { items: [{ label: 'Negative', value: -2 }, { label: 'Zero', value: 0 }, { label: 'Positive', value: 4 }] },
  }, escapeHtml, 'Noto Sans SC', truncateLabel);
  assert.match(numberLine, /visualization-number-line/);
  assert.match(numberLine, />Negative</);
  assert.match(numberLine, />4</);

  const geometry = renderGeometryVisualization({
    template: 'geometry', accessibilitySummary: 'A triangle',
    payload: { shapes: [{ type: 'point', at: [0, 0], label: '<Origin>' }, { type: 'segment', from: [0, 0], to: [2, 1] }, { type: 'circle', center: [1, 1], radius: 0.5 }, { type: 'polygon', points: [[0, 0], [2, 0], [1, 2]], label: 'Triangle' }] },
  }, escapeHtml, 'Noto Sans SC', truncateLabel);
  assert.match(geometry, /visualization-geometry/);
  assert.match(geometry, /&lt;Origin&gt;/);
  assert.match(geometry, /<polygon/);
});

test('heatmap and radar tables expose their category axes', () => {
  const heatmap = renderVisualizationTable({
    template: 'heatmap', payload: { xCategories: ['Mon', 'Tue'], yCategories: ['AM', 'PM'], values: [[2, 4], [3, 1]] },
  }, escapeHtml, (_key, fallback) => fallback);
  assert.match(heatmap, /Mon/);
  assert.match(heatmap, /PM/);
  assert.match(heatmap, />3</);

  const radar = renderVisualizationTable({
    template: 'radar', payload: { indicators: [{ name: 'Speed' }, { name: 'Focus' }], series: [{ name: 'A', data: [8, 5] }] },
  }, escapeHtml, (_key, fallback) => fallback);
  assert.match(radar, /Speed/);
  assert.match(radar, />8</);
});
