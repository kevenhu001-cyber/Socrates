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
