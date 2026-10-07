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

test('account.usage returns profile and counters', async () => {
  const { fetch, calls } = mockFetch({
    '/account/usage': { status: 200, body: { user: { id: 'u1', email: 't@e.c', displayName: 'T' }, usage: { sessionCount: 3, providerCount: 1, graphNodes: 0, beagleUsed: 10, beagleLimit: 100 } } },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const result = await api.account.usage();
  assert.equal(result.user.email, 't@e.c');
  assert.equal(result.usage.sessionCount, 3);
  assert.match(calls[0].url, /\/account\/usage$/);
});

test('files.extract posts multipart and returns text; failures surface', async () => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const okFetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ ok: true, text: 'parsed', truncated: false, kind: 'pdf' }), { status: 200 });
  }) as typeof globalThis.fetch;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch: okFetch, storage: createMemoryStore() });
  const form = new FormData();
  form.append('file', new Blob(['%PDF']), 'notes.pdf');
  const result = await api.files.extract(form);
  assert.equal(result.text, 'parsed');
  assert.match(seen[0].url, /\/files\/extract$/);
  assert.ok(seen[0].init?.body instanceof FormData);
  const badFetch = (async () => new Response(JSON.stringify({ ok: false, error: 'Could not parse pdf: boom' }), { status: 200 })) as typeof globalThis.fetch;
  const badApi = createApiClient({ baseUrl: 'https://test/api/v2', fetch: badFetch, storage: createMemoryStore() });
  await assert.rejects(() => badApi.files.extract(new FormData()), /Could not parse pdf/);
});

