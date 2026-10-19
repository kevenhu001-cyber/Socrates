// @ts-check
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { getEventListeners } from 'node:events';
import { createToolRunner } from '../src/routes/chat/pipeline/toolExecutors.js';
import { dispatchToolCalls } from '../src/services/tools/toolDispatch.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';

after(async () => { await shutdownPubsub(); });

function prepared(id = 'plan-1') {
  const args = { title: 'Test plan', steps: [{ title: 'One step' }] };
  return {
    call: { id, type: 'function', function: { name: 'create_plan', arguments: JSON.stringify(args) } },
    toolName: 'create_plan', args, rejection: null, registryEntry: null,
  };
}

function fixture(signal, delay = 0) {
  const events = [], results = [], records = [], unmarked = [];
  const runner = createToolRunner({
    req: {}, sessionIdFromQuery: null, projectIdFromBody: null, mode: 'chat',
    abortSignal: signal,
    emitter: { event: (...args) => events.push(args) },
    toolPolicy: {
      retryDelayMs: () => delay,
      recordResult: (...args) => records.push(args),
      unmarkCall: (...args) => unmarked.push(args),
      remainingRetries: () => 1,
    },
    onResult: (id, result) => results.push({ id, ...result }),
    schemaForTool: () => null,
    connectorConnectionsByProvider: {}, projectConnectorConnectionsByProvider: {},
  });
  return { runner, events, results, records, unmarked };
}

function assertCancelled(f, id) {
  assert.deepEqual(f.records, [], 'cancellation must not execute or penalize the tool');
  assert.equal(f.unmarked.length, 1);
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0].id, id);
  assert.equal(f.results[0].status, 'cancelled');
  assert.equal(f.results[0].errorCode, 'tool_cancelled');
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0][1].status, 'cancelled');
}

test('already stopped runner does not execute a tool or consume its retry budget', async () => {
  const ac = new AbortController();
  ac.abort();
  const f = fixture(ac.signal);
  const message = await f.runner(prepared(), ['create_plan']);
  assertCancelled(f, 'plan-1');
  assert.equal(message.tool_call_id, 'plan-1');
  assert.equal(message.name, 'create_plan');
  assert.match(message.content, /cancelled/);
});

test('stopping during backoff cleans listener and timer without executing the tool', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ac = new AbortController();
  const f = fixture(ac.signal, 30_000);
  const pending = f.runner(prepared(), ['create_plan']);
  assert.equal(getEventListeners(ac.signal, 'abort').length, 1);
  ac.abort();
  await pending;
  assertCancelled(f, 'plan-1');
  assert.equal(getEventListeners(ac.signal, 'abort').length, 0);
  t.mock.timers.tick(30_000);
  assert.equal(f.results.length, 1, 'an expired timer cannot produce a second outcome');
});

test('normal backoff completion removes listeners across repeated successful calls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ac = new AbortController();
  const f = fixture(ac.signal, 100);
  for (let i = 0; i < 12; i += 1) {
    const pending = f.runner(prepared(`plan-${i}`), ['create_plan']);
    assert.equal(getEventListeners(ac.signal, 'abort').length, 1);
    t.mock.timers.tick(100);
    await pending;
    assert.equal(getEventListeners(ac.signal, 'abort').length, 0);
  }
  assert.equal(f.records.length, 12);
  assert.ok(f.results.every((r) => r.status === 'completed'));
});

for (const serial of [false, 'workspace']) {
  test(`queued tools are not executed after Stop (serial lane: ${serial})`, async () => {
    const previousLimit = process.env.TOOL_MAX_CONCURRENCY;
    process.env.TOOL_MAX_CONCURRENCY = '1';
    const ac = new AbortController();
    const f = fixture(ac.signal);
    let releaseFirst;
    const gate = new Promise((resolve) => { releaseFirst = resolve; });
    let started;
    const firstStarted = new Promise((resolve) => { started = resolve; });
    try {
      const messages = dispatchToolCalls([prepared('first'), prepared('queued')],
        (entry) => entry.toolName, { get: () => ({ sessionSerial: serial }) },
        async (entry) => {
          if (entry.call.id === 'first') {
            started();
            await gate;
            return { tool_call_id: 'first', content: 'completed' };
          }
          return f.runner(entry, ['create_plan']);
        });
      await firstStarted;
      ac.abort();
      releaseFirst();
      const result = await messages;
      assert.deepEqual(result.map((m) => m.tool_call_id), ['first', 'queued']);
      assertCancelled(f, 'queued');
      const healthy = fixture(new AbortController().signal);
      await healthy.runner(prepared('next'), ['create_plan']);
      assert.equal(healthy.results[0].status, 'completed');
    } finally {
      releaseFirst();
      if (previousLimit === undefined) delete process.env.TOOL_MAX_CONCURRENCY;
      else process.env.TOOL_MAX_CONCURRENCY = previousLimit;
    }
  });
}
