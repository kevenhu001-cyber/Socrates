import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { projectPublicSchema } from '../scripts/generate-site-openapi.mjs';

test('published OpenAPI is a deterministic projection of canonical schema and excludes operator-only routes', () => {
  const published = JSON.parse(readFileSync(new URL('../site/openapi.json', import.meta.url), 'utf8'));
  const canonical = parse(readFileSync(new URL('../docs/api/openapi.yaml', import.meta.url), 'utf8'));
  assert.equal(published.openapi, canonical.openapi);
  assert.ok(published.paths['/api/health']);
  assert.ok(published.paths['/api/oauth/token']);
  assert.ok(!published.tags.some((tag) => tag.name === 'admin'));
  for (const [path, pathItem] of Object.entries(canonical.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!/^(get|post|put|patch|delete|head|options|trace)$/i.test(method)) continue;
      const shouldPublish = !operation?.tags?.includes('admin') && operation?.['x-internal'] !== true &&
        pathItem?.['x-internal'] !== true && !path.split('/').includes('_internal');
      assert.equal(Boolean(published.paths[path]?.[method]), shouldPublish, `${method.toUpperCase()} ${path}`);
    }
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, ['scripts/generate-site-openapi.mjs', '--check'], { stdio: 'pipe' }));
});

test('projection filters both pathItem and operation x-internal markers without mutating source', () => {
  const source = {
    openapi: '3.1.0',
    paths: {
      '/public': { get: { summary: 'public' } },
      '/path-private': { 'x-internal': true, get: { summary: 'private' } },
      '/op-private': { get: { 'x-internal': true, summary: 'private' } },
      '/api/_internal/metrics': { get: { summary: 'private' } },
      '/admin': { get: { tags: ['admin'] } },
    },
  };
  const projected = projectPublicSchema(source);
  assert.deepEqual(Object.keys(projected.paths), ['/public']);
  assert.equal(Object.keys(source.paths).length, 5);
});
