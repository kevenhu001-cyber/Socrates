import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

let pool: pg.Pool | null = null;
let db: Database | null = null;

/**
 * Initialise the database connection pool and return the drizzle instance.
 * Call once at startup.
 */
export function initDb(databaseUrl: string): Database {
  if (db) return db;

  // Set statement_timeout on every connection via PostgreSQL connection
  // parameters. This avoids the deprecated pattern of calling
  // client.query() inside the pool.on('connect') handler, which in
  // pg@8.13+ triggers a DeprecationWarning. The ?options= parameter
  // applies to every connection the pool creates, so all connections
  // inherit the timeout without any per-connect setup.
  const separator = databaseUrl.includes('?') ? '&' : '?';
  pool = new Pool({
    connectionString: `${databaseUrl}${separator}options=--statement_timeout%3D30000`,
    max: 8,
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Idle clients emit 'error' when the backend closes the connection
  // (server restart, network blip). Without a pool-level listener that
  // event is an uncaught exception and crashes the whole process —
  // systemd's Restart=always then masks it as a random restart. Log
  // and let the pool replace the broken client on next checkout.
  pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
  });

  db = drizzle(pool, { schema });
  return db;
}

/** Return the current drizzle instance (throws if not initialised). */
export function getDb(): Database {
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
