// Simulate the API to verify the response shape
import 'dotenv/config';
import { initDb, getDb, closeDb } from '/home/ubuntu/User/Socrates/server/src/db/index.js';
import { users, authSessions, sessions, messages } from '/home/ubuntu/User/Socrates/server/src/db/schema.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and, desc, isNull, sql, inArray, count } from 'drizzle-orm';

await initDb(process.env.DATABASE_URL);
const db = getDb();

// Create a test user
const email = 'recents_test_' + Date.now() + '@example.com';
const password = 'changeme';
const passwordHash = await bcrypt.hash(password, 10);
const userId = crypto.randomUUID();
await db.insert(users).values({
  id: userId,
  email,
  passwordHash,
  verifiedAt: new Date(),
  displayName: 'RecentsTest',
  isGuest: false,
});
const token = crypto.randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 30*24*60*60*1000);
await db.insert(authSessions).values({token, userId, expiresAt});

// Insert 3 sessions
const now = new Date();
for (let i = 0; i < 3; i++) {
  const sid = crypto.randomUUID();
  await db.insert(sessions).values({
    id: sid,
    userId,
    topic: `Test topic ${i+1}`,
    title: `Test title ${i+1}`,
    mode: 'chat',
    phase: 'chat',
    pinned: false,
    totalQ: 0,
    currentNode: 0,
    updatedAt: new Date(now.getTime() - i * 60000),
    createdAt: new Date(now.getTime() - i * 60000),
  });
  // Insert a user message
  await db.insert(messages).values({
    sessionId: sid,
    role: 'user',
    content: `User msg ${i+1}`,
    rawText: `User msg ${i+1}`,
    type: 'user',
    createdAt: new Date(now.getTime() - i * 60000),
  });
}

// Now simulate the LIST endpoint
const conditions = [eq(sessions.userId, userId), isNull(sessions.archivedAt)];
const rows = await db.select()
  .from(sessions)
  .where(and(...conditions))
  .orderBy(desc(sessions.updatedAt))
  .limit(51);

console.log('LIST endpoint returned', rows.length, 'sessions');
if (rows.length > 0) {
  console.log('First session keys:', Object.keys(rows[0]));
  console.log('First session:', JSON.stringify(rows[0], null, 2));
}

// Cleanup
await db.delete(messages).where(eq(messages.sessionId, rows.map(r => r.id)));
await db.delete(sessions).where(eq(sessions.userId, userId));
await db.delete(authSessions).where(eq(authSessions.userId, userId));
await db.delete(users).where(eq(users.id, userId));

await closeDb();
