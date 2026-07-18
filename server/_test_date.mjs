// Test how Drizzle returns Date objects via JSON serialization
import { initDb, getDb, closeDb } from '/home/ubuntu/User/Socrates/server/src/db/index.js';
import { users, authSessions, sessions } from '/home/ubuntu/User/Socrates/server/src/db/schema.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and, desc, isNull } from 'drizzle-orm';

await initDb(process.env.DATABASE_URL);
const db = getDb();

// Create a test user and session
const email = 'date_test_' + Date.now() + '@example.com';
const password = 'changeme';
const passwordHash = await bcrypt.hash(password, 10);
const userId = crypto.randomUUID();
await db.insert(users).values({
  id: userId, email, passwordHash,
  verifiedAt: new Date(), displayName: 'DateTest', isGuest: false,
});

const sid = crypto.randomUUID();
await db.insert(sessions).values({
  id: sid, userId, topic: 'Date test', title: 'Date test',
  mode: 'chat', phase: 'chat', totalQ: 0, currentNode: 0,
});

const rows = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
console.log('updatedAt type:', typeof rows[0].updatedAt);
console.log('updatedAt value:', rows[0].updatedAt);
console.log('updatedAt instanceof Date:', rows[0].updatedAt instanceof Date);

const json = JSON.stringify(rows[0]);
console.log('JSON updatedAt:', json.match(/"updatedAt":"[^"]*"/)[0]);

const parsed = JSON.parse(json);
console.log('Parsed updatedAt type:', typeof parsed.updatedAt);
console.log('Parsed updatedAt:', parsed.updatedAt);

// Cleanup
await db.delete(sessions).where(eq(sessions.userId, userId));
await db.delete(users).where(eq(users.id, userId));
await closeDb();
