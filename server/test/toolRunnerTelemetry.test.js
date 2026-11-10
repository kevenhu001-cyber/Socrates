import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createToolRunner } from '../src/routes/chat/pipeline/toolExecutors.js';
import { createToolTurnPolicy } from '../src/services/tools/toolTurnPolicy.js';
import { PLAN_TOOL } from '../src/services/core/planning.js';
import { toolOutcomeTallySnapshot } from '../src/lib/telemetry.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';

after(async () => { await shutdownPubsub(); });

function runnerFor(toolPolicy) {
  const events = [];
  const runner = createToolRunner({
    req: { userId: 'user-1' },
    sessionIdFromQuery: null,
    projectIdFromBody: null,
    mode: 'chat',
    emitter: { event: (type, payload) => events.push({ type, payload }) },
    abortSignal: new AbortController().signal,
    toolPolicy,
    schemaForTool: (name) => (name === 'create_plan' ? PLAN_TOOL.function.parameters : null),
    connectorConnectionsByProvider: {},
    projectConnectorConnectionsByProvider: {},
    connectorCatalog: { entries: [], byTool: new Map(), services: [] },
    connectorActivation: { activate() {}, has() { return false; }, active() { return []; } },
  });
  return { runner, events };
}

function prepared(overrides) {
  return {
    call: { id: 'call-1', type: 'function', function: { name: 'create_plan', arguments: '{}' } },
    toolName: 'create_plan',
    registryEntry: { enabled: true },
    args: {},
    rejection: null,
    ...overrides,
  };
}

test('a rejected tool call is tallied before execution', async () => {
  const { runner } = runnerFor(createToolTurnPolicy());
  const key = 'create_plan|failed|arguments_schema_failed|yes|rejected';
  const before = toolOutcomeTallySnapshot()[key] || 0;
  await runner(prepared({
    rejection: {
      code: 'arguments_schema_failed',
      retryable: true,
      fieldErrors: 'title: missing required field',
    },
  }), ['create_plan']);
  assert.equal(toolOutcomeTallySnapshot()[key], before + 1);
});

test('a completed tool call is tallied after execution', async () => {
  const { runner } = runnerFor(createToolTurnPolicy());
  const key = 'create_plan|completed|none|no|executed';
  const before = toolOutcomeTallySnapshot()[key] || 0;
  await runner(prepared({
    args: { title: 'Plan', steps: [{ title: 'Step' }] },
  }), ['create_plan']);
  assert.equal(toolOutcomeTallySnapshot()[key], before + 1);
});

test('an executor failure is tallied with its error code', async () => {
  const { runner } = runnerFor(createToolTurnPolicy());
  const key = 'create_plan|failed|plan_spec_invalid|yes|executed';
  const before = toolOutcomeTallySnapshot()[key] || 0;
  await runner(prepared({ args: { title: 'Plan', steps: [] } }), ['create_plan']);
  assert.equal(toolOutcomeTallySnapshot()[key], before + 1);
});
