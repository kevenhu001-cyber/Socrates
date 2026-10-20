// @ts-check
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { shutdownPubsub } from '../src/lib/pubsub.js';

const token = 'unit-test-internal-metrics-token-with-enough-entropy';
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  delete process.env.INTERNAL_METRICS_TOKEN;
  // app imports pubsub, whose dedicated PG listener keeps the process alive.
  await shutdownPubsub();
});

async function get(path, authorization) {
  return fetch(`${baseUrl}${path}`, {
    headers: authorization ? { authorization } : {},
  });
}

test('internal metrics stay disabled when no token is configured', async () => {
  delete process.env.INTERNAL_METRICS_TOKEN;
  for (const path of ['/api/_internal/metrics', '/api/v2/_internal/metrics']) {
    const response = await get(path);
    assert.equal(response.status, 404);
  }
  process.env.INTERNAL_METRICS_TOKEN = 'too-short';
  assert.equal((await get('/api/_internal/metrics')).status, 404);
});

test('configured endpoint rejects missing and incorrect bearer credentials', async () => {
  process.env.INTERNAL_METRICS_TOKEN = token;
  assert.equal((await get('/api/_internal/metrics')).status, 401);
  assert.equal((await get('/api/_internal/metrics', 'Bearer wrong')).status, 403);
  assert.equal((await get('/api/_internal/metrics', 'Basic anything')).status, 401);
});

test('valid bearer credential returns process/request/SSE metrics identically via v2 alias', async () => {
  process.env.INTERNAL_METRICS_TOKEN = token;
  const headers = `Bearer ${token}`;
  const response = await get('/api/_internal/metrics', headers);
  const aliasResponse = await get('/api/v2/_internal/metrics', headers);
  assert.equal(response.status, 200);
  assert.equal(aliasResponse.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  const aliasBody = await aliasResponse.json();
  assert.deepEqual(Object.keys(body).sort(), [
    'activeSseConnections', 'process', 'requests', 'uptimeSeconds',
  ]);
  assert.equal(typeof body.process.pid, 'number');
  assert.equal(typeof body.process.memory.heapUsedBytes, 'number');
  assert.equal(body.requests.avgResponseMs === null || typeof body.requests.avgResponseMs === 'number', true);
  assert.equal(body.requests.successRate === null || typeof body.requests.successRate === 'number', true);
  if (body.requests.successRate !== null) {
    assert.ok(body.requests.successRate >= 0 && body.requests.successRate <= 100);
  }
  assert.equal(body.activeSseConnections, 0);
  assert.deepEqual(body.requests, aliasBody.requests,
    'scrapes must not add request samples between the canonical and v2 responses');
  assert.deepEqual(Object.keys(aliasBody).sort(), Object.keys(body).sort());
  assert.equal(aliasBody.activeSseConnections, body.activeSseConnections);
  assert.deepEqual(aliasBody.requests, body.requests);
  // A response snapshots metrics before its own finish event. Read again
  // after the alias scrape completes to catch pollution by that request too.
  const afterAlias = await (await get('/api/_internal/metrics', headers)).json();
  assert.deepEqual(afterAlias.requests, body.requests,
    'completed v2 scrapes must not contribute to business request samples');
});

test('successful business requests populate metrics while disabled and rejected scrapes do not', async () => {
  const hello = await get('/api/hello');
  assert.equal(hello.status, 200);
  assert.deepEqual(await hello.json(), { message: 'hello' });
  process.env.INTERNAL_METRICS_TOKEN = token;
  const beforeScrapes = await (await get('/api/_internal/metrics', `Bearer ${token}`)).json();
  assert.equal(typeof beforeScrapes.requests.avgResponseMs, 'number');
  assert.equal(beforeScrapes.requests.successRate, 100);
  for (const path of ['/api/_internal/metrics?probe=1', '/api/v2/_internal/metrics?probe=1']) {
    delete process.env.INTERNAL_METRICS_TOKEN;
    const disabled = await get(path);
    assert.equal(disabled.status, 404);
    await disabled.text();
    process.env.INTERNAL_METRICS_TOKEN = token;
    for (const [credential, status] of [[undefined, 401], ['Bearer wrong', 403]]) {
      const rejected = await get(path, credential);
      assert.equal(rejected.status, status);
      await rejected.text();
    }
  }
  const afterScrapes = await (await get('/api/v2/_internal/metrics', `Bearer ${token}`)).json();
  assert.deepEqual(afterScrapes.requests, beforeScrapes.requests,
    'disabled/unauthorized canonical and v2 scrapes cannot skew a real business sample');
});

test('metrics expose finite active SSE counts and clamp invalid or negative locals', async () => {
  process.env.INTERNAL_METRICS_TOKEN = token;
  const previous = app.locals.sseCount;
  try {
    for (const [value, expected] of [[undefined, 0], [NaN, 0], [-4, 0], [7, 7]]) {
      app.locals.sseCount = value;
      const response = await get('/api/_internal/metrics', `Bearer ${token}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).activeSseConnections, expected);
    }
  } finally {
    if (previous === undefined) delete app.locals.sseCount;
    else app.locals.sseCount = previous;
  }
});
