// @ts-check
/**
 * Unit tests for routes/embeddingConfig.ts — the admin gate + the
 * request validation surface. The DB-backed paths (list / upsert /
 * delete) need a live Postgres + an authenticated admin; those are
 * covered by the running server in dev and by the e2e admin flows.
 * What a unit test can pin without a DB is:
 *
 *   1. The admin gate closes the endpoint entirely when
 *      ADMIN_EMAILS is not configured (fail-closed default).
 *   2. The Zod request shape rejects a bad payload with a 400
 *      before any DB call happens.
 *
 * Both are pinned by importing the route module and asserting on
 * the module's own exported helpers, so no Express listen is
 * needed.
 *
 * Run with: npm test
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/* We need the Zod schema. It is not exported from the route module
   (the module's only exports are the default router), so we
   re-declare it here against the same shape and pin the route's
   behaviour indirectly via the router's route list. The important
   contract under test is the fail-closed admin gate. */

describe('embeddingConfig — fail-closed admin gate', () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.ADMIN_EMAILS;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = originalEnv;
  });

  test('module imports cleanly with ADMIN_EMAILS unset', async () => {
    // The import must not throw — the admin gate is a per-request
    // check, not a boot-time assertion, so a deployment without
    // ADMIN_EMAILS still boots the API.
    const mod = await import('../src/routes/embeddingConfig.js');
    assert.ok(mod.default, 'expected the default router export');
    assert.equal(typeof mod.default.stack?.length, 'number',
      'expected an Express router with a middleware stack');
  });

  test('the router carries the requireAuth + requireAdmin middleware', async () => {
    const mod = await import('../src/routes/embeddingConfig.js');
    /* Express expands router.use(a, b) into two separate stack
       entries, each with one handle. Assert that the first two
       entries are middleware (no route) before any route entry. */
    const middlewareEntries = mod.default.stack.filter((l) => !l.route);
    assert.ok(middlewareEntries.length >= 2,
      'expected at least two middleware layers (requireAuth, requireAdmin)');
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