test('providers list, activate, create and remove hit /api-key', async () => {
  const { fetch, calls } = mockFetch({
    '/api-key': { status: 200, body: { providers: [{ id: 'k1', label: 'Beagle', url: 'https://x', model: 'm', isActive: true, isBuiltIn: true, hasKey: true }] } },
    'POST /api-key': { status: 201, body: { id: 'k2', label: 'Custom', url: 'https://y', model: 'n', isActive: true } },
    'PATCH /api-key/k1': { status: 200, body: { id: 'k1', isActive: true } },
    'DELETE /api-key/k2': { status: 200, body: null },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const providers = await api.providers.list();
  assert.equal(providers.length, 1);
  assert.equal(providers[0].hasKey, true);
  const created = await api.providers.create({ url: 'https://y', model: 'n', key: 'secret-key' });
  assert.equal(created.id, 'k2');
  const activated = await api.providers.patch('k1', { isActive: true });
  assert.equal(activated.isActive, true);
  await api.providers.remove('k2');
  assert.deepEqual(calls.map((c) => c.init?.method || 'GET'), ['GET', 'POST', 'PATCH', 'DELETE']);
});

test('files.list/preview/remove/fetchRaw cover the file library surface', async () => {
  const { fetch, calls } = mockFetch({
    'GET /files?limit=50': { status: 200, body: { files: [{ id: 'f1', name: 'a.txt', mimeType: 'text/plain', size: 3, kind: 'text' }], nextCursor: null } },
    'GET /files/f1/content': { status: 200, body: { ok: true, id: 'f1', name: 'a.txt', mimeType: 'text/plain', kind: 'text', text: 'abc', truncated: false } },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const page = await api.files.list();
  assert.deepEqual(page.files.map((f) => f.id), ['f1']);
  const preview = await api.files.preview('f1');
  assert.equal(preview.text, 'abc');
  assert.match(calls[0].url, /\/files\?limit=50$/);
  assert.match(calls[1].url, /\/files\/f1\/content$/);

  const removes: string[] = [];
  const removeFetch = (async (url: string, init?: RequestInit) => {
    removes.push(`${init?.method || 'GET'} ${url}`);
    return new Response(null, { status: 204 });
  }) as typeof globalThis.fetch;
  const deleteApi = createApiClient({ baseUrl: 'https://test/api/v2', fetch: removeFetch, storage: createMemoryStore() });
  await deleteApi.files.remove('f1');
  assert.match(removes[0], /DELETE .*\/files\/f1$/);
  assert.equal(deleteApi.files.rawUrl('f 1'), 'https://test/api/v2/files/f%201/raw');
});

test('files.fetchRaw returns the authenticated raw response', async () => {
  const raw = new Uint8Array([137, 80, 78, 71]);
  const bytesFetch = (async (url: string, init?: RequestInit) => {
    assert.match(url, /\/files\/f1\/raw$/);
    assert.equal(init?.method || 'GET', 'GET');
    return new Response(raw, { status: 200, headers: { 'Content-Type': 'image/png' } });
  }) as typeof globalThis.fetch;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch: bytesFetch, storage: createMemoryStore() });
  const response = await api.files.fetchRaw('f1');
  assert.equal(response.ok, true);
  assert.equal((await response.arrayBuffer()).byteLength, 4);
});

test('messages.patch rewrites a turn without regenerating server-side', async () => {
  const { fetch, calls } = mockFetch({ 'PATCH /messages/m1?sessionId=s1': { status: 200, body: { ok: true } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const result = await api.messages.patch('m1', { content: 'revised', discardFollowing: true }, 's1');
  assert.equal(result.ok, true);
  assert.equal(calls[0].init?.method, 'PATCH');
  const body = JSON.parse((calls[0].init?.body as string) || '{}');
  assert.equal(body.content, 'revised');
  assert.equal(body.regenerate, false);
  assert.equal(body.discardFollowing, true);
});

test('messages.remove deletes one explicit row, session-scoped', async () => {
  const removes: string[] = [];
  const removeFetch = (async (url: string, init?: RequestInit) => {
    removes.push(`${init?.method || 'GET'} ${url}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof globalThis.fetch;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch: removeFetch, storage: createMemoryStore() });
  await api.messages.remove('m1', 's1');
  assert.match(removes[0], /DELETE .*\/messages\/m1\?sessionId=s1$/);
});

test('assistants list/create/update/remove hit /creations/items/assistants', async () => {
  const { fetch, calls } = mockFetch({
    '/creations/items/assistants': { status: 200, body: { items: [{ id: 'a1', title: 'Tutor', source: '{"instructions":"Be kind"}' }] } },
    'POST /creations/items/assistants': { status: 201, body: { id: 'a2', title: 'Coach', source: '{}' } },
    'PATCH /creations/items/assistants/a2': { status: 200, body: { id: 'a2', title: 'Renamed', source: '{}' } },
    'DELETE /creations/items/assistants/a2': { status: 200, body: null },
  });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const items = await api.assistants.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Tutor');
  const created = await api.assistants.create({ title: 'Coach', source: '{}' });
  assert.equal(created.id, 'a2');
  const updated = await api.assistants.update('a2', { title: 'Renamed' });
  assert.equal(updated.title, 'Renamed');
  await api.assistants.remove('a2');
  assert.deepEqual(calls.map((c) => c.init?.method || 'GET'), ['GET', 'POST', 'PATCH', 'DELETE']);
  assert.match((calls[1].init?.body as string) || '', /Coach/);
});

test('sessions.patch binds an assistant to the session', async () => {
  const { fetch, calls } = mockFetch({ 'PATCH /sessions/s1': { status: 200, body: { id: 's1', assistantId: 'a1' } } });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', fetch, storage: createMemoryStore() });
  const updated = await api.sessions.patch('s1', { assistantId: 'a1' });
  assert.equal(updated.assistantId, 'a1');
  assert.equal(JSON.parse((calls[0].init?.body as string) || '{}').assistantId, 'a1');
  await api.sessions.patch('s1', { assistantId: null });
  assert.equal(JSON.parse((calls[1].init?.body as string) || '{}').assistantId, null);
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
