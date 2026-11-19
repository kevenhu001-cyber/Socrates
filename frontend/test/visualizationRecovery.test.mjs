import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  '<!doctype html><html data-mode="light" data-theme="a"><body></body></html>',
  { pretendToBeVisual: true },
);
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  XMLSerializer: dom.window.XMLSerializer,
  getComputedStyle: dom.window.getComputedStyle,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  MutationObserver: dom.window.MutationObserver,
  NodeFilter: dom.window.NodeFilter,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout,
});
const { mountVisualization, disposeVisualization, disposeVisualizations } =
  await import('../src/render/visualization.ts');
const { mountSpecializedVisualization } = await import('../src/render/visualizationAdapters.ts');
const { sampleFunction } = await import('@socrates/core/visualizationMath');
const spec = (template, payload) => ({
  version: 1,
  template,
  title: template,
  accessibilitySummary: template,
  payload,
});
const host = () => document.body.appendChild(document.createElement('div'));
afterEach(() => {
  disposeVisualizations(document.body);
  document.body.replaceChildren();
});

for (const [template, payload, globalName, runtime] of [
  [
    'bar',
    { categories: ['A'], series: [{ data: [1] }] },
    'echarts',
    {
      init: () => ({ setOption() {}, on() {}, dispose() {}, isDisposed: () => false, resize() {} }),
    },
  ],
  [
    'paper_chart',
    { categories: ['A'], series: [{ data: [1] }] },
    'Plotly',
    {
      newPlot: async () => {},
      relayout: async () => {},
      purge() {},
      toImage: async () => '',
    },
  ],
  [
    'flowchart',
    { nodes: [{ id: 'a', label: 'A' }], edges: [] },
    'mermaid',
    {
      initialize() {},
      render: async () => ({ svg: '<svg><text>A</text></svg>' }),
    },
  ],
])
  test(`${template} retries after the engine loader rejected`, async (t) => {
    const original = document.head.appendChild.bind(document.head);
    t.mock.method(document.head, 'appendChild', (node) => {
      original(node);
      if (node.tagName === 'SCRIPT') queueMicrotask(() => node.onload?.());
      return node;
    });
    delete window[globalName];
    const failed = await mountVisualization(spec(template, payload), host());
    assert.ok(failed.querySelector('.visualization-fallback'));
    window[globalName] = runtime;
    const recovered = await mountVisualization(spec(template, payload), host());
    assert.equal(recovered.querySelector('.visualization-fallback'), null);
    disposeVisualization(recovered);
  });

test('Plotly reacts to a palette change within the same day/night mode', async () => {
  const relayouts = [];
  window.Plotly.relayout = (_stage, options) => {
    relayouts.push(options);
    return Promise.resolve();
  };
  const card = await mountVisualization(
    spec('paper_chart', { categories: ['A'], series: [{ data: [1] }] }),
    host(),
  );
  document.documentElement.setAttribute('data-theme', 'another-palette');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(relayouts.length, 1);
  disposeVisualization(card);
  document.documentElement.setAttribute('data-theme', 'after-dispose');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(relayouts.length, 1, 'cleanup releases the theme observer');
});

test('GeoGebra removes its runtime on dispose and ignores callbacks after timeout', async (t) => {
  let options;
  let removed = 0;
  let executed = 0;
  const api = {
    evalCommand: () => {
      executed++;
      return true;
    },
    remove: () => {
      removed++;
    },
  };
  window.GGBApplet = class {
    constructor(input) {
      options = input;
    }
    inject() {
      options.appletOnLoad(api);
    }
  };
  const construction = spec('math_construction', { commands: ['A=(0,0)'] });
  const mounted = await mountSpecializedVisualization(construction, host(), { sampleFunction });
  assert.equal(executed, 1);
  mounted.cleanup();
  assert.equal(removed, 1);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  window.GGBApplet.prototype.inject = () => {};
  const pending = mountSpecializedVisualization(construction, host(), { sampleFunction });
  await Promise.resolve();
  t.mock.timers.tick(20000);
  await assert.rejects(pending, /did not finish loading/);
  options.appletOnLoad(api);
  assert.equal(executed, 1, 'late applet cannot execute old commands');
  assert.equal(removed, 2, 'late applet is released');
});

test('Mermaid SVG text recovers encoded absolute-value bars without interpreting markup', async () => {
  const priorKatex = globalThis.katex;
  globalThis.katex = { renderToString: () => '' };
  window.mermaid.render = async () => ({
    svg: '<svg><text>$&amp;#124;x&amp;#124; &amp;#60; 2$</text></svg>',
  });
  const card = await mountVisualization(
    spec('flowchart', { nodes: [{ id: 'a', label: '$|x| < 2$' }], edges: [] }),
    host(),
  );
  assert.equal(card.querySelector('svg text').textContent, '$|x| < 2$');
  assert.equal(card.querySelector('svg script'), null);
  disposeVisualization(card);
  globalThis.katex = priorKatex;
});
