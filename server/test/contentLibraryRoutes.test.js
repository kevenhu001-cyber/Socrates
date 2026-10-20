// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appRouteFixture } from './_appRouteFixture.js';
import { artifacts, memories, projects, sessions } from '../src/db/schema/index.js';

const f = appRouteFixture();
const json = (method, body, as = f.owner) => f.request('/api/artifacts', { method, body, as });
const artifactUrl = (id, suffix = '') => `/api/artifacts/${id}${suffix}`;
const memoryUrl = (id, suffix = '') => `/api/memory/${id}${suffix}`;
const creationUrl = (suffix = '') => `/api/creations${suffix}`;

test('artifact creation validates required fields and persists defaults', async () => {
  assert.equal((await json('POST', { source: 'x' })).status, 400);
  assert.equal((await json('POST', { type: 'note' })).status, 400);
  const response = await json('POST', { type: 'note', source: 'hello' });
  assert.equal(response.status, 201);
  assert.equal(response.body.title, '');
  assert.equal(response.body.version, 1);
  assert.equal(response.body.userId, f.owner.id);
  assert.equal((await f.request(artifactUrl(response.body.id))).body.source, 'hello');
});

test('artifact list is authenticated and scoped to owner', async () => {
  const a = await json('POST', { type: 'note', source: 'mine' });
  const b = await f.request('/api/artifacts', { method: 'POST', as: f.other, body: { type: 'note', source: 'theirs' } });
  assert.equal((await f.request('/api/artifacts', { as: null })).status, 401);
  const list = await f.request('/api/artifacts');
  assert.ok(list.body.artifacts.some((x) => x.id === a.body.id));
  assert.ok(!list.body.artifacts.some((x) => x.id === b.body.id));
});

test('artifact detail, patch version history and deletion enforce ownership', async () => {
  const { body: a } = await json('POST', { type: 'note', source: 'v1' });
  assert.equal((await f.request(artifactUrl(a.id), { as: f.other })).status, 404);
  const updated = await f.request(artifactUrl(a.id), { method: 'PATCH', body: { title: 'renamed', source: 'v2' } });
  assert.equal(updated.body.version, 2);
  assert.equal(updated.body.title, 'renamed');
  const versions = await f.request(artifactUrl(a.id, '/versions'));
  assert.equal(versions.body.versions.length, 1);
  assert.equal(versions.body.versions[0].source, 'v2');
  assert.equal((await f.request(artifactUrl(a.id, '/versions'), { as: f.other })).status, 404);
  assert.equal((await f.request(artifactUrl(a.id), { method: 'DELETE', as: f.other })).status, 204);
  assert.equal((await f.request(artifactUrl(a.id))).status, 200);
  assert.equal((await f.request(artifactUrl(a.id), { method: 'DELETE' })).status, 204);
  assert.equal((await f.request(artifactUrl(a.id))).status, 404);
});

test('artifact source patch increments version; title-only patch does not', async () => {
  const { body: a } = await json('POST', { type: 'note', source: 'initial' });
  assert.equal((await f.request(artifactUrl(a.id), { method: 'PATCH', body: { title: 'only title' } })).body.version, 1);
  assert.equal((await f.request(artifactUrl(a.id), { method: 'PATCH', body: { source: 'changed' } })).body.version, 2);
  assert.equal((await f.request(artifactUrl(a.id, '/versions'))).body.versions.length, 1);
});

test('artifact share normalizes visibility and owner can revoke share', async () => {
  const { body: a } = await json('POST', { type: 'note', source: 'share me' });
  assert.equal((await f.request(artifactUrl(a.id, '/share'), { method: 'POST', as: f.other, body: { visibility: 'public' } })).status, 404);
  const shared = await f.request(artifactUrl(a.id, '/share'), { method: 'POST', body: { visibility: 'nonsense' } });
  assert.equal(shared.status, 201);
  assert.equal(shared.body.visibility, 'unlisted');
  assert.ok(shared.body.token);
  assert.equal((await f.request(artifactUrl(a.id, '/share'), { method: 'DELETE' })).status, 204);
  assert.equal((await f.request(artifactUrl(a.id))).body.shareToken, null);
});

