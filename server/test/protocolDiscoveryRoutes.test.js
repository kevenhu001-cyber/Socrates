// @ts-check
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { appRouteFixture } from './_appRouteFixture.js';
import { plugins } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';

const f = appRouteFixture();

async function mcpRequest(path, options) {
  const response = await f.request(path, options);
  // Streamable HTTP returns finite SSE envelopes for JSON-RPC responses.
  // Decode the actual wire format rather than assuming plain JSON.
  if (!response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = response.text.split(/\r?\n/).filter((line) => line.startsWith('data: '));
    const envelopes = data.map((line) => JSON.parse(line.slice(6)));
    response.body = envelopes.find((envelope) => envelope.id === options.body?.id);
    assert.ok(response.body, 'SSE response must include this JSON-RPC request id');
  }
  return response;
}

async function initialize(path) {
  const init = await mcpRequest(path, { method: 'POST', as: null,
    headers: { Accept: 'application/json, text/event-stream' }, body: {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'route-test', version: '1' } },
    } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-03-26');
  const session = init.headers.get('mcp-session-id');
  assert.ok(session);
  const ack = await f.request(path, { method: 'POST', as: null, headers: { 'Mcp-Session-Id': session, Accept: 'application/json, text/event-stream' }, body: {
    jsonrpc: '2.0', method: 'notifications/initialized', params: {},
  } });
  assert.equal(ack.status, 202);
  return session;
}

async function rpc(path, session, id, method, params = {}) {
  return mcpRequest(path, { method: 'POST', as: null,
    headers: { 'Mcp-Session-Id': session, Accept: 'application/json, text/event-stream' }, body: { jsonrpc: '2.0', id, method, params } });
}

test('product MCP initializes, lists schemas and tools, and reports JSON-RPC errors', async () => {
  const path = '/api/mcp';
  const noSession = await f.request(path, { method: 'POST', as: null, body: { jsonrpc: '2.0', id: 9, method: 'tools/list' } });
  assert.equal(noSession.status, 400);
  assert.equal(noSession.body.error.code, -32000);
  const session = await initialize(path);
  const listed = await rpc(path, session, 2, 'tools/list');
  assert.equal(listed.status, 200);
  const tools = listed.body.result.tools;
  assert.deepEqual(tools.map(t => t.name).sort(), [
    'socrates.bootstrap', 'socrates.config', 'socrates.docs', 'socrates.health', 'socrates.openapi_url', 'socrates.research_index',
  ].sort());
  const docs = tools.find(t => t.name === 'socrates.docs');
  assert.equal(docs.inputSchema.properties.kind.enum.join(','), 'page,article,tool');
  const outputs = new Map();
  for (const [index, tool] of tools.entries()) {
    const called = await rpc(path, session, index + 10, 'tools/call', { name: tool.name, arguments: {} });
    assert.equal(called.status, 200);
    assert.notEqual(called.body.result.isError, true, tool.name);
    outputs.set(tool.name, JSON.parse(called.body.result.content[0].text));
  }
  assert.equal(outputs.get('socrates.health').db, 'connected');
  assert.equal(outputs.get('socrates.health').ok, true);
  assert.equal(typeof outputs.get('socrates.config').hasBeagleKey, 'boolean');
  assert.equal(typeof outputs.get('socrates.config').isReasoning, 'boolean');
  assert.match(outputs.get('socrates.openapi_url').url, /\/openapi\.json$/);
  assert.equal(outputs.get('socrates.research_index').items.length, 6);
  assert.ok(outputs.get('socrates.docs').items.some((item) => item.kind === 'page'));
  const filtered = await rpc(path, session, 20, 'tools/call', { name: 'socrates.docs', arguments: { kind: 'tool' } });
  const filteredItems = JSON.parse(filtered.body.result.content[0].text).items;
  assert.ok(filteredItems.length > 0);
  assert.ok(filteredItems.every((item) => item.kind === 'tool'));
  const resources = await rpc(path, session, 3, 'resources/list');
  assert.equal(resources.status, 200);
  assert.equal(resources.body.error.code, -32601, 'unadvertised resource capability must not silently succeed');

  const invalid = await rpc(path, session, 4, 'tools/call', { name: 'socrates.docs', arguments: { kind: 'invalid-kind' } });
  assert.equal(invalid.status, 200);
  assert.equal(invalid.body.result.isError, true);
  assert.match(invalid.body.result.content[0].text, /Invalid arguments/);
  const missing = await rpc(path, session, 5, 'unknown/method');
  assert.equal(missing.status, 200);
  assert.equal(missing.body.error.code, -32601);
  const invalidRequest = await f.request(path, { method: 'POST', as: null, headers: { 'Mcp-Session-Id': session, Accept: 'application/json, text/event-stream' }, body: { jsonrpc: '1.0', method: 'tools/list' } });
  assert.equal(invalidRequest.status, 400);
  await f.request(path, { method: 'DELETE', as: null, headers: { 'Mcp-Session-Id': session, Accept: 'application/json, text/event-stream' } });
});

