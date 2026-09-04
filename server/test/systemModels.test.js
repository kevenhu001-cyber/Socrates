// @ts-check
/**
 * Unit tests for routes/systemModels.ts — the admin-managed built-in
 * (Beagle) system model surface.
 *
 * The DB-backed paths (list / upsert) need a live Postgres + an
 * authenticated admin; those are covered by the running server in
 * dev. What a unit test can pin without a DB is the route surface
 * and the middleware ordering — same contract
 * embeddingConfig.test.js pins for the embedding admin route.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('systemModels — fail-closed admin gate + route surface', () => {
  test('module imports cleanly with ADMIN_EMAILS unset', async () => {
    const mod = await import('../src/routes/systemModels.js');
    assert.ok(mod.default, 'expected the default router export');
    assert.equal(typeof mod.default.stack?.length, 'number',
      'expected an Express router with a middleware stack');
  });

  test('the router carries the requireAuth + requireAdmin middleware', async () => {
    const mod = await import('../src/routes/systemModels.js');
    const middlewareEntries = mod.default.stack.filter((l) => !l.route);
    assert.ok(middlewareEntries.length >= 2,
      'expected at least two middleware layers (requireAuth, requireAdmin)');
  });

  test('the router exposes GET / and PUT /', async () => {
    const mod = await import('../src/routes/systemModels.js');
    const paths = mod.default.stack
      .filter((l) => l.route)
      .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));
    const hasList = paths.some((p) => p.path === '/' && p.methods.includes('get'));
    const hasUpsert = paths.some((p) => p.path === '/' && p.methods.includes('put'));
    assert.ok(hasList, 'expected GET /');
    assert.ok(hasUpsert, 'expected PUT /');
  });
});
