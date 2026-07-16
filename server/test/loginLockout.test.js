// @ts-check
/**
 * Integration test for services/loginLockout.js — exercises the
 * atomic upsert under real concurrent load. Requires a Postgres
 * instance reachable via DATABASE_URL; the test creates and drops
 * its own row so it is safe to run alongside the dev DB.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { initDb, getDb, closeDb } from '../src/db/index.js';
import { loginFailures } from '../src/db/schema.js';
import { recordFailure, checkLockout, recordSuccess } from '../src/services/loginLockout.js';

const TEST_EMAIL = 'lockout-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@example.test';

let dbAvailable = false;
before(async () => {
  if (!process.env.DATABASE_URL) {
    console.log('[loginLockout] DATABASE_URL not set — skipping integration test');
    return;
  }
  try {
    initDb(process.env.DATABASE_URL);
    await getDb().select().from(loginFailures).limit(1);
    dbAvailable = true;
  } catch (err) {
    console.log('[loginLockout] DB not reachable — skipping integration test:', err.message);
  }
});

after(async () => {
  if (!dbAvailable) return;
  try {
    await getDb().delete(loginFailures).where(eq(loginFailures.email, TEST_EMAIL));
  } catch (_) { /* best effort */ }
  await closeDb();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await getDb().delete(loginFailures).where(eq(loginFailures.email, TEST_EMAIL));
});

describe('loginLockout.recordFailure — atomic concurrent increment', { skip: !dbAvailable && 'no database' }, () => {
  test('20 concurrent failures for the same email reach count=20', async () => {
    await Promise.all(Array.from({ length: 20 }, () => recordFailure(TEST_EMAIL)));
    const [row] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    assert.ok(row, 'loginFailures row should exist after the first failure');
    assert.equal(row.count, 20, 'count must reflect every concurrent failure');
  });

  test('threshold (5) triggers a lockedUntil > now()', async () => {
    await Promise.all(Array.from({ length: 5 }, () => recordFailure(TEST_EMAIL)));
    const [row] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    assert.ok(row.lockedUntil instanceof Date, 'lockedUntil must be a Date');
    assert.ok(row.lockedUntil.getTime() > Date.now(), 'lockedUntil must be in the future');
    await assert.rejects(checkLockout(TEST_EMAIL), (err) => err.code === 'TOO_MANY_REQUESTS');
  });

  test('further concurrent failures during an active lockout do not move the lockout clock', async () => {
    await Promise.all(Array.from({ length: 5 }, () => recordFailure(TEST_EMAIL)));
    const [first] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    await new Promise((r) => setTimeout(r, 1100));
    await Promise.all(Array.from({ length: 10 }, () => recordFailure(TEST_EMAIL)));
    const [second] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    assert.equal(second.count, first.count, 'count must not grow while locked');
    assert.equal(second.lockedUntil.getTime(), first.lockedUntil.getTime(), 'lockedUntil must not move');
  });
});
