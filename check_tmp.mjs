import 'dotenv/config';
import { initDb, closeDb } from './src/db/index.js';
import { sql } from 'drizzle-orm';
const db = initDb(process.env.DATABASE_URL);
const r = await db.execute(sql`SELECT component, to_state, created_at FROM status_monitor_events ORDER BY created_at DESC LIMIT 5`);
console.log(r.rows);
await closeDb();
