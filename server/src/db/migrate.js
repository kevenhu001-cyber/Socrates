/**
 * Run Drizzle migrations programmatically.
 * Usage: node src/db/migrate.js
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { initDb, closeDb } from './index.js';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const db = initDb(databaseUrl);
  console.log('Running migrations…');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await closeDb();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
