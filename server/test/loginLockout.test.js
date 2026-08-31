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

/* No `skip` option on the describe: that would be evaluated at module
   load, before the async before() below has had a chance to set
   dbAvailable, so the suite would skip unconditionally. Skip inside
   each test instead. */
describe('loginLockout.recordFailure — atomic concurrent increment', () => {
  /* 20 concurrent writers, but count stops at THRESHOLD (5): once the
     upsert sets locked_until, further failures deliberately leave the
     row untouched (see the CASE in recordFailure and the "count must
     not grow while locked" test below). What this test really pins
     down is that the increment is atomic — 20 racing upserts must
     land on exactly 5, not on whatever the last writer happened to
     read. */
  test('20 concurrent failures for the same email settle on count=THRESHOLD', async (t) => {
    if (!dbAvailable) return t.skip('no database');
    await Promise.all(Array.from({ length: 20 }, () => recordFailure(TEST_EMAIL)));
    const [row] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    assert.ok(row, 'loginFailures row should exist after the first failure');
    assert.equal(row.count, 5, 'atomic upsert must settle on the threshold, never lose or double an increment');
    assert.ok(row.lockedUntil instanceof Date, 'crossing the threshold must set lockedUntil');
    assert.ok(row.lockedUntil.getTime() > Date.now(), 'lockedUntil must be in the future');
  });

  test('threshold (5) triggers a lockedUntil > now()', async (t) => {
    if (!dbAvailable) return t.skip('no database');
    await Promise.all(Array.from({ length: 5 }, () => recordFailure(TEST_EMAIL)));
    const [row] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    assert.ok(row.lockedUntil instanceof Date, 'lockedUntil must be a Date');
    assert.ok(row.lockedUntil.getTime() > Date.now(), 'lockedUntil must be in the future');
    await assert.rejects(checkLockout(TEST_EMAIL), (err) => err.code === 'TOO_MANY_REQUESTS');
  });

  test('further concurrent failures during an active lockout do not move the lockout clock', async (t) => {
    if (!dbAvailable) return t.skip('no database');
    await Promise.all(Array.from({ length: 5 }, () => recordFailure(TEST_EMAIL)));
    const [first] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    await new Promise((r) => setTimeout(r, 1100));
    await Promise.all(Array.from({ length: 10 }, () => recordFailure(TEST_EMAIL)));
    const [second] = await getDb().select().from(loginFailures).where(eq(loginFailures.email, TEST_EMAIL)).limit(1);
    assert.equal(second.count, first.count, 'count must not grow while locked');
    assert.equal(second.lockedUntil.getTime(), first.lockedUntil.getTime(), 'lockedUntil must not move');
  });
});