test('memory creation validates text, sets defaults and isolates authenticated lists', async () => {
  assert.equal((await f.request('/api/memory', { method: 'POST', body: {} })).status, 400);
  const mine = await f.request('/api/memory', { method: 'POST', body: { text: 'remember this' } });
  const theirs = await f.request('/api/memory', { method: 'POST', as: f.other, body: { text: 'other user' } });
  assert.equal(mine.status, 201);
  assert.equal(mine.body.scope, 'global');
  assert.equal(mine.body.source, 'user');
  assert.equal((await f.request('/api/memory', { as: null })).status, 401);
  const list = await f.request('/api/memory');
  assert.ok(list.body.memories.some((x) => x.id === mine.body.id));
  assert.ok(!list.body.memories.some((x) => x.id === theirs.body.id));
});

test('disabled memories are hidden by default and visible on request; enable/disable works', async () => {
  const made = await f.request('/api/memory', { method: 'POST', body: { text: 'toggle' } });
  const id = made.body.id;
  assert.equal((await f.request(memoryUrl(id, '/disable'), { method: 'POST' })).body.ok, true);
  assert.ok(!(await f.request('/api/memory')).body.memories.some((m) => m.id === id));
  assert.ok((await f.request('/api/memory?includeDisabled=true')).body.memories.some((m) => m.id === id));
  assert.equal((await f.request(memoryUrl(id, '/enable'), { method: 'POST' })).body.ok, true);
  assert.ok((await f.request('/api/memory')).body.memories.some((m) => m.id === id));
});

test('memory patch and delete reject malformed IDs and conceal other users records', async () => {
  assert.equal((await f.request(memoryUrl('not-a-uuid'), { method: 'PATCH', body: { text: 'x' } })).status, 404);
  assert.equal((await f.request(memoryUrl('not-a-uuid'), { method: 'DELETE' })).status, 404);
  const mine = await f.request('/api/memory', { method: 'POST', body: { text: 'owned' } });
  assert.equal((await f.request(memoryUrl(mine.body.id), { method: 'PATCH', as: f.other, body: { text: 'stolen' } })).status, 404);
  assert.equal((await f.request(memoryUrl(mine.body.id), { method: 'DELETE', as: f.other })).status, 204);
  assert.equal((await f.request(memoryUrl(mine.body.id), { method: 'PATCH', body: { enabled: false, text: 'updated' } })).body.text, 'updated');
  assert.equal((await f.request(memoryUrl(mine.body.id), { method: 'DELETE' })).status, 204);
});

