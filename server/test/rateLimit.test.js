// @ts-check
/**
 * Unit tests for the rate limiters in src/middleware/rateLimit.js.
 *
 * Each limiter uses express-rate-limit under the hood. We mount
 * the limiter on a minimal Express app and check that the
 * N-th request triggers a 429 with the documented JSON shape.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import {
  authLimiter, chatLimiter, searchLimiter, writeLimiter, fetchLimiter,
} from '../src/middleware/rateLimit.js';
import { errorHandler } from '../src/middleware/error.js';
import { listen, httpRequest } from './_http.js';

function buildApp(limiter) {
  const app = express();
  app.set('trust proxy', false);
  app.get('/limited', limiter, (req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('rateLimit: authLimiter (10 / 15min)', () => {
  let server;
  before(async () => { server = await listen(buildApp(authLimiter)); });
  after(async () => { await server.close(); });

  test('allows 10 requests and rejects the 11th', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200, `request #${i + 1} should be allowed`);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
    assert.equal(r.body.code, 'TOO_MANY_REQUESTS');
  });
});

describe('rateLimit: chatLimiter (60 / hour) — 61st call is rejected', () => {
  let server;
  before(async () => { server = await listen(buildApp(chatLimiter)); });
  after(async () => { await server.close(); });

  test('all 60 are allowed; the 61st is 429', async () => {
    for (let i = 0; i < 60; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
  });
});

describe('rateLimit: searchLimiter (20 / min)', () => {
  let server;
  before(async () => { server = await listen(buildApp(searchLimiter)); });
  after(async () => { await server.close(); });

  test('20 allowed; 21st is 429', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
  });
});

describe('rateLimit: fetchLimiter (15 / min)', () => {
  let server;
  before(async () => { server = await listen(buildApp(fetchLimiter)); });
  after(async () => { await server.close(); });

  test('15 allowed; 16th is 429', async () => {
    for (let i = 0; i < 15; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
  });
});

describe('rateLimit: writeLimiter (120 / min)', () => {
  let server;
  before(async () => { server = await listen(buildApp(writeLimiter)); });
  after(async () => { await server.close(); });

  test('120 allowed; 121st is 429', async () => {
    for (let i = 0; i < 120; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
  });
});

describe('rateLimit: 429 response shape', () => {
  let server;
  before(async () => { server = await listen(buildApp(authLimiter)); });
  after(async () => { await server.close(); });

  test('rejected requests carry the JSON error contract', async () => {
    for (let i = 0; i < 10; i++) {
      await httpRequest(server.url + '/limited');
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
    assert.equal(r.body.code, 'TOO_MANY_REQUESTS');
    assert.equal(typeof r.body.message, 'string');
  });
});
