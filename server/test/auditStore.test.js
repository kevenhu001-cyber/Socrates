import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';
import { users, auditEvents } from '../src/db/schema/index.js';
import { recordAudit } from '../src/services/core/audit.js';
import { recordAudit as compatibilityRecordAudit } from '../src/middleware/audit.js';

const enabled = Boolean(process.env.DATABASE_URL);
let db, userId;
before(async () => {
  if (!enabled) return;
  db = initDb(process.env.DATABASE_URL);
  const [user] = await db.insert(users).values({ email: `audit-store-${randomUUID()}@test.invalid`, passwordHash: 'test-only' }).returning();
  userId = user.id;
});
after(async () => {
  if (!enabled) return;
  if (userId) await db.delete(users).where(eq(users.id, userId));
  await closeDb();
});

test('HTTP compatibility export points to the service recorder', () => {
  assert.equal(compatibilityRecordAudit, recordAudit);
});

test('service recorder persists execution audit details without an HTTP request', { skip: !enabled }, async () => {
  await recordAudit(userId, 'code_execution', { executionId: 'test-execution', status: 'completed' });
  const rows = await db.select().from(auditEvents).where(and(eq(auditEvents.userId, userId), eq(auditEvents.action, 'code_execution')));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].detail, { executionId: 'test-execution', status: 'completed' });
});
