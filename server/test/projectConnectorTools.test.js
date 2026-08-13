import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_CONNECTOR_TOOL_NAMES,
  validateProjectConnectorToolArguments,
} from '../src/services/projectConnectorTools.js';

test('ProjectConnector tool argument validation rejects unknown fields', () => {
  const result = validateProjectConnectorToolArguments(
    PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH,
    { query: 'invoices', admin: true },
  );
  assert.equal(result.ok, false);
});

test('ProjectConnector tool argument validation enforces documented input shapes', () => {
  assert.deepEqual(
    validateProjectConnectorToolArguments(PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY, {}),
    { ok: true, args: {} },
  );
  assert.equal(
    validateProjectConnectorToolArguments(PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS, { date: '2026-08-13' }).ok,
    true,
  );
  assert.equal(
    validateProjectConnectorToolArguments(PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS, { date: '13/08/2026' }).ok,
    false,
  );
  assert.equal(
    validateProjectConnectorToolArguments(PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH, { query: '   ' }).ok,
    false,
  );
});
