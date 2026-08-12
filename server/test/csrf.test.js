// @ts-check
/**
 * Unit tests for the CSRF double-submit middleware.
 *
 * The middleware rejects state-changing requests (POST, PUT, PATCH,
 * DELETE) when the X-CSRF-Token header doesn't match the csrf
 * cookie. Safe methods (GET, HEAD, OPTIONS) always pass through.
 *
 * We mount the middleware on a minimal Express app and use Node's
 * built-in fetch (Node 20+) to drive requests — keeps the test
 * suite dependency-free.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';

import { csrfProtection, setCsrfCookie, clearCsrfCookie } from '../src/middleware/csrf.ts';
import { errorHandler } from '../src/middleware/error.js';
import { listen, httpRequest } from './_http.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection);
  app.post('/write', (req, res) => res.json({ ok: true }));
  app.get('/read', (req, res) => res.json({ ok: true }));
  app.get('/api/auth/csrf-token', (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('csrf: safe methods', () => {
  let server;
  before(async () => { server = await listen(buildApp()); });
  after(async () => { await server.close(); });

  test('GET passes through with no cookies', async () => {
    const r = await httpRequest(server.url + '/read');
    assert.equal(r.status, 200);
  });
});

describe('csrf: unsafe methods without an authenticated session', () => {
  let server;
  before(async () => { server = await listen(buildApp()); });
  after(async () => { await server.close(); });

  test('POST with no sid cookie and no csrf pair passes through', async () => {
    // Unauthenticated requests: let the route's own auth middleware
    // reject them. The CSRF check is a no-op here.
    const r = await httpRequest(server.url + '/write', { method: 'POST', body: {} });
    assert.equal(r.status, 200);
  });
});

describe('csrf: unsafe methods with an authenticated session', () => {
  let server;
  before(async () => { server = await listen(buildApp()); });
  after(async () => { await server.close(); });

  test('POST with sid cookie + matching csrf pair is allowed', async () => {
    const r = await httpRequest(server.url + '/write', {
      method: 'POST',
      cookies: { sid: 'session-token-abc', csrf: 'token-xyz' },
      headers: { 'X-CSRF-Token': 'token-xyz' },
      body: {},
    });
    assert.equal(r.status, 200);
  });

  test('POST with sid cookie but missing csrf header is rejected as partial pair', async () => {
    // The CSRF middleware rejects partial token pairs — a csrf cookie
    // without a matching X-CSRF-Token header is anomalous (cookie-only).
    // An attacker who injects a csrf cookie via Set-Cookie cannot also
    // supply the header from a cross-origin request, so the 403 is the
    // correct defensive response.
    const r = await httpRequest(server.url + '/write', {
      method: 'POST',
      cookies: { sid: 'session-token-abc', csrf: 'token-xyz' },
      body: {},
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'CSRF_TOKEN_PARTIAL');
  });

  test('POST with sid cookie but mismatched csrf header is rejected', async () => {
    const r = await httpRequest(server.url + '/write', {
      method: 'POST',
      cookies: { sid: 'session-token-abc', csrf: 'token-xyz' },
      headers: { 'X-CSRF-Token': 'different-token' },
      body: {},
    });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'CSRF_TOKEN_MISMATCH');
  });
});

describe('csrf: csrf-token endpoint is exempt', () => {
  let server;
  before(async () => { server = await listen(buildApp()); });
  after(async () => { await server.close(); });

  test('GET /api/auth/csrf-token does not require a csrf header', async () => {
    const r = await httpRequest(server.url + '/api/auth/csrf-token');
    assert.equal(r.status, 200);
  });
});

describe('csrf: setCsrfCookie sets a readable cookie and clearCsrfCookie removes it', () => {
  test('csrf cookie is readable by JS (httpOnly: false)', () => {
    const cookies = {};
    const res = {
      cookie(name, value, opts) { cookies[name] = { value, opts }; },
      clearCookie(name, opts) { cookies[name] = { value: '', opts: { ...opts, maxAge: -1 } }; },
    };
    const req = { headers: { host: 'localhost:3000' } };
    setCsrfCookie(res, req);
    assert.ok(cookies.csrf, 'csrf cookie should be set');
    assert.equal(cookies.csrf.opts.httpOnly, false, 'must be readable by front-end JS');
    assert.ok(cookies.csrf.value.length >= 32, 'csrf cookie must be at least 32 chars');
    clearCsrfCookie(res, req);
    assert.equal(cookies.csrf.opts.maxAge, -1, 'clear should set maxAge to a past value');
  });
});
