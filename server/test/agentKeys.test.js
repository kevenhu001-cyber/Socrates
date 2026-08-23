// @ts-check
/**
 * Tests for src/services/agentKeys.ts — scoped long-lived credentials for
 * headless agents. The grammar/hash checks are pure; the round-trip suite
 * needs PostgreSQL (skipped without DATABASE_URL, matching the other suites).
 *
 * DB rows are created under a uniquely-random test user and fully removed in
 * `after` (agent keys + sessions cascade with the user row).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  AGENT_KEY_RE,
  createAgentKey,
  verifyAgentKey,
  sha256Hex,
} from '../src/services/agentKeys.ts';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { users, agentApiKeys } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

let dbAvailable = false;
let testUser = null;

const TEST_EMAIL_PREFIX = 'test-agentkeys-';

before(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    initDb(process.env.DATABASE_URL);
    dbAvailable = true;
    const email = `${TEST_EMAIL_PREFIX}${crypto.randomUUID()}@invalid.test`;
    const [row] = await getDb().insert(users).values({
      email,
      passwordHash: 'test-only-not-a-real-hash',
      verifiedAt: new Date(),
    }).returning();
    testUser = row;
  } catch {
    dbAvailable = false;
  }
});

after(async () => {
  try {
    if (testUser) await getDb().delete(users).where(eq(users.id, testUser.id));
  } catch { /* best-effort cleanup */ }
  if (dbAvailable) await closeDb();
});

describe('agent key grammar & hashing', () => {
  test('sha256Hex is deterministic hex', () => {
    assert.equal(sha256Hex('abc'), crypto.createHash('sha256').update('abc', 'utf8').digest('hex'));
    assert.match(sha256Hex('abc'), /^[a-f0-9]{64}$/);
  });

  test('issued credentials match the documented bearer grammar', { skip: !dbAvailable }, async () => {
    const issued = await createAgentKey({
      ownerUserId: testUser.id,
      label: 'grammar-check',
      scopes: ['chat:read'],
    });
    assert.equal(AGENT_KEY_RE.test(`Bearer ${issued.credential}`), true, issued.credential);
    // keyId: ak_ + exactly 20 lowercase RFC-4648 base32 chars
    const keyId = issued.keyId;
    assert.match(keyId, /^ak_[a-z2-7]{20}$/);
    // secret: 43 base64url chars (32 bytes)
    const secret = issued.credential.slice(keyId.length + 1);
    assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
  });
});

describe('verifyAgentKey round trip', { skip: !dbAvailable }, () => {
  test('accepts the minted credential and returns the granted scopes', async () => {
    const issued = await createAgentKey({
      ownerUserId: testUser.id,
      label: 'round-trip',
      scopes: ['sessions:read', 'files:write'],
    });
    const verified = await verifyAgentKey(issued.credential);
    assert.ok(verified, 'credential must verify');
    assert.equal(verified.user.id, testUser.id);
    assert.deepEqual([...verified.scopes].sort(), ['files:write', 'sessions:read']);
  });

  test('rejects a tampered secret', async () => {
    const issued = await createAgentKey({
      ownerUserId: testUser.id,
      label: 'tamper',
      scopes: ['chat:read'],
    });
    const [keyId] = [issued.keyId];
    const forged = `${keyId}.${'A'.repeat(43)}`;
    assert.equal(await verifyAgentKey(forged), null);
  });

  test('rejects revoked and expired keys', async () => {
    const db = getDb();
    const revoked = await createAgentKey({ ownerUserId: testUser.id, label: 'revoked', scopes: ['chat:read'] });
    const expired = await createAgentKey({ ownerUserId: testUser.id, label: 'expired', scopes: ['chat:read'] });

    await db.update(agentApiKeys).set({ revokedAt: new Date() }).where(eq(agentApiKeys.id, revoked.id));
    await db.update(agentApiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentApiKeys.id, expired.id));

    assert.equal(await verifyAgentKey(revoked.credential), null);
    assert.equal(await verifyAgentKey(expired.credential), null);
  });
});
