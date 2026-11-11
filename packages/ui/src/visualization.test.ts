import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisualizationDocument, formatNumber, isVisualizationSpec } from './visualization.ts';

const spec = {
  version: 1 as const,
  template: 'bar',
  title: 'Enrollment <by year>',
  accessibilitySummary: 'Bar chart of enrollment per year.',
  payload: { categories: ['2023', '2024'], series: [{ name: 'Students', data: [120, 150] }] },
};

test('v1 visualization specs are recognized and rejected when malformed', () => {
  assert.equal(isVisualizationSpec(spec), true);
  assert.equal(isVisualizationSpec({ ...spec, version: 2 }), false);
  assert.equal(isVisualizationSpec({ ...spec, payload: [] }), false);
  assert.equal(isVisualizationSpec(null), false);
});


test('the island document renders an inline SVG chart and escapes the title', () => {
  const html = buildVisualizationDocument(spec, { artifactId: 'a1', mode: 'light' });
  assert.match(html, /<svg[^>]*viewBox="0 0 640 260"/);
  assert.match(html, /<rect /);
  assert.match(html, /Enrollment &lt;by year&gt;/);
  assert.doesNotMatch(html, /Enrollment <by year>/);
  assert.match(html, /artifactBridge/);
  assert.match(html, /data-artifact-id="a1"/);
  assert.match(html, /Content-Security-Policy/);
});

test('interactive_simulation embeds its source and appends the bridge', () => {
  const source = '<html><body><script>1+1<\/script></body></html>';
  const html = buildVisualizationDocument({ ...spec, template: 'interactive_simulation', payload: { source } }, { artifactId: 'sim', mode: 'dark' });
  assert.match(html, /<script>1\+1<\/script><script>\(function\(\)/);
  assert.match(html, /<\/script><\/body><\/html>$/);
});

test('number formatting keeps small decimals and groups thousands', () => {
  assert.equal(formatNumber(1.234), '1.23');
  assert.equal(formatNumber(4200), '4,200');
});
