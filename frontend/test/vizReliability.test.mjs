/* V1 visualization reliability on the client: the card draws the same
 * normalized data the server validated, table and chart fail independently,
 * a chart failure falls back to the table with a readable reason, and code
 * fences are never executed as pages. */
import { afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

let echartsMode = 'ok';
const options = [];
window.echarts = {
  init() {
    if (echartsMode === 'throw') throw new Error('chart engine exploded');
    return {
      setOption(option) { options.push(option); },
      on() {}, dispose() {}, isDisposed() { return false; }, resize() {}, clear() {},
      getDataURL() { return ''; }, dispatchAction() {},
    };
  },
};

let viz;
let markdown;
let source;
let states;
before(async () => {
  viz = await import('../src/render/visualization.ts');
  markdown = await import('../src/render/markdown.ts');
  source = await import('../src/react/intelligence-ui/openui/visualizationSource.ts');
  states = await import('../src/react/visualization/VisualizationStates.tsx');
});
beforeEach(() => { document.body.replaceChildren(); options.length = 0; echartsMode = 'ok'; });
afterEach(() => viz.disposeVisualizations(document.body));

async function mount(spec) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return viz.mountVisualization(spec, host, { toolCallId: `t-${Math.random()}` });
}

test('an alias payload the server accepted draws real series (was an empty axis)', async () => {
  const card = await mount({ version: 1, template: 'bar', title: '别名', accessibilitySummary: 's', payload: { labels: ['甲', '乙', '丙'], values: ['3', 5, 4] } });
  assert.equal(card.dataset.visualizationRenderer, 'echarts');
  const option = options.at(-1);
  assert.equal(option.series.length, 1);
  assert.deepEqual(option.series[0].data.map((point) => (typeof point === 'object' && point ? point.value : point)), [3, 5, 4]);
  assert.equal(card.querySelectorAll('.visualization-data tbody tr').length, 3);
  assert.equal(card.querySelector('.visualization-stage-progress'), null, 'progress line is removed once drawn');
});

test('series written as an object no longer throws in the table or the chart', async () => {
  const card = await mount({ version: 1, template: 'bar', title: 'obj', accessibilitySummary: 's', payload: { categories: ['a', 'b'], series: { name: 'v', data: [1, 2] } } });
  assert.equal(card.dataset.visualizationState, undefined);
  assert.equal(card.querySelectorAll('.visualization-data tbody tr').length, 2);
});

test('a chart engine failure falls back to the data table with a readable reason', async () => {
  echartsMode = 'throw';
  const card = await mount({ version: 1, template: 'line', title: '温度', accessibilitySummary: 's', payload: { categories: ['1月', '2月'], series: [{ name: 't', data: [3, 7] }] } });
  assert.equal(card.dataset.visualizationState, 'fallback-table');
  const table = card.querySelector('.visualization-data');
  assert.equal(table.hidden, false);
  assert.equal(table.querySelectorAll('tbody tr').length, 2);
  const notice = card.querySelector('.visualization-fallback').textContent;
  assert.doesNotMatch(notice, /视觉内容暂未渲染/);
  assert.ok(card.querySelector('[data-viz-fallback="retry"]'));
  assert.ok(card.querySelector('[data-viz-fallback="fix"]'));
});

test('a chart with no drawable data shows a failure state instead of an empty axis', async () => {
  const card = await mount({ version: 1, template: 'pie', title: '空', accessibilitySummary: 's', payload: { categories: ['a'], series: [{ name: 'x' }] } });
  assert.ok(['failed', 'fallback-table'].includes(card.dataset.visualizationState));
  assert.ok(card.querySelector('.visualization-fallback'));
  assert.equal(options.length, 0, 'no empty option is ever handed to the engine');
});

test('labelled code fences stay code; only html/viz/svg or unlabeled pages preview', () => {
  const jsx = 'export function Card({ title }) {\n  return <div className="card"><h3>{title}</h3></div>;\n}';
  assert.equal(markdown.unlabeledHtml('jsx', jsx), false);
  assert.equal(markdown.unlabeledHtml('vue', '<template><div class="x">hello world here</div></template>'), false);
  assert.equal(markdown.unlabeledHtml('', '<div><style>p{color:red}</style><p>a page body here</p></div>'), true);
  const html = markdown.formatMsg('示例：\n\n```jsx\n' + jsx + '\n```\n');
  assert.doesNotMatch(html, /<iframe|data-viz-id|viz-frame/i);
  assert.match(html, /<pre><code/);
});

test('failure cards recover the real title and payload from OpenUI source, even truncated', () => {
  const program = 'root = Col([v])\nv = Visualization("bar", "三个班级", {"categories":["一班","二班"],"series":[{"name":"数学","data":[82,76]}]}, "s")';
  const [call] = source.extractVisualizationCalls(program);
  assert.equal(call.template, 'bar');
  assert.equal(call.title, '三个班级');
  assert.deepEqual(call.payload.categories, ['一班', '二班']);
  const args = JSON.stringify({ version: 1, nodes: [{ id: 'v', type: 'openui', source: program }] });
  assert.equal(source.openUiSourcesOf(args.slice(0, Math.floor(args.length * 0.8))).length, 1);
  const truncated = source.extractVisualizationCalls(source.openUiSourcesOf(args.slice(0, 120))[0] || '')[0];
  assert.equal(truncated?.title, '三个班级');
  assert.equal(truncated?.payload, null);
});

test('server failure details map to one readable reason', () => {
  assert.equal(states.reasonFromToolFailure({ stage: 'openui_truncated', truncated: true }), 'truncated');
  assert.equal(states.reasonFromToolFailure({ stage: 'visualization', visualizations: [{ stage: 'payload_shape', issues: ['payload.series.0.data.0: Invalid input: expected number, received string'] }] }), 'dataFormat');
  assert.equal(states.reasonFromToolFailure({ stage: 'visualization', visualizations: [{ stage: 'semantic', issues: ['payload.series.0.data: must contain exactly 3 values'] }] }), 'mismatch');
  assert.equal(states.reasonFromToolFailure({ stage: 'openui_syntax' }), 'syntax');
  assert.equal(states.reasonFromToolFailure({ stage: 'demonstration' }), 'structure');
  assert.equal(states.reasonFromToolFailure({ stage: 'physics' }), 'structure');
  assert.equal(states.reasonFromToolFailure({ stage: 'envelope' }), 'structure');
  assert.equal(states.reasonFromToolFailure(null, 'arguments_parse_failed'), 'truncated');
  assert.equal(states.reasonFromToolFailure(null, null), 'unknown');
});
