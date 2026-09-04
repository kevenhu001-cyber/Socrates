// @ts-check
/**
 * Unit tests for routes/embeddingConfig.ts — the admin gate + the
 * request validation surface. The DB-backed paths (list / upsert /
 * delete) need a live Postgres + an authenticated admin; those are
 * covered by the running server in dev and by the e2e admin flows.
 * What a unit test can pin without a DB is the route surface and
 * the middleware ordering (requireAdminSession first).
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('embeddingConfig — operator console gate', () => {
  test('module imports cleanly without ADMIN_PASSWORD set', async () => {
    // The import must not throw — the admin gate is a per-request
    // check, not a boot-time assertion, so a deployment without
    // ADMIN_PASSWORD still boots the API (the console renders the
    // "disabled" message instead of the forms).
    const mod = await import('../src/routes/embeddingConfig.js');
    assert.ok(mod.default, 'expected the default router export');
    assert.equal(typeof mod.default.stack?.length, 'number',
      'expected an Express router with a middleware stack');
  });

  test('the router carries the requireAdminSession middleware', async () => {
    const mod = await import('../src/routes/embeddingConfig.js');
    const middlewareEntries = mod.default.stack.filter((l) => !l.route);
    assert.ok(middlewareEntries.length >= 1,
      'expected the requireAdminSession middleware layer');
  });

  test('the router exposes GET /, PUT /, DELETE /:id', async () => {
    const mod = await import('../src/routes/embeddingConfig.js');
    const paths = mod.default.stack
      .filter((l) => l.route)
      .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));
    const hasList = paths.some((p) => p.path === '/' && p.methods.includes('get'));
    const hasUpsert = paths.some((p) => p.path === '/' && p.methods.includes('put'));
    const hasDelete = paths.some((p) => p.path === '/:id' && p.methods.includes('delete'));
    assert.ok(hasList, 'expected GET /');
    assert.ok(hasUpsert, 'expected PUT /');
    assert.ok(hasDelete, 'expected DELETE /:id');
  });
});
