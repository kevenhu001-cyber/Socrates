import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createParser } from '@openuidev/react-lang';
import { JSDOM } from 'jsdom';
import { read } from '../src/react/intelligence-ui/openui/functions/shared.ts';
import { library } from '../src/react/intelligence-ui/openui/library.ts';
import { Grid, Row } from '../src/react/intelligence-ui/openui/layout.tsx';
import { webUrl, bg, size } from '../src/react/intelligence-ui/openui/style.ts';
import { runOpenUiAction } from '../src/react/intelligence-ui/openui/actionBridge.ts';
import { validateIntelligentUi } from '@socrates/core';

const example = `root = Col([Card([Title("Study planner"), hours, result])])
$hours = 2
hours = Slider($hours, 1, 8, 1, "Hours per day")
result = Text("Weekly hours: " + ($hours * 7))`;

test('the model prompt matches the actual OpenUI library and its example parses', () => {
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-openui-prompt.mts', '--check']);
  const parser = createParser(library.toJSONSchema(), 'Col');
  const parsed = parser.parse(example);
  assert.deepEqual(parsed.meta.errors, []);
  assert.equal(parsed.stateDeclarations['$hours'], 2);
  assert.ok(parsed.root);
  const spec = library.toSpec();
  assert.ok(spec.components.Chart && spec.components.Flashcard && spec.components.Svg && spec.components.Map && spec.components.SearchImage);
  for (const name of ['HtmlView', 'YouTube']) assert.equal(spec.components[name], undefined);
});

test('upstream math and data functions support working tools and safe field reads', () => {
  const fns = library.functions;
  assert.deepEqual(fns.Allocate.fn({ total: 100, weights: [1, 1, 1] }), [33.34, 33.33, 33.33]);
  assert.equal(fns.Convert.fn({ value: 100, from: 'c', to: 'f' }), 212);
  assert.equal(fns.Payment.fn({ principal: 1200, rate: 0, periods: 12 }), 100);
  assert.deepEqual(fns.GroupBy.fn({ rows: [{ team: 'A', total: 2 }, { team: 'A', total: 3 }], key: 'team', field: 'total' }), [{ key: 'A', value: 5 }]);
  assert.equal(read({ secret: 'x' }, '__proto__.secret'), undefined);
});

test('OpenUI envelope is validated without accepting empty or excessive source', () => {
  assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: example }] }).ok, true);
  for (const source of [null, '', ' ', 'x'.repeat(50001)]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] }).ok, false);
  }
});

test('model-controlled URLs and styles cannot introduce executable resource loads', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '/api/private', 'https://user:pass@example.com', 'file:///etc/passwd']) assert.equal(webUrl(url), null);
  assert.equal(webUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(bg('url(https://example.com/tracker)'), undefined);
  assert.equal(bg('red;position:fixed'), undefined);
  assert.equal(size('expression(alert(1))'), undefined);
});

test('layouts reflow by default while supporting explicitly compact rows and grids', () => {
  const renderNode = () => null;
  const grid = (props) => Grid.component({ props: { children: [], ...props }, renderNode });
  const row = (props) => Row.component({ props: { children: [], ...props }, renderNode });
  assert.match(grid({ columns: 3 }).props.style.gridTemplateColumns, /auto-fill.*180px/);
  assert.match(grid({ columns: 2, minChildWidth: 240 }).props.style.gridTemplateColumns, /auto-fill.*240px/);
  assert.equal(grid({ columns: 4, minChildWidth: 0 }).props.style.gridTemplateColumns, 'repeat(4, minmax(0, 1fr))');
  assert.equal(row({}).props.style.flexWrap, 'wrap');
  assert.equal(row({ wrap: false }).props.style.flexWrap, undefined);
});

test('host actions reuse chat, preserve submitted values and block readonly requests', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const previous = { window: globalThis.window, CustomEvent: globalThis.CustomEvent };
  globalThis.window = dom.window;
  globalThis.CustomEvent = dom.window.CustomEvent;
  try {
    const host = dom.window.document.getElementById('host');
    const requests = [];
    const opened = [];
    host.addEventListener('tool-retry', (event) => requests.push(event.detail.prompt));
    dom.window.open = (...args) => opened.push(args);
    const event = { type: 'continue_conversation', params: { context: 'Make a plan' }, humanFriendlyMessage: 'Continue', formState: { hours: { value: 3 } } };
    runOpenUiAction(event, host, false);
    assert.match(requests[0], /Make a plan/);
    assert.match(requests[0], /"value":3/);
    runOpenUiAction(event, host, true);
    runOpenUiAction({ ...event, type: 'unknown' }, host, false);
    runOpenUiAction({ ...event, type: 'open_url', params: { url: 'javascript:alert(1)' } }, host, false);
    assert.equal(requests.length, 1);
    assert.equal(opened.length, 0);
    runOpenUiAction({ ...event, type: 'open_url', params: { url: 'https://example.com' } }, host, false);
    assert.deepEqual(opened[0], ['https://example.com/', '_blank', 'noopener,noreferrer']);
  } finally {
    globalThis.window = previous.window;
    globalThis.CustomEvent = previous.CustomEvent;
    dom.window.close();
  }
});
