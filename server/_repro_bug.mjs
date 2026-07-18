// Reproduce the user's reported bug:
// 1. Most recent session doesn't show recent records
// 2. Retry button: new content doesn't show immediately, only after refresh
// 3. After refresh, retried content appears as "received" status

import { initDb, getDb, closeDb } from '/home/ubuntu/User/Socrates/server/src/db/index.js';
import { users, authSessions } from '/home/ubuntu/User/Socrates/server/src/db/schema.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import 'dotenv/config';

await initDb(process.env.DATABASE_URL);
const db = getDb();
const email = 'bug_repro_' + Date.now() + '@example.com';
const password = 'changeme';
const passwordHash = await bcrypt.hash(password, 10);
const userId = crypto.randomUUID();
await db.insert(users).values({
  id: userId,
  email,
  passwordHash,
  verifiedAt: new Date(),
  displayName: 'BugRepro',
  isGuest: false,
});
const token = crypto.randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 30*24*60*60*1000);
await db.insert(authSessions).values({token, userId, expiresAt});

console.log('USER_ID=', userId);
console.log('TOKEN=', token);
console.log('EMAIL=', email);

await closeDb();
