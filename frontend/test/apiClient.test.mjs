import assert from 'node:assert/strict';
import test from 'node:test';

import { apiFetch, apiFetchRaw, installAuthHooks, retryApiFetch } from '../src/util/api.js';

async function withGlobals(overrides, fn) {
  const descriptors = new Map(Object.keys(overrides).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(overrides)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    return await fn();
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('JSON writes share the API prefix, credentials, body encoding, and CSRF header', async () => {
  let request;
  await withGlobals({
    document: { cookie: 'theme=dark; csrf=csrf-token' },
    fetch: async (path, options) => {
      request = { path, options };
      return jsonResponse({ saved: true });
    },
  }, async () => {
    assert.deepEqual(await apiFetch('/api/messages', {
      method: 'POST',
      body: { text: 'hello' },
      headers: { 'X-Trace': 'test' },
    }), { saved: true });
  });

  assert.equal(request.path, '/api/v2/messages');
  assert.equal(request.options.credentials, 'include');
  assert.equal(request.options.body, '{"text":"hello"}');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.equal(request.options.headers['X-CSRF-Token'], 'csrf-token');
  assert.equal(request.options.headers['X-Trace'], 'test');
});

test('JSON GETs bypass cached URLs and skip CSRF headers', async () => {
  let request;
  await withGlobals({
    document: { cookie: 'csrf=csrf-token' },
    fetch: async (path, options) => {
      request = { path, options };
      return jsonResponse({ rows: [] });
    },
  }, () => apiFetch('/api/sessions?limit=2'));

  assert.match(request.path, /^\/api\/v2\/sessions\?limit=2&cb=\d+$/);
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers['Cache-Control'], 'no-store');
  assert.equal(request.options.headers.Pragma, 'no-cache');
  assert.equal(request.options.headers['X-CSRF-Token'], undefined);
});

test('raw SSE keeps the caller abort linked after fetch resolves', async () => {
  const caller = new AbortController();
  let fetchSignal;
  await withGlobals({
    document: { cookie: 'csrf=csrf-token' },
    fetch: async (_path, options) => {
      fetchSignal = options.signal;
      const body = new ReadableStream({ start() {} });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  }, async () => {
    const response = await apiFetchRaw('/api/chat/stream', {
      method: 'POST', body: { messages: [] }, signal: caller.signal,
    });
    assert.equal(response.ok, true);
  });

  caller.abort();
  assert.equal(fetchSignal.aborted, true);
});

test('raw non-stream responses detach the caller abort listener after headers', async () => {
  const caller = new AbortController();
  let fetchSignal;
  await withGlobals({
    document: { cookie: '' },
    fetch: async (_path, options) => {
      fetchSignal = options.signal;
      return jsonResponse({ ok: true });
    },
  }, () => apiFetchRaw('/api/status', { signal: caller.signal }));

  caller.abort();
  assert.equal(fetchSignal.aborted, false);
});

test('raw stream requests refresh CSRF once before replay', async () => {
  const calls = [];
  await withGlobals({
    document: { cookie: 'csrf=stale' },
    fetch: async (path, options) => {
      calls.push({ path, options });
      if (path === '/api/v2/auth/csrf-token') return jsonResponse({ ok: true });
      if (calls.filter((call) => call.path === '/api/v2/chat/stream').length === 1) {
        return jsonResponse({ message: 'csrf rejected' }, 403);
      }
      return new Response('data: {"type":"done"}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  }, async () => {
    const response = await apiFetchRaw('/api/chat/stream', { method: 'POST', body: { messages: [] } });
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
  });

  assert.deepEqual(calls.map((call) => call.path), [
    '/api/v2/chat/stream', '/api/v2/auth/csrf-token', '/api/v2/chat/stream',
  ]);
  assert.equal(calls[2].options._csrfRetried, true);
});

test('403 refreshes CSRF and replays a mutating JSON request exactly once', async () => {
  const calls = [];
  await withGlobals({
    document: { cookie: 'csrf=stale' },
    fetch: async (path, options) => {
      calls.push({ path, options });
      if (path === '/api/v2/auth/csrf-token') return jsonResponse({ ok: true });
      if (calls.filter((call) => call.path === '/api/v2/items').length === 1) {
        return jsonResponse({ message: 'csrf rejected' }, 403);
      }
      return jsonResponse({ created: true });
    },
  }, async () => {
    assert.deepEqual(await apiFetch('/api/items', { method: 'POST', body: { id: 1 } }), { created: true });
  });

  assert.deepEqual(calls.map((call) => call.path), [
    '/api/v2/items', '/api/v2/auth/csrf-token', '/api/v2/items',
  ]);
  assert.equal(calls[2].options._csrfRetried, true);
});

test('401 responses notify the auth hook and keep the API error shape', async () => {
  const notices = [];
  installAuthHooks({ on401: (reason) => notices.push(reason), isInGraceWindow: () => false });
  await withGlobals({
    document: { cookie: '' },
    fetch: async () => jsonResponse({ code: 'AUTH_REQUIRED', message: 'Sign in again' }, 401),
  }, async () => {
    await assert.rejects(apiFetch('/api/private', { _authEndpoint: false }), (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.code, 'AUTH_REQUIRED');
      assert.equal(error.message, 'Sign in again');
      assert.equal(error.isApiError, true);
      return true;
    });
  });
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^apiFetch:GET \/api\/v2\/private\?cb=/);
});

test('retryApiFetch applies the configured retry count and exposes the final attempt count', async () => {
  let calls = 0;
  await withGlobals({
    document: { cookie: '' },
    fetch: async () => {
      calls += 1;
      return jsonResponse({ message: 'temporarily unavailable' }, 503);
    },
  }, async () => {
    await assert.rejects(
      retryApiFetch('/api/retry', { method: 'POST' }, { retries: 1, backoffMs: 0 }),
      (error) => error.status === 503 && error.retried === 1,
    );
  });
  assert.equal(calls, 2);
});
