import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeGetConnectorSpec,
  executeSearchConnectors,
} from '../src/routes/chat/pipeline/executors/connectorDiscovery.js';
import {
  buildConnectorCatalog,
  createConnectorActivation,
} from '../src/services/integrations/connectorCatalog.js';
import { connectorSearchTallySnapshot } from '../src/lib/telemetry.js';

const catalog = buildConnectorCatalog({
  connectorConnectionsByProvider: { github: {} },
  projectConnectorConnectionsByProvider: { googlecalendar: {} },
});

function context() {
  const events = [];
  return {
    events,
    ctx: {
      emitter: { event: (type, payload) => events.push({ type, payload }) },
      connectorCatalog: catalog,
      connectorActivation: createConnectorActivation(),
    },
  };
}

function call(name) {
  return { id: 'call-1', type: 'function', function: { name, arguments: '{}' } };
}

test('search_connectors returns matches without activating them', async () => {
  const { ctx, events } = context();
  const key = 'yes|1-2|project|googlecalendar';
  const before = connectorSearchTallySnapshot()[key] || 0;
  const outcome = await executeSearchConnectors(
    { query: 'calendar events' },
    call('search_connectors'),
    ctx,
  );
  assert.equal(outcome.result.status, 'completed');
  assert.match(outcome.result.output, /oomol_google_calendar_list_events/);
  assert.equal(ctx.connectorActivation.active().length, 0);
  assert.equal(events[0].payload.ok, true);
  assert.equal(connectorSearchTallySnapshot()[key], before + 1);
});

test('get_connector_spec returns the schema and activates the tool', async () => {
  const { ctx } = context();
  const outcome = await executeGetConnectorSpec(
    { tool: 'github_list_repos' },
    call('get_connector_spec'),
    ctx,
  );
  assert.equal(outcome.result.status, 'completed');
  assert.match(outcome.result.output, /\[connector: github_list_repos\]/);
  assert.match(outcome.result.output, /Arguments:/);
  assert.equal(ctx.connectorActivation.has('github_list_repos'), true);
});

test('get_connector_spec rejects an unknown or unconnected tool', async () => {
  const { ctx } = context();
  const outcome = await executeGetConnectorSpec(
    { tool: 'zotero_search' },
    call('get_connector_spec'),
    ctx,
  );
  assert.equal(outcome.result.status, 'failed');
  assert.equal(outcome.result.errorCode, 'unknown_connector_tool');
  assert.equal(ctx.connectorActivation.has('zotero_search'), false);
});