test('docs MCP exposes documentation tools, schemas and local search', async () => {
  const path = '/api/mcp/docs';
  const session = await initialize(path);
  const listed = await rpc(path, session, 2, 'tools/list');
  assert.equal(listed.status, 200);
  const tools = listed.body.result.tools;
  assert.deepEqual(tools.map(t => t.name).sort(), ['socrates_docs.auth_reference', 'socrates_docs.list', 'socrates_docs.search'].sort());
  const schema = tools.find(t => t.name === 'socrates_docs.search').inputSchema;
  assert.equal(schema.properties.query.minLength, 1);
  assert.equal(schema.properties.query.maxLength, 200);
  const search = await rpc(path, session, 3, 'tools/call', { name: 'socrates_docs.search', arguments: { query: 'authentication' } });
  assert.equal(search.body.result.isError, undefined);
  assert.match(search.body.result.content[0].text, /Authentication reference/);
  const badInput = await rpc(path, session, 4, 'tools/call', { name: 'socrates_docs.search', arguments: { query: '' } });
  assert.equal(badInput.body.result.isError, true);
  assert.match(badInput.body.result.content[0].text, /Invalid arguments/);
  const listedDocs = await rpc(path, session, 5, 'tools/call', { name: 'socrates_docs.list', arguments: {} });
  assert.match(listedDocs.body.result.content[0].text, /SKILL\.md/);
  const auth = await rpc(path, session, 6, 'tools/call', { name: 'socrates_docs.auth_reference', arguments: {} });
  assert.match(auth.body.result.content[0].text, /OAuth 2\.0/);
  const unmatched = await rpc(path, session, 7, 'tools/call', { name: 'socrates_docs.search', arguments: { query: 'uniquelynonmatchingkeyword' } });
  assert.deepEqual(JSON.parse(unmatched.body.result.content[0].text).results, []);
  const all = await rpc(path, session, 8, 'tools/call', { name: 'socrates_docs.search', arguments: { query: 'a' } });
  assert.ok(JSON.parse(all.body.result.content[0].text).results.length > 1);
  await f.request(path, { method: 'DELETE', as: null, headers: { 'Mcp-Session-Id': session, Accept: 'application/json, text/event-stream' } });
});

test('MCP read and close operations require a known session on both public surfaces', async () => {
  for (const path of ['/api/mcp', '/api/mcp/docs']) {
    for (const method of ['GET', 'DELETE']) {
      const response = await f.request(path, { method, as: null, headers: { 'Mcp-Session-Id': 'unknown-test-session' } });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, -32000);
    }
  }
});

test('NLWeb search, stopword-only input, and streaming remain local', async () => {
  const result = await f.request('/api/nlweb/ask?query=socrates+mcp', { as: null });
  assert.equal(result.status, 200);
  assert.equal(result.body._meta.response_type, 'search_response');
  assert.ok(result.body.items.some(item => item['@type'] === 'Service'));
  const empty = await f.request('/api/nlweb/ask', { method: 'POST', as: null, body: { query: 'the is of' } });
  assert.equal(empty.body.items.length, 0);
  const stream = await f.request('/api/nlweb/stream', { method: 'POST', as: null, body: { query: 'openapi' } });
  assert.equal(stream.status, 200);
  assert.match(stream.text, /event: start/);
  assert.match(stream.text, /event: result/);
  assert.match(stream.text, /event: complete/);
});

test('plugin CRUD is scoped to the owner and rejects unauthenticated access', async () => {
  const unauthorized = await f.request('/api/plugins', { as: null });
  assert.equal(unauthorized.status, 401);
  const missingName = await f.request('/api/plugins', { method: 'POST', body: { type: 'extension' } });
  assert.equal(missingName.status, 400);
  const name = `route-test-${randomUUID()}`;
  const created = await f.request('/api/plugins', { method: 'POST', body: { name, description: 'test-only', config: { marker: 'owned' } } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.userId, f.owner.id);
  const ownerList = await f.request('/api/plugins');
  assert.ok(ownerList.body.plugins.some(p => p.id === id));
  const otherList = await f.request('/api/plugins', { as: f.other });
  assert.ok(!otherList.body.plugins.some(p => p.id === id));
  assert.equal((await f.request(`/api/plugins/${id}`, { as: f.other, method: 'PATCH', body: { name: 'forbidden' } })).status, 404);
  const updated = await f.request(`/api/plugins/${id}`, { method: 'PATCH', body: { isEnabled: false, config: { marker: 'updated' } } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.isEnabled, false);
  assert.deepEqual(updated.body.config, { marker: 'updated' });
  assert.equal((await f.request(`/api/plugins/${id}`, { as: f.other, method: 'DELETE' })).status, 204);
  assert.equal((await f.db.select().from(plugins).where(eq(plugins.id, id))).length, 1);
  assert.equal((await f.request(`/api/plugins/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await f.db.select().from(plugins).where(eq(plugins.id, id))).length, 0);
});