test('creation assistant CRUD validates JSON and instructions, tracks changed source versions', async () => {
  const path = creationUrl('/items/assistants');
  assert.equal((await f.request(path, { method: 'POST', body: { title: 'bad', source: '{' } })).status, 400);
  assert.equal((await f.request(path, { method: 'POST', body: { title: 'bad', source: '{}' } })).status, 400);
  const created = await f.request(path, { method: 'POST', body: { title: 'Helper', source: '{"instructions":"Be helpful"}' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.type, 'assistant');
  assert.equal(created.body.version, 1);
  const unchanged = await f.request(`${path}/${created.body.id}`, { method: 'PATCH', body: { title: 'Renamed' } });
  assert.equal(unchanged.body.version, 1);
  const changed = await f.request(`${path}/${created.body.id}`, { method: 'PATCH', body: { source: '{"instructions":"Be concise"}' } });
  assert.equal(changed.body.version, 2);
  assert.equal((await f.request(`${path}/${created.body.id}`, { method: 'PATCH', as: f.other, body: { title: 'intrude' } })).status, 404);
  assert.ok((await f.request(path)).body.items.some((x) => x.id === created.body.id));
  assert.ok(!(await f.request(path, { as: f.other })).body.items.some((x) => x.id === created.body.id));
  assert.equal((await f.request(`${path}/${created.body.id}`, { method: 'DELETE', as: f.other })).status, 204);
  assert.equal((await f.request(`${path}/${created.body.id}`, { method: 'DELETE' })).status, 204);
});

test('creation sites support private local CRUD and reject invalid types and empty fields', async () => {
  const sites = creationUrl('/items/sites');
  assert.equal((await f.request(creationUrl('/items/unknown'))).status, 404);
  assert.equal((await f.request(sites, { method: 'POST', body: { title: ' ', source: '<html></html>' } })).status, 400);
  const site = await f.request(sites, { method: 'POST', body: { title: 'Local draft', source: '<html><body>draft</body></html>' } });
  assert.equal(site.status, 201);
  assert.equal(site.body.type, 'site');
  assert.equal(site.body.language, 'html');
  assert.equal((await f.request(`${sites}/${site.body.id}`, { method: 'PATCH', as: f.other, body: { title: 'other' } })).status, 404);
  assert.equal((await f.request(`${sites}/${site.body.id}`, { method: 'DELETE' })).status, 204);
});

test('artifact session/project filters and cursors isolate a complete two-page result', async () => {
  const [project] = await f.db.insert(projects).values({ userId: f.owner.id, name: 'Artifact filter' }).returning();
  const [session] = await f.db.insert(sessions).values({ userId: f.owner.id, title: 'Artifact filter' }).returning();
  const rows = await f.db.insert(artifacts).values([
    { userId: f.owner.id, projectId: project.id, sessionId: session.id, type: 'note', source: 'newest', updatedAt: new Date('2026-01-02T00:00:00Z') },
    { userId: f.owner.id, projectId: project.id, sessionId: session.id, type: 'note', source: 'older', updatedAt: new Date('2026-01-01T00:00:00Z') },
    { userId: f.other.id, type: 'note', source: 'not mine' },
  ]).returning();
  const filter = `/api/artifacts?projectId=${project.id}&sessionId=${session.id}&limit=1`;
  const first = await f.request(filter);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.artifacts.map((a) => a.id), [rows[0].id]);
  assert.ok(first.body.nextCursor);
  const next = await f.request(`${filter}&cursor=${encodeURIComponent(first.body.nextCursor)}`);
  assert.equal(next.status, 200);
  assert.deepEqual(next.body.artifacts.map((a) => a.id), [rows[1].id]);
  assert.equal(next.body.nextCursor, null);
  const foreign = await f.request(filter, { as: f.other });
  assert.deepEqual(foreign.body.artifacts, []);
});

test('memory pagination and activation guards do not leak or modify other user records', async () => {
  const rows = await f.db.insert(memories).values([
    { userId: f.owner.id, text: 'newest', createdAt: new Date('2099-01-02T00:00:00Z') },
    { userId: f.owner.id, text: 'older', createdAt: new Date('2099-01-01T00:00:00Z') },
  ]).returning();
  const first = await f.request('/api/memory?limit=1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.memories.map((m) => m.id), [rows[0].id]);
  const next = await f.request(`/api/memory?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`);
  assert.deepEqual(next.body.memories.map((m) => m.id), [rows[1].id]);
  for (const action of ['enable', 'disable']) {
    assert.equal((await f.request(memoryUrl('invalid', `/${action}`), { method: 'POST' })).status, 404);
    assert.equal((await f.request(memoryUrl(rows[0].id, `/${action}`), { method: 'POST', as: f.other })).status, 404);
  }
  assert.equal((await f.request(memoryUrl(rows[0].id), { method: 'PATCH', body: { enabled: false } })).status, 200);
  assert.equal((await f.request(memoryUrl(rows[0].id), { method: 'PATCH', body: { text: 'renamed' } })).body.enabled, false);
});

test('assistant updates reject malformed or empty sources without changing the saved version', async () => {
  const path = '/api/creations/items/assistants';
  const created = await f.request(path, { method: 'POST', body: { title: 'Validated assistant', source: '{"instructions":"preserve me"}' } });
  assert.equal(created.status, 201);
  for (const source of ['{', '{}', 'null', '7', '{"instructions":7}', '']) {
    const invalid = await f.request(`${path}/${created.body.id}`, { method: 'PATCH', body: { source } });
    assert.equal(invalid.status, 400, source);
  }
  assert.equal((await f.request(`${path}/${created.body.id}`, { method: 'PATCH', body: { title: '  ' } })).status, 400);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const invalidPath = `/api/creations/items/unknown${method === 'POST' ? '' : `/${created.body.id}`}`;
    assert.equal((await f.request(invalidPath, { method, body: {} })).status, 404);
  }
  const saved = await f.request(path);
  const item = saved.body.items.find((a) => a.id === created.body.id);
  assert.equal(item.version, 1);
  assert.equal(item.source, '{"instructions":"preserve me"}');
});
