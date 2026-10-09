import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderStructureVisualization,
  renderVisualizationTable,
} from '../src/render/visualizationStatic.js';

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
