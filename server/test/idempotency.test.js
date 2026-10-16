// @ts-check
/**
 * Unit tests for the Idempotency-Key middleware.
 *
 * - 2xx JSON responses are replayed byte-identically on key reuse.
 * - 4xx responses are NOT cached (a retry after login / payload fix /
 *   rate-window reset must reach the handler, not a stale rejection).
 * - Callers sharing an IP but presenting different credentials never
 *   collide, even with the same Idempotency-Key string.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';

import { idempotencyMiddleware, resetIdempotencyStore, idempotencyEntryCount } from '../src/middleware/idempotency.ts';
import { usesDurableIdempotency } from '../src/lib/durableIdempotencyRoutes.ts';
import { EventEmitter } from 'node:events';
import { listen, httpRequest } from './_http.js';

function buildApp(counters) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(idempotencyMiddleware);
  app.post('/write', (req, res) => {
    counters.write += 1;
    res.json({ n: counters.write });
  });
  app.post('/flaky', (req, res) => {
    counters.flaky += 1;
    if (counters.flaky === 1) return res.status(401).json({ code: 'UNAUTH' });
    return res.json({ ok: true });
  });
  app.post('/slow', async (req, res) => {
    counters.write += 1;
    await new Promise((resolve) => setTimeout(resolve, 100));
    res.json({ n: counters.write });
  });
  app.post('/large', (req, res) => {
    counters.write += 1;
    res.json({ data: 'x'.repeat(300000) });
  });
  return app;
}

describe('idempotency', () => {
  let server;
  const counters = { write: 0, flaky: 0 };
  before(async () => { server = await listen(buildApp(counters)); });
  after(async () => { await server.close(); });
  beforeEach(() => {
    resetIdempotencyStore();
    counters.write = 0;
    counters.flaky = 0;
  });

  test('replays 2xx and runs the handler once', async () => {
    const opts = { method: 'POST', headers: { 'Idempotency-Key': 'k-1' }, body: {} };
    const first = await httpRequest(server.url + '/write', opts);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('idempotency-replayed'), null);
    const second = await httpRequest(server.url + '/write', opts);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('idempotency-replayed'), 'true');
    assert.deepEqual(second.body, first.body);
    assert.equal(counters.write, 1);
  });

  test('does not cache 4xx — retry reaches the handler', async () => {
    const opts = { method: 'POST', headers: { 'Idempotency-Key': 'k-2' }, body: {} };
    const first = await httpRequest(server.url + '/flaky', opts);
    assert.equal(first.status, 401);
    const second = await httpRequest(server.url + '/flaky', opts);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('idempotency-replayed'), null);
    assert.equal(counters.flaky, 2);
  });

  test('rejects a different request body for an already completed key', async () => {
    const opts = { method: 'POST', headers: { 'Idempotency-Key': 'body-conflict' } };
    await httpRequest(server.url + '/write', { ...opts, body: { value: 1 } });
    const conflict = await httpRequest(server.url + '/write', { ...opts, body: { value: 2 } });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(counters.write, 1);
  });

  test('concurrent retries execute once, then replay the completed response', async () => {
    const opts = { method: 'POST', headers: { 'Idempotency-Key': 'concurrent' }, body: { value: 1 } };
    const responses = await Promise.all(Array.from({ length: 8 }, () => httpRequest(server.url + '/slow', opts)));
    assert.equal(responses.filter((r) => r.status === 200).length, 1);
    assert.equal(responses.filter((r) => r.body.code === 'IDEMPOTENCY_IN_PROGRESS').length, 7);
    assert.equal(counters.write, 1);
    const replay = await httpRequest(server.url + '/slow', opts);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
  });

  test('fresh successful responses cannot grow the cache beyond its limit', () => {
    for (let i = 0; i < 5005; i++) {
      const res = Object.assign(new EventEmitter(), { statusCode: 200, json: (body) => body });
      const req = { method: 'POST', headers: { 'idempotency-key': `bounded-${i}` }, url: '/write', baseUrl: '', body: {}, ip: 'local' };
      idempotencyMiddleware(req, res, () => res.json({ i }));
    }
    assert.equal(idempotencyEntryCount(), 5000);
  });

  test('oversized responses are not retained and a retry cannot repeat the write', async () => {
    const opts = { method: 'POST', headers: { 'Idempotency-Key': 'large' }, body: {} };
    assert.equal((await httpRequest(server.url + '/large', opts)).status, 200);
    const retry = await httpRequest(server.url + '/large', opts);
    assert.equal(retry.status, 409);
    assert.equal(retry.body.code, 'IDEMPOTENCY_RESULT_UNAVAILABLE');
    assert.equal(counters.write, 1);
  });

  test('different credentials do not collide on the same key', async () => {
    const base = { method: 'POST', headers: { 'Idempotency-Key': 'shared' }, body: {} };
    await httpRequest(server.url + '/write', {
      ...base, headers: { ...base.headers, Authorization: 'Bearer user-A' },
    });
    const other = await httpRequest(server.url + '/write', {
      ...base, headers: { ...base.headers, Authorization: 'Bearer user-B' },
    });
    assert.equal(other.headers.get('idempotency-replayed'), null);
    assert.equal(counters.write, 2);
  });

  test('different sid cookies do not collide on the same key', async () => {
    const base = { method: 'POST', headers: { 'Idempotency-Key': 'shared-cookie' }, body: {} };
    await httpRequest(server.url + '/write', { ...base, cookies: { sid: 's1' } });
    const other = await httpRequest(server.url + '/write', { ...base, cookies: { sid: 's2' } });
    assert.equal(other.headers.get('idempotency-replayed'), null);
    assert.equal(counters.write, 2);
  });
});

describe('usesDurableIdempotency', () => {
  test('correctly identifies durable mutation routes', () => {
    assert.equal(usesDurableIdempotency('POST', '/projects'), true);
    assert.equal(usesDurableIdempotency('POST', '/prompts'), true);
    assert.equal(usesDurableIdempotency('POST', '/scheduled-tasks'), true);
    assert.equal(usesDurableIdempotency('POST', '/sessions/123e4567-e89b-12d3-a456-426614174000/archive'), true);
    assert.equal(usesDurableIdempotency('PUT', '/sessions/123e4567-e89b-12d3-a456-426614174000/tags'), true);
    assert.equal(usesDurableIdempotency('PATCH', '/users/me'), true);
    assert.equal(usesDurableIdempotency('PATCH', '/users/me/preferences'), true);
  });

  test('rejects non-durable routes and wrong methods', () => {
    assert.equal(usesDurableIdempotency('GET', '/users/me'), false);
    assert.equal(usesDurableIdempotency('GET', '/projects'), false);
    assert.equal(usesDurableIdempotency('DELETE', '/sessions/123/archive'), false);
    assert.equal(usesDurableIdempotency('POST', '/sessions'), false);
    assert.equal(usesDurableIdempotency('POST', '/other'), false);
  });
});
