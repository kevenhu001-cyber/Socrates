import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConnectorCatalog,
  createConnectorActivation,
  searchConnectorCatalog,
  splitInitialToolNames,
} from '../src/services/integrations/connectorCatalog.js';

const catalog = buildConnectorCatalog({
  connectorConnectionsByProvider: { github: {}, notion: {} },
  projectConnectorConnectionsByProvider: { googlecalendar: {}, gmail: {}, oc_jira: {} },
});

test('catalog includes only connected services and excludes arxiv', () => {
  const tools = catalog.entries.map((entry) => entry.tool);
  assert.ok(tools.includes('github_list_repos'));
  assert.ok(tools.includes('notion_search_pages'));
  assert.ok(tools.includes('oomol_google_calendar_list_events'));
  assert.ok(tools.includes('oomol_gmail_search_threads'));
  assert.ok(tools.some((tool) => tool.startsWith('oc_jira_')));
  assert.equal(tools.includes('arxiv_search'), false);
  assert.equal(tools.includes('zotero_search'), false);
  assert.ok(catalog.services.includes('googlecalendar'));
  assert.ok(catalog.services.includes('jira'));
});

test('search ranks the requested service and action first', () => {
  const calendar = searchConnectorCatalog(catalog, 'calendar events', 5);
  assert.ok(calendar.length > 0);
  assert.equal(calendar[0].service, 'googlecalendar');

  const email = searchConnectorCatalog(catalog, 'search my email', 5);
  assert.ok(email.some((match) => match.service === 'gmail'));

  const repos = searchConnectorCatalog(catalog, 'github repositories', 5);
  assert.ok(repos.some((match) => match.tool === 'github_list_repos'));

  const chinese = searchConnectorCatalog(catalog, '日历 会议', 5);
  assert.ok(chinese.some((match) => match.service === 'googlecalendar'));

  assert.deepEqual(searchConnectorCatalog(catalog, 'quantum chromodynamics', 5), []);
});

test('initial tool names exclude connector tools but keep discovery tools', () => {
  const initial = splitInitialToolNames(
    ['web_search', 'search_connectors', 'get_connector_spec', 'github_list_repos', 'oc_jira_get_issue'],
    catalog,
  );
  assert.deepEqual(initial, ['web_search', 'search_connectors', 'get_connector_spec']);
});

test('activation is per-turn and idempotent', () => {
  const activation = createConnectorActivation();
  assert.equal(activation.has('github_list_repos'), false);
  activation.activate('github_list_repos');
  activation.activate('github_list_repos');
  assert.equal(activation.has('github_list_repos'), true);
  assert.deepEqual(activation.active(), ['github_list_repos']);
});
