// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolRunner } from '../src/routes/chat/pipeline/toolExecutors.js';

function setup({ backoffMs = 0 } = {}) {
  const events = [];
  let executorStarted = false;
  const emitter = {
    event(name, data) { events.push({ name, data }); },
  };
  const toolPolicy = {
    retryDelayMs() { return backoffMs; },
    recordResult() {},
    unmarkCall() {},
  };
  const executor = async () => {
    executorStarted = true;
    return { result: { status: 'completed', output: 'ok' } };
  };
  const runner = createToolRunner({
    req: { userId: 'test-user' },
    sessionIdFromQuery: null,
    projectIdFromBody: null,
    mode: 'chat',
    emitter,
    abortSignal: new AbortController().signal,
    toolPolicy,
    schemaForTool: () => null,
    connectorConnectionsByProvider: {},
    projectConnectorConnectionsByProvider: {},
  }, { get: () => executor });
  const entry = {
    call: {
      id: 'call-1',
      type: 'function',
      function: { name: 'sample_tool', arguments: '{}' },
    },
    toolName: 'sample_tool',
    registryEntry: null,
    args: {},
    rejection: null,
  };
  return { runner, entry, events, get executorStarted() { return executorStarted; } };
}

test('emits a running progress frame before invoking a tool without native progress', async () => {
  const h = setup();
  const message = await h.runner(h.entry, ['sample_tool']);

  assert.equal(h.executorStarted, true);
  assert.equal(h.events[0].name, 'tool_progress');
  assert.deepEqual(
    { id: h.events[0].data.id, phase: h.events[0].data.phase, stream: h.events[0].data.stream, chunk: h.events[0].data.chunk },
    { id: 'call-1', phase: 'running', stream: null, chunk: '' },
  );
  assert.ok(h.events[0].data.elapsedMs >= 0);
  assert.equal(message.role, 'tool');
  assert.match(message.content, /<tool_data source="sample_tool">\nok\n<\/tool_data>/);
});

test('reports retry backoff as queued, then reports running before execution', async () => {
  const h = setup({ backoffMs: 5 });
  await h.runner(h.entry, ['sample_tool']);

  assert.deepEqual(h.events.map((event) => event.data.phase), ['queued', 'running']);
  assert.ok(h.events[1].data.elapsedMs >= 0);
  assert.equal(h.executorStarted, true);
});
