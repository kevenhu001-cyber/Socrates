// @ts-check
/**
 * Tests for routes/providers/systemModels.ts — the admin-managed built-in
 * (Beagle) system model surface.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import express from 'express';
import { httpRequest, listen } from './_http.js';
import { closeDb, initDb } from '../src/db/index.js';
import { apiKeys } from '../src/db/schema/index.js';
import { issueAdminSessionToken } from '../src/services/core/adminAuth.js';
import {
  getActiveApiKey,
  getSelectedApiKey,
  invalidateApiKeyCache,
  seedBuiltInProvider,
} from '../src/services/core/apiKey.js';
import { errorHandler } from '../src/middleware/error.js';

describe('systemModels — operator console gate + route surface', () => {
  test('module imports cleanly without ADMIN_PASSWORD set', async () => {
    const mod = await import('../src/routes/providers/systemModels.js');
    assert.ok(mod.default, 'expected the default router export');
    assert.equal(
      typeof mod.default.stack?.length,
      'number',
      'expected an Express router with a middleware stack',
    );
  });

  test('the router carries the requireAdminSession middleware', async () => {
    const mod = await import('../src/routes/providers/systemModels.js');
    const middlewareEntries = mod.default.stack.filter((l) => !l.route);
    assert.ok(middlewareEntries.length >= 1, 'expected the requireAdminSession middleware layer');
  });

  test('the router exposes GET / and PUT /', async () => {
    const mod = await import('../src/routes/providers/systemModels.js');
    const paths = mod.default.stack
      .filter((l) => l.route)
      .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));
    const hasList = paths.some((p) => p.path === '/' && p.methods.includes('get'));
    const hasUpsert = paths.some((p) => p.path === '/' && p.methods.includes('put'));
    assert.ok(hasList, 'expected GET /');
    assert.ok(hasUpsert, 'expected PUT /');
  });
});

test('an admin model and its disabled state survive startup with older environment defaults', async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    assert.notEqual(process.env.SOCRATES_TEST_STRICT, '1');
    return t.skip('requires a test database');
  }
  const bootstrapEnv = {
    BEAGLE_SYSTEM_KEY: 'test-bootstrap-key',
    MINIMAX_BASE_URL: 'https://bootstrap.example/v1',
    MINIMAX_MODEL: 'bootstrap-model',
    ADMIN_IP_ALLOWLIST: '',
  };
  const previousEnv = new Map(Object.keys(bootstrapEnv).map((name) => [name, process.env[name]]));
  Object.assign(process.env, bootstrapEnv);
  const db = initDb(dbUrl);
  const builtInRows = () => db.select().from(apiKeys).where(eq(apiKeys.isBuiltIn, true));
  let bootstrapId;
  t.after(async () => {
    try {
      if (bootstrapId) await db.delete(apiKeys).where(eq(apiKeys.id, bootstrapId));
    } finally {
      for (const [name, value] of previousEnv) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      invalidateApiKeyCache();
      await closeDb();
    }
  });
  assert.equal((await builtInRows()).length, 0);
  await seedBuiltInProvider();
  const bootstrap = await getActiveApiKey(null);
  assert.ok(bootstrap);
  bootstrapId = bootstrap.id;
  assert.equal(bootstrap.model, 'bootstrap-model');
  assert.equal(bootstrap.keyPlaintext, 'test-bootstrap-key');

  const fallbackUser = randomUUID();
  assert.equal((await getActiveApiKey(fallbackUser))?.model, 'bootstrap-model');

  const app = express();
  app.use(express.json());
  app.use('/system-models', (await import('../src/routes/providers/systemModels.js')).default);
  app.use(errorHandler);
  const http = await listen(app);
  t.after(() => http.close());
  const request = (method, body) =>
    httpRequest(http.url + '/system-models', {
      method,
      body,
      headers: { 'X-Admin-Token': issueAdminSessionToken() },
    });

  const config = {
    label: 'Beagle',
    url: 'https://admin-provider.example/api/v1',
    model: 'admin-model',
    key: 'test-admin-key',
    isMultimodal: false,
  };
  const saved = await request('PUT', config);
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.id, bootstrap.id);
  assert.equal((await getActiveApiKey(null))?.model, config.model);
  assert.equal((await getActiveApiKey(fallbackUser))?.model, config.model);

  const verifyRestart = async (label) => {
    invalidateApiKeyCache();
    const before = await builtInRows();
    await seedBuiltInProvider();
    assert.deepEqual(await builtInRows(), before);
    const loaded = await request('GET');
    assert.equal(loaded.status, 200, loaded.text);
    assert.equal(loaded.body.id, bootstrap.id);
    assert.equal(loaded.body.label, label);
    assert.equal(loaded.body.url, config.url);
    assert.equal(loaded.body.model, config.model);
    assert.equal(loaded.body.isMultimodal, false);
    return loaded.body;
  };

  assert.equal((await verifyRestart(config.label)).hasKey, true);
  assert.equal((await getSelectedApiKey(null, 'beagle-built-in'))?.keyPlaintext, config.key);

  const renamed = { ...config, label: 'Admin nickname', key: undefined };
  const rename = await request('PUT', renamed);
  assert.equal(rename.status, 200, rename.text);
  assert.equal((await verifyRestart(renamed.label)).hasKey, true);
  assert.equal((await getActiveApiKey(null))?.keyPlaintext, config.key);

  const disabled = await request('PUT', { ...renamed, key: '' });
  assert.equal(disabled.status, 200, disabled.text);
  assert.equal(await getActiveApiKey(null), null);
  const afterRestart = await verifyRestart(renamed.label);
  assert.equal(afterRestart.hasKey, false);
  assert.equal(afterRestart.isActive, false);
  assert.equal(await getSelectedApiKey(null, 'beagle-built-in'), null);
});
