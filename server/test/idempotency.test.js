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

import { idempotencyMiddleware, resetIdempotencyStore } from '../src/middleware/idempotency.ts';
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
