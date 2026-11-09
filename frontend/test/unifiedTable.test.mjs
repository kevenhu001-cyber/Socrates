import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Element', 'Node', 'NodeFilter', 'DocumentFragment', 'HTMLElement', 'HTMLTemplateElement']) {
  if (globalThis[key] === undefined) globalThis[key] = dom.window[key];
}

const { formatMsg } = await import('../src/render/markdown.ts');
const { renderVisualizationTable } = await import('../src/render/visualizationStatic.ts');

test('unified table contract: markdown GFM table renders ds-table-wrap and ds-table', () => {
  const prevMarked = globalThis.marked;
  globalThis.marked = marked;
  try {
    const md = `
| Name | Role | Score |
| :--- | :---: | ---: |
| Alice | Admin | 100 |
| Bob | User | 85 |
`;
    const html = formatMsg(md);
    assert.match(html, /class="ds-table-wrap"/);
    assert.match(html, /role="region"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /aria-label="Data table"/);
    assert.match(html, /<table class="ds-table">/);

    // Verifies alignments
    assert.match(html, /<th align="left">Name<\/th>/);
    assert.match(html, /<th align="center">Role<\/th>/);
    assert.match(html, /<th align="right">Score<\/th>/);

    // Verifies body rows
    assert.match(html, /<td align="left">Alice<\/td>/);
    assert.match(html, /<td align="center">Admin<\/td>/);
    assert.match(html, /<td align="right">100<\/td>/);
  } finally {
    globalThis.marked = prevMarked;
  }
});

test('unified table contract: visualization table uses ds-table-wrap and ds-table', () => {
  const spec = {
    version: 1,
    template: 'bar',
    title: 'Sales Overview',
    payload: {
      categories: ['Q1', 'Q2'],
      series: [{ name: 'Revenue', data: [100, 200] }],
    },
  };
  const escapeHtml = (s) => String(s);
  const translate = (_key, def) => def;
  const html = renderVisualizationTable(spec, escapeHtml, translate);

  assert.match(html, /class="ds-table-wrap visualization-table-wrap"/);
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-label="Sales Overview"/);
  assert.match(html, /<table class="ds-table visualization-table">/);
  assert.match(html, /<th>Category<\/th>/);
  assert.match(html, /<td>Q1<\/td>/);
});
