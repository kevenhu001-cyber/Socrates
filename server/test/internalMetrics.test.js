// @ts-check
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

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
