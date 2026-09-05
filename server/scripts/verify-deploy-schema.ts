/**
 * verify-deploy-schema.ts — post-migration schema gate for deploy.sh.
 *
 * `db:migrate` is idempotent and skips already-applied migrations, so a
 * silently-skipped migration (e.g. a .sql file that was never registered
 * in drizzle/meta/_journal.json) looks exactly like success. This script
 * fails closed when a relation the running code requires is missing, so
 * the deploy aborts BEFORE the live service is stopped.
 *
 * Usage: npx tsx scripts/verify-deploy-schema.ts
 * Exit 0 when every required relation exists, 1 otherwise.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { initDb, closeDb } from '../src/db/index.js';

/* Relations the current backend reads/writes on hot paths. If any is
   missing, requests fail with `relation "..." does not exist`. */
const REQUIRED_TABLES = [
  'tts_results', // per-message TTS persistence (M4 follow-up)
  'session_chunks', // session-scoped RAG BM25 index (M3 deferred)
  'embedding_config', // admin-managed embedding provider (admin backend)
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('VERIFY-SCHEMA FAIL: DATABASE_URL not set');
    process.exit(1);
  }
  const db = initDb(databaseUrl);
  /* node-postgres driver surfaces raw results as { rows }; unwrap
     once so the checks below read plain row arrays. */
  const q = async <T>(s: ReturnType<typeof sql>): Promise<T[]> => {
    const res = (await db.execute(s)) as unknown as { rows?: T[] } | T[];
    return Array.isArray(res) ? res : (res.rows ?? []);
  };
  try {
    const rows = await q<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const present = new Set(rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    if (missing.length > 0) {
      console.error(
        `VERIFY-SCHEMA FAIL: missing relations: ${missing.join(', ')}\n` +
          '  → the matching Drizzle migration did not run. Check that the .sql file is\n' +
          '    registered in server/drizzle/meta/_journal.json, then re-run `npm run db:migrate`.',
      );
      process.exit(1);
    }

    /* Informational only: without the pgvector extension the
       session_chunks.embedding column + HNSW index are skipped by
       migration 0031 and retrieval degrades to BM25-only. Not fatal. */
    const ext = await q<unknown>(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
    );
    if (ext.length === 0) {
      console.warn(
        'VERIFY-SCHEMA WARN: pgvector extension absent — RAG runs BM25-only. ' +
          'Install postgresql-16-pgvector and CREATE EXTENSION vector to enable hybrid retrieval.',
      );
    } else {
      const cols = await q<unknown>(
        sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'session_chunks' AND column_name = 'embedding'`,
      );
      console.log(
        `VERIFY-SCHEMA OK: ${REQUIRED_TABLES.join(', ')} present; ` +
          `pgvector installed, embedding column ${cols.length > 0 ? 'present' : 'MISSING (re-run migrations)'}.`,
      );
      if (cols.length === 0) process.exit(1);
    }
    console.log(`VERIFY-SCHEMA OK: ${REQUIRED_TABLES.join(', ')} present.`);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('VERIFY-SCHEMA FAIL:', (err as Error).message);
  process.exit(1);
});
