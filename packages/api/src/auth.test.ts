import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient, readChatStream, ApiError } from './index.ts';
import { createMemoryStore } from '../../platform/src/index.ts';
const key = 'socrates.auth.tokens';
const old = { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: new Date(Date.now() + 600_000).toISOString() };
const rotated = { accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: old.expiresAt };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }

test('refresh 503 keeps credentials and does not signal auth loss', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); let lost = 0;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async () => json({}, 503), onAuthLost: () => lost++ });
  await assert.rejects(api.refresh(), (e: ApiError) => e.status === 503);
  assert.deepEqual(await api.readTokens(), old); assert.equal(lost, 0);
});
test('refresh credential rejection clears auth once for simultaneous callers', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); let lost = 0; let requests = 0;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async () => { requests++; return json({}, 401); }, onAuthLost: () => lost++ });
  assert.deepEqual(await Promise.all([api.refresh(), api.refresh()]), [false, false]);
  assert.equal(requests, 1); assert.equal(lost, 1); assert.deepEqual(await api.readTokens(), {});
});
test('delayed old-bearer 401 reuses rotation rather than rotating again', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); let rotations = 0; let oldCalls = 0;
  const delayed = deferred<Response>(); const secondStarted = deferred<void>();
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url, init) => {
    if (url.endsWith('/refresh')) { rotations++; return json(rotated); }
    if (new Headers(init?.headers).get('Authorization') === 'Bearer old-access') {
      if (++oldCalls === 2) { secondStarted.resolve(); return delayed.promise; }
      await secondStarted.promise; return json({}, 401);
    }
    return json({ projects: [] });
  } });
  const first = api.projects.list(); const second = api.projects.list();
  await first; delayed.resolve(json({}, 401)); await second;
  assert.equal(rotations, 1);
});
test('late refresh cannot resurrect a logged-out session', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); const started = deferred<void>(); const response = deferred<Response>();
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url) => {
    if (url.endsWith('/refresh')) { started.resolve(); return response.promise; } return json({});
  } });
  const refreshing = api.refresh(); await started.promise; await api.auth.logout(); response.resolve(json(rotated));
  assert.equal(await refreshing, false); assert.deepEqual(await api.readTokens(), {});
});
test('late refresh cannot replace a new login', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); const started = deferred<void>(); const response = deferred<Response>();
  const login = { ...rotated, accessToken: 'account-b', user: { id: 'b', email: 'b@test', displayName: 'B' } };
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url) => {
    if (url.endsWith('/refresh')) { started.resolve(); return response.promise; } return json(login);
  } });
  const refreshing = api.refresh(); await started.promise; await api.auth.login('b@test', 'password'); response.resolve(json(rotated));
  assert.equal(await refreshing, false); assert.equal((await api.readTokens()).accessToken, 'account-b');
});
test('login never proactively refreshes an expired prior session', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify({ ...old, expiresAt: '2000-01-01' }) }); const urls: string[] = [];
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url) => { urls.push(url); return json({ ...rotated, user: { id: 'b' } }); } });
  await api.auth.login('b@test', 'password'); assert.equal(urls.length, 1); assert.ok(urls[0].endsWith('/login'));
});
test('code login exchanges the emailed code for a stored token pair', async () => {
  const storage = createMemoryStore(); const urls: string[] = [];
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url, init) => {
    urls.push(url);
    if (url.endsWith('/auth/send-code')) return json({ ok: true });
    return json({ ...rotated, user: { id: 'c', email: 'c@test', displayName: 'C' } });
  } });
  await api.auth.sendCode('c@test');
  const user = await api.auth.loginWithCode('c@test', 'ABCDEFGH');
  assert.equal(user.id, 'c'); assert.equal((await api.readTokens()).accessToken, 'new-access');
  assert.ok(urls.some((u) => u.endsWith('/auth/send-code')) && urls.some((u) => u.endsWith('/mobile/login-with-code')));
});
test('register and forgot-password surface {ok} without touching tokens', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async () => json({ ok: true }) });
  assert.deepEqual(await api.auth.register('n@test', 'password123'), { ok: true });
  assert.deepEqual(await api.auth.resendVerification('n@test'), { ok: true });
  assert.deepEqual(await api.auth.forgotPassword('n@test'), { ok: true });
  assert.deepEqual(await api.readTokens(), old);
});
test('wrong old password never rotates or clears the live session', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); let lost = 0; let refreshes = 0;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url) => {
    if (url.endsWith('/refresh')) { refreshes++; return json(rotated); }
    return json({ message: 'Current password is incorrect' }, 401);
  }, onAuthLost: () => lost++ });
  await assert.rejects(api.auth.changePassword('wrong', 'new-password-1'), (e: ApiError) => e.status === 401);
  assert.equal(refreshes, 0); assert.equal(lost, 0); assert.deepEqual(await api.readTokens(), old);
});
test('stream 401 refreshes and retries once then dispatches done', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) }); let done = 0; let attempts = 0;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async (url) => {
    if (url.endsWith('/refresh')) return json(rotated);
    return ++attempts === 1 ? json({}, 401) : new Response('data: [DONE]\n\n');
  } });
  await api.chat.stream({ request: { messages: [] }, handlers: { onDone: () => done++ } }); assert.equal(done, 1); assert.equal(attempts, 2);
});
test('truncated SSE rejects and releases its reader', async () => {
  const response = new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'); let text = '';
  await assert.rejects(readChatStream(response, { onDelta: (t) => text += t }), /before the response finished/);
  assert.equal(text, 'partial'); assert.equal(response.body!.locked, false);
});
test('server stream errors do not become successful done', async () => {
  let done = 0;
  await assert.rejects(readChatStream(new Response('event: error\ndata: {"message":"provider failed"}\n\ndata: [DONE]\n\n'), { onDone: () => done++ }), /provider failed/);
  assert.equal(done, 0);
});
test('sessions.list follows nextCursor and remove accepts real 204', async () => {
  let calls = 0;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage: createMemoryStore(), fetch: async (url, init) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    calls++; return url.includes('cursor=') ? json({ sessions: [{ id: 'b' }], nextCursor: null }) : json({ sessions: [{ id: 'a' }], nextCursor: '2026-10-06' });
  } });
  assert.deepEqual((await api.sessions.list()).map((s) => s.id), ['a', 'b']); assert.equal(calls, 2); await api.projects.remove('p');
});

test('bearer rejected without a refresh credential signs out instead of keeping cached auth', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify({ accessToken: 'expired' }) }); let lost = 0;
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async () => json({}, 401), onAuthLost: () => lost++ });
  await assert.rejects(api.projects.list()); assert.equal(lost, 1); assert.deepEqual(await api.readTokens(), {});
});
test('network failure during refresh preserves the credential for retry', async () => {
  const storage = createMemoryStore({ [key]: JSON.stringify(old) });
  const api = createApiClient({ baseUrl: 'https://test/api/v2', storage, fetch: async () => { throw new Error('Offline'); } });
  await assert.rejects(api.refresh(), /Offline/); assert.deepEqual(await api.readTokens(), old);
});
