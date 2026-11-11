import test from 'node:test';
import assert from 'node:assert/strict';

import {
  connectorSearchTallySnapshot,
  recordConnectorSearch,
  recordToolOutcome,
  toolOutcomeTallySnapshot,
} from '../src/lib/telemetry.js';

test('tool outcomes are tallied by tool, outcome, error code, retryability and stage', () => {
  const key = 'web_search|failed|rate_limited|yes|rejected';
  const before = toolOutcomeTallySnapshot()[key] || 0;
  recordToolOutcome({
    tool: 'web_search',
    outcome: 'failed',
    errorCode: 'rate_limited',
    retryable: true,
    stage: 'rejected',
  });
  assert.equal(toolOutcomeTallySnapshot()[key], before + 1);
});

test('missing error codes and retryability use bounded default labels', () => {
  const key = 'create_document|completed|none|no|executed';
  const before = toolOutcomeTallySnapshot()[key] || 0;
  recordToolOutcome({ tool: 'create_document', outcome: 'completed' });
  assert.equal(toolOutcomeTallySnapshot()[key], before + 1);
});

test('connector searches are tallied by hit, match bucket and top result', () => {
  const hitKey = 'yes|1-2|project|googlecalendar';
  const missKey = 'no|0|none|none';
  const hitBefore = connectorSearchTallySnapshot()[hitKey] || 0;
  const missBefore = connectorSearchTallySnapshot()[missKey] || 0;
  recordConnectorSearch({ matches: 1, topFamily: 'project', topService: 'googlecalendar' });
  recordConnectorSearch({ matches: 0 });
  assert.equal(connectorSearchTallySnapshot()[hitKey], hitBefore + 1);
  assert.equal(connectorSearchTallySnapshot()[missKey], missBefore + 1);
});
