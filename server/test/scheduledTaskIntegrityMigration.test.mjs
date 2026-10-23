import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { assertTestDatabaseUrl } from '../src/lib/testDatabaseSafety.js';

test('0045 archives orphan evidence and restores cascading FKs atomically and idempotently', { skip: !process.env.DATABASE_URL }, async () => {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `migration_test_${suffix}`, ops = `migration_archive_${suffix}`;
  const owner = randomUUID(), missingOwner = randomUUID(), session = randomUUID();
  const orphan = randomUUID(), missingSession = randomUUID(), valid = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema};
      CREATE TABLE ${schema}.users(id uuid PRIMARY KEY);
      CREATE TABLE ${schema}.sessions(id uuid PRIMARY KEY);
      CREATE TABLE ${schema}.scheduled_tasks(id uuid PRIMARY KEY, user_id uuid NOT NULL, session_id uuid, title text, status text);
      CREATE TABLE ${schema}.scheduled_task_leases(task_id uuid PRIMARY KEY REFERENCES ${schema}.scheduled_tasks(id) ON DELETE CASCADE, state text);
    `);
    await client.query(`INSERT INTO ${schema}.users VALUES($1)`, [owner]);
    await client.query(`INSERT INTO ${schema}.sessions VALUES($1)`, [session]);
    await client.query(`INSERT INTO ${schema}.scheduled_tasks VALUES($1,$2,NULL,'orphan','active'),($3,$4,$5,'lost session','active'),($6,$4,$7,'valid','active')`, [orphan, missingOwner, missingSession, owner, randomUUID(), valid, session]);
    await client.query(`INSERT INTO ${schema}.scheduled_task_leases VALUES($1,'running')`, [orphan]);
    // Isolated schemas + rollback: this test never alters application tables,
    // even when other DB-backed suites run concurrently in this test database.
    const migration = readFileSync(new URL('../drizzle/0045_repair_scheduled_task_integrity.sql', import.meta.url), 'utf8')
      .replaceAll('public.', `${schema}.`).replaceAll('"ops"', `"${ops}"`);
    await client.query(migration);
    await client.query(migration);
    const archive = await client.query(`SELECT reason,task,lease FROM ${ops}.scheduled_task_orphan_archive ORDER BY reason`);
    assert.equal(archive.rows.length, 2);
    assert.equal(archive.rows.find((r) => r.reason === 'missing_owner').lease.state, 'running');
    assert.equal(archive.rows.find((r) => r.reason === 'missing_owner').task.id, orphan);
    const tasks = await client.query(`SELECT id,session_id FROM ${schema}.scheduled_tasks ORDER BY title`);
    assert.equal(tasks.rows.length, 2);
    assert.equal(tasks.rows.find((r) => r.id === missingSession).session_id, null);
    const keys = await client.query('SELECT convalidated FROM pg_constraint WHERE conrelid=$1::regclass AND contype=\'f\'', [`${schema}.scheduled_tasks`]);
    assert.equal(keys.rows.length, 2);
    assert.ok(keys.rows.every((r) => r.convalidated));
    await client.query(`DELETE FROM ${schema}.sessions WHERE id=$1`, [session]);
    assert.equal((await client.query(`SELECT session_id FROM ${schema}.scheduled_tasks WHERE id=$1`, [valid])).rows[0].session_id, null);
    await client.query(`DELETE FROM ${schema}.users WHERE id=$1`, [owner]);
    assert.equal((await client.query(`SELECT count(*) FROM ${schema}.scheduled_tasks`)).rows[0].count, '0');
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
