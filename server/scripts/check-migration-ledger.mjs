#!/usr/bin/env node
/*
 * server/scripts/check-migration-ledger.mjs — read-only verification that
 * the database actually carries the migrations the repository declares.
 *
 * WHY THIS EXISTS
 * ---------------
 * Migration 0045 repairs the two foreign keys on `scheduled_tasks`. The
 * repository has always carried the file, but the last explicit production
 * audit says "not yet executed", and the root cause of the missing keys was
 * never diagnosed: `0018_add_status_monitor_events.sql` creates
 * `scheduled_tasks` WITHOUT `IF NOT EXISTS` while its sibling table has a
 * guarded `DO` block. If the table was created outside the migrator, that
 * file fails on its FIRST statement and the `ADD CONSTRAINT` lines never
 * run — which is exactly what "the foreign keys are missing in production"
 * looks like.
 *
 * This script answers that question without guessing: it compares the
 * migration ledger in the database with the journal in the repository,
 * migration by migration, and checks the foreign keys themselves.
 *
 * IT NEVER WRITES. Every statement below is a SELECT. The script refuses
 * to run without an explicit DATABASE_URL so it can never touch a
 * database by accident.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host/db node scripts/check-migration-ledger.mjs
 *   DATABASE_URL=... node scripts/check-migration-ledger.mjs --json
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const JOURNAL = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
const JSON_OUTPUT = process.argv.includes('--json');

/* The two foreign keys 0045 restores. The names are the ones 0018 declared,
 * so a database that carries them was migrated through the normal path. */
const SCHEDULED_TASK_FOREIGN_KEYS = [
  { name: 'scheduled_tasks_user_id_users_id_fk', rule: 'c' },
  { name: 'scheduled_tasks_session_id_sessions_id_fk', rule: 'n' },
];

function loadJournal() {
  const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
  return (journal.entries ?? []).map((entry) => ({
    idx: entry.idx,
    tag: entry.tag,
    when: entry.when,
  }));
}

async function readLedger(client) {
  const result = await client.query(
    'select count(*)::int as count, max(created_at)::bigint as newest from drizzle.__drizzle_migrations',
  );
  const rows = await client.query('select created_at::bigint as created_at from drizzle.__drizzle_migrations order by created_at');
  return {
    count: result.rows[0]?.count ?? 0,
    newest: result.rows[0]?.newest ?? null,
    appliedAt: rows.rows.map((row) => String(row.created_at)),
  };
}

async function readForeignKeys(client) {
  const result = await client.query(
    `select con.conname, con.confdeltype, con.convalidated
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
      where rel.relname = 'scheduled_tasks' and con.contype = 'f'`,
  );
  return result.rows;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('check-migration-ledger: DATABASE_URL is required. This script only runs SELECTs.');
    process.exit(2);
  }

  const journal = loadJournal();
  const client = new pg.Client({ connectionString });
  await client.connect();
  const report = { ok: false, journal: journal.length, ledger: 0, missing: [], extra: [], foreignKeys: [], problems: [], notes: [] };
  try {
    const ledger = await readLedger(client);
    report.ledger = ledger.count;

    /* Drizzle records the journal's `when` value as the row's created_at, so
     * the two sets can be compared migration by migration — the exact
     * migration that was skipped is named, not guessed. */
    const applied = new Set(ledger.appliedAt);
    const expected = new Set(journal.map((entry) => String(entry.when)));
    report.missing = journal.filter((entry) => !applied.has(String(entry.when))).map((entry) => entry.tag);
    report.extra = [...applied].filter((when) => !expected.has(when));

    const foreignKeys = await readForeignKeys(client);
    report.foreignKeys = foreignKeys.map((row) => ({ name: row.conname, deleteRule: row.confdeltype, validated: row.convalidated }));
    for (const expectedKey of SCHEDULED_TASK_FOREIGN_KEYS) {
      const found = foreignKeys.find((row) => row.conname === expectedKey.name);
      if (!found) {
        report.problems.push(`scheduled_tasks is missing the foreign key ${expectedKey.name}`);
        continue;
      }
      if (!found.convalidated) {
        report.problems.push(`scheduled_tasks.${expectedKey.name} exists but is NOT VALIDATED`);
      }
      if (found.confdeltype !== expectedKey.rule) {
        report.problems.push(
          `scheduled_tasks.${expectedKey.name} has ON DELETE ${found.confdeltype}, expected ${expectedKey.rule}`,
        );
      }
    }

    if (report.missing.length > 0) {
      report.problems.push(`${report.missing.length} migration(s) in the journal are not in the ledger: ${report.missing.join(', ')}`);
    }
    /* Ledger rows that match no journal entry are informational, not a
     * fault: a database that was migrated from an earlier revision of the
     * journal carries the timestamps that revision recorded. The
     * actionable direction is the other one — a journal migration with no
     * ledger row. */
    report.notes = report.extra.length > 0
      ? [`${report.extra.length} ledger row(s) match no journal entry (the database was migrated from an earlier journal revision)`]
      : [];
    report.ok = report.problems.length === 0;
  } finally {
    await client.end();
  }

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[ledger] journal entries: ${report.journal}`);
    console.log(`[ledger] applied rows:    ${report.ledger}`);
    if (report.missing.length === 0) console.log('[ledger] every migration in the journal is recorded');
    else console.log(`[ledger] NOT applied:     ${report.missing.join(', ')}`);
    console.log('[ledger] scheduled_tasks foreign keys:');
    for (const key of report.foreignKeys) {
      console.log(`  ${key.name} (ON DELETE ${key.deleteRule}, validated=${key.validated})`);
    }
    for (const note of report.notes) console.log(`[ledger] note: ${note}`);
    for (const problem of report.problems) console.error(`[ledger] problem: ${problem}`);
  }

  if (!report.ok) {
    console.error(
      '\n[ledger] The database does not match the repository migrations.\n' +
      '         Apply the missing migrations with the normal Drizzle migrator (npm run db:migrate)\n' +
      '         — do NOT execute SQL by hand and do NOT edit the ledger to make it match.',
    );
    process.exit(1);
  }
  console.log('[ledger] the database matches the repository migrations');
}

main().catch((error) => {
  console.error('[ledger] check failed:', error?.message || error);
  process.exit(2);
});
