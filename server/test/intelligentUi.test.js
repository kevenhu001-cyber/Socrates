import test, { after } from 'node:test';

// Importing the native dispatcher starts the shared PostgreSQL listener.
after(async () => {
  const { shutdownPubsub } = await import('../src/lib/pubsub.js');
  await shutdownPubsub();
});
import assert from 'node:assert/strict';
import { validateIntelligentUi } from '../src/services/intelligentUi.js';
import { executeIntelligentUi } from '../src/routes/chat/pipeline/executors/intelligentUi.js';

const node = { id: 'root', type: 'panel', title: 'A useful view' };
test('native UI validates version, node bounds, identity and parent graph', () => {
  assert.equal(validateIntelligentUi({ version: 1, nodes: [node, { id: 'text', type: 'text', parent: 'root', text: 'Hello' }] }).ok, true);
  assert.equal(validateIntelligentUi({ version: 1, nodes: [node, { id: 'notify', type: 'toggle', parent: 'root', bind: 'notify', label: 'Notify' }] }).ok, true);
  for (const document of [
    { version: 2, nodes: [node] }, { version: 1, nodes: [] },
    { version: 1, nodes: [node, node] }, { version: 1, nodes: [{ ...node, type: 'script' }] },
    { version: 1, nodes: [{ ...node, parent: 'missing' }] },
    { version: 1, nodes: [{ ...node, parent: 'root' }] },
    { version: 1, nodes: Array.from({ length: 81 }, (_, i) => ({ ...node, id: String(i) })) },
  ]) assert.equal(validateIntelligentUi(document).ok, false);
});
test('unsafe keys, credentials, URL schemes and nested payloads are rejected', () => {
  for (const value of [
    { action: { type: 'open_url', url: 'javascript:alert(1)' } },
    { image: 'https://user:pass@example.com/image.png' },
    { state: JSON.parse('{"__proto__":{"polluted":true}}') },
    { html: '<script>alert(1)</script>' },
  ]) assert.equal(validateIntelligentUi({ version: 1, nodes: [{ ...node, ...value }] }).ok, false);
});
test('executor sends normal tool results without mixing UI into assistant prose', async () => {
  const events = [];
  const outcome = await executeIntelligentUi({ version: 1, nodes: [node] }, { id: 'ui' }, { emitter: { event: (...args) => events.push(args) } });
  assert.equal(outcome.result.status, 'completed');
  assert.equal(events[0][0], 'tool_result');
  assert.doesNotMatch(outcome.result.output, /socrates-ui|"type"/);
});

test('native UI validation failures reach persistence outcome accounting', async () => {
  const { createToolRunner } = await import('../src/routes/chat/pipeline/toolExecutors.js');
  const outcomes = [];
  const runner = createToolRunner({
    req: {}, sessionIdFromQuery: null, projectIdFromBody: null, mode: 'chat',
    emitter: { event() {} }, abortSignal: new AbortController().signal,
    schemaForTool: () => null, connectorConnectionsByProvider: {}, projectConnectorConnectionsByProvider: {},
    onResult: (id, result) => outcomes.push({ id, result }),
    toolPolicy: { retryDelayMs: () => 0, recordResult() {}, unmarkCall() {} },
  });
  await runner({ toolName: 'render_intelligent_ui', call: { id: 'unsafe', function: { name: 'render_intelligent_ui' } }, args: { version: 1, nodes: [{ ...node, parent: 'missing' }] } }, ['render_intelligent_ui']);
  assert.equal(outcomes[0].id, 'unsafe');
  assert.equal(outcomes[0].result.status, 'failed');
  assert.equal(outcomes[0].result.errorCode, 'invalid_tool_arguments');
});

test('native OpenUI nodes use the existing tool contract and retain source for clients', async () => {
  const { INTELLIGENT_UI_TOOL } = await import('../src/services/intelligentUi.js');
  const source = 'root = Col([Text("Hello from OpenUI")])';
  const args = { version: 1, nodes: [{ id: 'openui', type: 'openui', source }] };
  const events = [];
  const outcome = await executeIntelligentUi(args, { id: 'openui-call' }, { emitter: { event: (...args) => events.push(args) } });
  assert.equal(outcome.result.status, 'completed');
  assert.equal(events[0][1].name, 'render_intelligent_ui');
  const nodeSchema = INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties;
  assert.ok(nodeSchema.type.enum.includes('openui'));
  assert.match(nodeSchema.source.description, /Available positional signatures/);
  for (const invalid of ['', ' ', null, 'x'.repeat(50001)]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: invalid }] }).ok, false);
  }
});

test('OpenUI semantic failures produce actionable tool feedback', async () => {
  for (const source of ['not a program', 'root = Col([Button("=")])', 'root = Col([Input(5, "Amount")])', 'root = Col([Text($missing)])']) {
    const outcome = await executeIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] }, { id: 'bad-ui' }, { emitter: { event() {} } });
    assert.equal(outcome.result.status, 'failed', source);
    assert.match(outcome.result.correction, /Fix the UI/);
  }
  assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: 'root = Col([Calculator("计算器")])' }] }).ok, true);
});

test('legacy native UI cannot report successful nonfunctional buttons', () => {
  for (const action of [undefined, { type: 'calculate' }, { type: 'set', key: '__proto__', value: 3 }, { type: 'prompt' }, { type: 'set', key: 'result' }]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'action', type: 'button', label: 'Run', action }] }).ok, false);
  }
});

test('composed visualizations receive the existing native payload validation', () => {
  const valid = 'root = Col([Slider($n,1,8),Visualization("bar","Linked",{categories:["A"],series:[{data:[$n * 2]}]},"Linked chart")])\n$n = 2';
  assert.equal(validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source: valid }] }).ok, true);
  for (const source of [valid.replace('"bar"', '"unknown"'), valid.replace('series:', 'wrong:')]) {
    const result = validateIntelligentUi({ version: 1, nodes: [{ id: 'app', type: 'openui', source }] });
    assert.equal(result.ok, false);
    assert.match(result.error, /Visualization/);
  }
});
