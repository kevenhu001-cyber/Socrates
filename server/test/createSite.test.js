import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCreateSite } from '../src/routes/chat/pipeline/executors/createSite.js';
import { createToolTurnPolicy } from '../src/services/tools/toolTurnPolicy.js';

test('create_site argument failures give the model a targeted correction', async () => {
  const events = [];
  const ctx = {
    emitter: { event: (type, payload) => events.push({ type, payload }) },
    req: { userId: 'user-1' },
    sessionIdFromQuery: null,
    projectIdFromBody: null,
    toolPolicy: createToolTurnPolicy(),
  };
  const call = { id: 'call-1', type: 'function', function: { name: 'create_site', arguments: '{}' } };

  const missingTitle = await executeCreateSite({ title: '', source: '<html></html>' }, call, ctx);
  assert.equal(missingTitle.result.errorCode, 'SITE_TITLE_REQUIRED');
  assert.match(missingTitle.result.correction, /non-empty title/);
  assert.equal(missingTitle.outcomeRecorded, true);

  const invalidSource = await executeCreateSite({ title: 'Notes', source: 'not html' }, call, ctx);
  assert.equal(invalidSource.result.errorCode, 'SITE_SOURCE_INVALID');
  assert.match(invalidSource.result.correction, /complete HTML document/);
});
