import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

let pool = null;
let db = null;

/**
 * Initialise the database connection pool and return the drizzle instance.
 * Call once at startup.
 */
export function initDb(databaseUrl) {
  if (db) return db;

  pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
  });

  db = drizzle(pool, { schema });
  return db;
}

/** Return the current drizzle instance (throws if not initialised). */
export function getDb() {
  if (!db) throw new Error('Database not initialised. Call initDb() first.');
  return db;
}

/** Gracefully close the pool (for shutdown / tests). */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
