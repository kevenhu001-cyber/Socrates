import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError, createApiClient } from '../src/index.ts';
import { createMemoryStore } from '../../platform/src/index.ts';

function mockFetch(routes: Record<string, { status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('https://test/api/v2', '');
    const route = routes[`${init?.method || 'GET'} ${path}`] || routes[path];
    if (!route) throw new Error(`unexpected request ${init?.method || 'GET'} ${path}`);
    return new Response(JSON.stringify(route.body), { status: route.status });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

test('projects.list returns projects', async () => {
  const { fetch } = mockFetch({ '/projects': { status: 200, body: { projects: [{ id: 'p1', name: 'Math' }] } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const projects = await api.projects.list();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, 'Math');
});

test('projects.create sends POST and returns the project', async () => {
  const { fetch, calls } = mockFetch({ 'POST /projects': { status: 201, body: { id: 'p2', name: 'Physics' } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const project = await api.projects.create({ name: 'Physics' });
  assert.equal(project.id, 'p2');
  assert.equal(calls[0].init?.method, 'POST');
  assert.match((calls[0].init?.body as string) || '', /Physics/);
});

test('projects.update sends PATCH to the encoded id', async () => {
  const { fetch, calls } = mockFetch({ 'PATCH /projects/p%201': { status: 200, body: { id: 'p 1', name: 'Renamed' } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const project = await api.projects.update('p 1', { name: 'Renamed' });
  assert.equal(project.name, 'Renamed');
  assert.equal(calls[0].init?.method, 'PATCH');
});

test('projects.remove sends DELETE', async () => {
  const { fetch, calls } = mockFetch({ 'DELETE /projects/p1': { status: 200, body: null } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  await api.projects.remove('p1');
  assert.equal(calls[0].init?.method, 'DELETE');
});

test('sessions.patch moves a session to a project', async () => {
  const { fetch, calls } = mockFetch({ 'PATCH /sessions/s1': { status: 200, body: { id: 's1', projectId: 'p1' } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const updated = await api.sessions.patch('s1', { projectId: 'p1' });
  assert.equal(updated.projectId, 'p1');
  assert.equal(calls[0].init?.method, 'PATCH');
});

test('sessions.archive/unarchive hit the archive endpoints', async () => {
  const { fetch, calls } = mockFetch({
    'POST /sessions/s1/archive': { status: 200, body: { ok: true } },
    'DELETE /sessions/s1/archive': { status: 200, body: { ok: true } },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  await api.sessions.archive('s1');
  await api.sessions.unarchive('s1');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[1].init?.method, 'DELETE');
});

test('sessions.remove sends DELETE and tolerates the 204 empty body', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  }) as typeof globalThis.fetch;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  await api.sessions.remove('s1');
  assert.equal(calls[0].init?.method, 'DELETE');
  assert.match(calls[0].url, /\/sessions\/s1$/);
});

test('sessions.listArchived pages the archived filter', async () => {
  const { fetch, calls } = mockFetch({
    '/sessions?limit=50&archived=true': { status: 200, body: { sessions: [{ id: 'a1' }], nextCursor: null } },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const archived = await api.sessions.listArchived();
  assert.deepEqual(archived.map((s) => s.id), ['a1']);
  assert.match(calls[0].url, /archived=true/);
});

test('search.content posts the query and returns hits', async () => {
  const { fetch, calls } = mockFetch({
    'POST /search': { status: 200, body: { hits: [{ kind: 'session', id: 's1', sessionId: 's1', title: 'Math' }] } },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const result = await api.search.content({ q: 'math' });
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].sessionId, 's1');
  assert.equal(calls[0].init?.method, 'POST');
  assert.match((calls[0].init?.body as string) || '', /math/);
});

test('API errors surface as ApiError with status', async () => {
  const { fetch } = mockFetch({ '/projects': { status: 401, body: { message: 'Unauthorized' } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  await assert.rejects(() => api.projects.list(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal((error as ApiError).status, 401);
    return true;
  });
});
