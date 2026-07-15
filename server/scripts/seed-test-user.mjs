#!/usr/bin/env node
/**
 * scripts/seed-test-user.mjs — Create or update a fixed test account.
 *
 * Idempotent: re-running this script just updates the password hash
 * for the existing row. Use this whenever the DB is reset and you
 * need a known account for manual QA / e2e / fixture login.
 *
 * Usage:
 *   cd server
 *   node scripts/seed-test-user.mjs
 *
 * Environment:
 *   DATABASE_URL — Postgres connection string (required, same as
 *                  the server uses; loaded from .env automatically).
 *
 * The seeded credentials are deliberately simple so they can be
 * typed at the login screen without copy-paste:
 *   email:    test@example.com
 *   password: changeme
 *
 * The row is created with verifiedAt = now() so the account
 * bypasses the email-verification step that the public
 * /api/auth/register endpoint requires. It is also marked as a
 * guest account (isGuest = false, but tier set to the test tier
 * so it doesn't trip the billing limits that real users hit).
 */

import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load .env from the server/ directory (same default the app uses).
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'changeme';
const BCRYPT_ROUNDS = 12;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is not set. Configure it in server/.env or pass it in the environment.');
    process.exit(1);
  }

  // Lazy import — dotenv has loaded DATABASE_URL by now, and the
  // drizzle pool only opens connections when the first query runs.
  const { initDb, getDb } = await import('../src/db/index.js');
  const { users } = await import('../src/db/schema.js');

  const db = initDb(process.env.DATABASE_URL);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
  const now = new Date();

  const [existing] = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
  if (existing) {
    await db.update(users)
      .set({
        passwordHash,
        verifiedAt: now,
        // Refresh the tier so re-seeding after a tier change in code
        // picks up the new default. Other fields (displayName,
        // preferences) are left alone so we don't clobber manual
        // edits.
        tier: 'descartes',
      })
      .where(eq(users.id, existing.id));
    console.log(`[seed] updated existing user id=${existing.id} (${TEST_EMAIL})`);
  } else {
    const [inserted] = await db.insert(users).values({
      email: TEST_EMAIL,
      displayName: 'Test User',
      passwordHash,
      tier: 'descartes',        // paid-equivalent tier so quotas aren't a blocker
      plan: 'descartes',
      isGuest: false,
      verifiedAt: now,         // skip email verification
    }).returning();
    console.log(`[seed] created user id=${inserted.id} (${TEST_EMAIL})`);
  }

  console.log('\nCredentials:');
  console.log(`  email:    ${TEST_EMAIL}`);
  console.log('  password: changeme');
  console.log('\nYou can now log in at /auth/signin.');

  // Close the pool cleanly so node exits. Drizzle/node-postgres
  // keep the pool open by default; without an explicit closeDb()
  // the script hangs after the queries finish.
  const { closeDb } = await import('../src/db/index.js');
  await closeDb();
}

main().catch((err) => {
  console.error('[seed] failed:', err && err.stack || err);
  process.exit(1);
});
