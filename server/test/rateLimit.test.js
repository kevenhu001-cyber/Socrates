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
import fsPromises from 'node:fs/promises';

import {
  authLimiter, chatLimiter, searchLimiter, writeLimiter, fetchLimiter,
  oauthTokenLimiter, oauthRevokeLimiter,
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

describe('rateLimit: chatLimiter (240 / hour) — 241st call is rejected', () => {
  let server;
  before(async () => { server = await listen(buildApp(chatLimiter)); });
  after(async () => { await server.close(); });

  test('all 240 are allowed; the 241st is 429', async () => {
    for (let i = 0; i < 240; i++) {
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

/* Regression guard: /token and /revoke previously had no limiter at all,
   and the OAuth router was mounted before the default /api bucket, so
   both were reachable without any rate limit. */
describe('rateLimit: oauthTokenLimiter (60 / 15min)', () => {
  let server;
  before(async () => { server = await listen(buildApp(oauthTokenLimiter)); });
  after(async () => { await server.close(); });

  test('60 allowed; 61st is 429', async () => {
    for (let i = 0; i < 60; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
  });
});

describe('rateLimit: oauthRevokeLimiter (60 / 15min)', () => {
  let server;
  before(async () => { server = await listen(buildApp(oauthRevokeLimiter)); });
  after(async () => { await server.close(); });

  test('60 allowed; 61st is 429', async () => {
    for (let i = 0; i < 60; i++) {
      const r = await httpRequest(server.url + '/limited');
      assert.equal(r.status, 200);
    }
    const r = await httpRequest(server.url + '/limited');
    assert.equal(r.status, 429);
  });
});

/* The default bucket is only a ceiling if it actually runs first. It was
   previously mounted after /api/status, /api/mobile, /api/mcp and
   /api/oauth, leaving those four outside every limiter. Assert the mount
   order directly — importing app.ts here would pull in the DB and pubsub
   listeners, so read the registration order from source instead. */
describe('rateLimit: default bucket ordering (app.ts)', () => {
  test('apiDefaultLimiter is mounted exactly once and before every public /api route', async () => {
    const src = await fsPromises.readFile(new URL('../src/app.ts', import.meta.url), 'utf8');

    const mounts = [...src.matchAll(/app\.use\('\/api',\s*apiDefaultLimiter/g)];
    assert.equal(mounts.length, 1, 'the default limiter must be mounted exactly once on /api');
    const limiterAt = mounts[0].index;

    const publicPaths = ['/api/health', '/api/hello', '/api/status', '/api/mobile', '/api/mcp', '/api/oauth'];
    let checked = 0;
    for (const p of publicPaths) {
      const m = new RegExp(`app\\.(?:use|get|post)\\('${p}'`).exec(src);
      if (!m) continue;
      checked += 1;
      assert.ok(
        limiterAt < m.index,
        `${p} is registered before the default bucket and silently bypasses it`,
      );
    }
    assert.ok(checked > 0, 'expected to find the public /api routes in app.ts');
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
