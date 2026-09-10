// @ts-check
/**
 * Route tests for DELETE /api/project-connectors/:provider/connection.
 *
 * Needs PostgreSQL (skipped without DATABASE_URL, matching the other
 * DB-backed suites). Authenticates with a minted agent key (no browser
 * session needed); CSRF is covered by its own suite and bypassed here by
 * mounting the router bare.
 *
 * DB rows are created under a uniquely-random test user and fully removed
 * in `after` (connections cascade with the user row).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { eq, and } from 'drizzle-orm';

import projectConnectorRouter from '../src/routes/projectConnectors.js';
import { errorHandler } from '../src/middleware/error.js';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, projectConnectorConnections } from '../src/db/schema.js';
import { createAgentKey } from '../src/services/agentKeys.ts';
import { listen, httpRequest } from './_http.js';

let testUser = null;
let bearer = null;
let baseUrl = null;
let closeServer = null;

const TEST_EMAIL_PREFIX = 'test-disconnect-';

const DB_GATED = !process.env.DATABASE_URL;
before(async () => {
  if (DB_GATED) return;
  try {
    initDb(process.env.DATABASE_URL);
    const email = `${TEST_EMAIL_PREFIX}${crypto.randomUUID()}@invalid.test`;
    const [row] = await getDb().insert(users).values({
      email,
      passwordHash: 'test-only-not-a-real-hash',
      verifiedAt: new Date(),
    }).returning();
    testUser = row;
    const issued = await createAgentKey({ ownerUserId: row.id, label: 'disconnect-test', scopes: ['chat:read'] });
    bearer = `Bearer ${issued.credential}`;
    const app = express();
    app.use(express.json());
    app.use('/api/project-connectors', projectConnectorRouter);
    app.use(errorHandler);
    const srv = await listen(app);
    baseUrl = srv.url;
    closeServer = srv.close;
  } catch (e) {
    console.error('disconnect-test setup failed:', e?.message);
    throw e;
  }
});

after(async () => {
  try {
    if (closeServer) await closeServer();
    if (testUser) await getDb().delete(users).where(eq(users.id, testUser.id));
  } catch { /* best-effort cleanup */ }
  if (!DB_GATED) await closeDb();
});

async function rowsFor(provider) {
  return getDb().select().from(projectConnectorConnections).where(and(
    eq(projectConnectorConnections.userId, testUser.id),
    eq(projectConnectorConnections.provider, provider),
  ));
}

describe('DELETE /api/project-connectors/:provider/connection', () => {
  test('rejects unauthenticated callers', { skip: DB_GATED }, async () => {
    const r = await httpRequest(`${baseUrl}/api/project-connectors/github/connection`, { method: 'DELETE' });
    assert.equal(r.status, 401);
  });

  test('404s unknown providers without touching the db', { skip: DB_GATED }, async () => {
    const before = await getDb().select().from(projectConnectorConnections).where(
      eq(projectConnectorConnections.userId, testUser.id),
    );
    const r = await httpRequest(`${baseUrl}/api/project-connectors/no_such_app_xyz/connection`, {
      method: 'DELETE',
      headers: { authorization: bearer },
    });
    assert.equal(r.status, 404);
    const after = await getDb().select().from(projectConnectorConnections).where(
      eq(projectConnectorConnections.userId, testUser.id),
    );
    assert.equal(after.length, before.length);
  });

  test('deletes the row and reports disconnected (idempotent)', { skip: DB_GATED }, async () => {
    await getDb().insert(projectConnectorConnections).values({
      userId: testUser.id,
      provider: 'github',
      connectionName: 'socrates',
      requestId: `sync_${Date.now()}`,
      status: 'connected',
    });
    assert.equal((await rowsFor('github')).length, 1);
    const r = await httpRequest(`${baseUrl}/api/project-connectors/github/connection`, {
      method: 'DELETE',
      headers: { authorization: bearer },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'disconnected');
    assert.equal((await rowsFor('github')).length, 0);
    const again = await httpRequest(`${baseUrl}/api/project-connectors/github/connection`, {
      method: 'DELETE',
      headers: { authorization: bearer },
    });
    assert.equal(again.status, 200);
  });

  test('accepts namespaced oc_ ids', { skip: DB_GATED }, async () => {
    await getDb().insert(projectConnectorConnections).values({
      userId: testUser.id,
      provider: 'oc_slack',
      connectionName: 'socrates-test',
      requestId: `sync_${Date.now()}`,
      status: 'connected',
    });
    const r = await httpRequest(`${baseUrl}/api/project-connectors/oc_slack/connection`, {
      method: 'DELETE',
      headers: { authorization: bearer },
    });
    assert.equal(r.status, 200);
    assert.equal((await rowsFor('oc_slack')).length, 0);
  });
});
