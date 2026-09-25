#!/usr/bin/env node
/*
 * scripts/check-drizzle-drift.mjs — guard the drizzle migration metadata.
 *
 * The failure this prevents
 * ------------------------
 * Migrations 0034 and 0035 were written by hand (idempotent SQL with
 * IF NOT EXISTS / pg_constraint guards) but never refreshed
 * `server/drizzle/meta/*_snapshot.json`. The snapshot therefore described a
 * schema two versions behind reality.
 *
 * On 2026-09-25 that came due: `npm run db:generate`, asked for nothing but a
 * new index, emitted a migration that ALSO re-issued three statements 0034
 * and 0035 had already applied — and emitted them in non-idempotent form:
 *
 *     ALTER TABLE "sessions" ADD COLUMN "assistant_id" uuid;
 *     ALTER TABLE "files" ADD CONSTRAINT "files_session_id_sessions_id_fk" ...
 *     CREATE INDEX "sessions_assistant_id_idx" ...
 *
 * Applied to production that aborts on "column already exists", which means a
 * failed deploy in the one part of the system with no easy rollback. The
 * generated file was caught by reading it, not by any check.
 *
 * What this script checks
 * -----------------------
 *   1. Every .sql file in drizzle/ has a journal entry, and vice versa.
 *      An orphan file never runs; an orphan entry breaks the migrator.
 *   2. Journal idx values are unique, gapless and ordered, and each tag
 *      matches its filename. A mismatch silently runs the wrong SQL.
 *   3. A snapshot exists for the latest migration. This is the drift
 *      detector: it is what 0034/0035 skipped.
 *   4. `drizzle-kit generate` produces NOTHING new. If the snapshot matches
 *      src/db/schema.ts there is nothing left to emit, so any output means
 *      the metadata and the schema disagree — exactly the state that yields a
 *      surprise non-idempotent migration. Runs in a scratch copy so the repo
 *      is never modified by the check.
 *   5. Hand-written migrations that add columns / constraints / indexes use
 *      the idempotent forms, since the repo's convention is that every
 *      migration is safe to re-run.
 *
 * Usage:  node scripts/check-drizzle-drift.mjs
 * Exit:   0 = clean, 1 = drift.
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER = join(ROOT, 'server');
const DRIZZLE = join(SERVER, 'drizzle');
const META = join(DRIZZLE, 'meta');

const problems = [];
const notes = [];
function fail(msg) { problems.push(msg); }

/* ── 1 + 2. Journal ↔ file consistency ─────────────────────────────── */

const journalPath = join(META, '_journal.json');
if (!existsSync(journalPath)) {
  fail('drizzle/meta/_journal.json is missing — the migrator has nothing to read.');
} else {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const entries = journal.entries ?? [];
  const sqlFiles = readdirSync(DRIZZLE).filter((f) => f.endsWith('.sql')).sort();

  const tags = entries.map((e) => e.tag);
  const fileTags = sqlFiles.map((f) => f.replace(/\.sql$/, ''));

  for (const tag of tags) {
    if (!fileTags.includes(tag)) {
      fail(`journal references "${tag}" but drizzle/${tag}.sql does not exist — the migrator will throw.`);
    }
  }
  for (const tag of fileTags) {
    if (!tags.includes(tag)) {
      fail(`drizzle/${tag}.sql has no journal entry — it will never be applied. ` +
           'Add an entry, or delete the file if it was superseded.');
    }
  }

  const seen = new Set();
  let previous = -1;
  for (const e of entries) {
    if (seen.has(e.idx)) fail(`duplicate journal idx ${e.idx} (tag "${e.tag}").`);
    seen.add(e.idx);
    if (e.idx !== previous + 1) {
      fail(`journal idx jumps from ${previous} to ${e.idx} (tag "${e.tag}"); entries must be gapless and ordered.`);
    }
    previous = e.idx;
    const expectedPrefix = String(e.idx).padStart(4, '0');
    if (!e.tag.startsWith(expectedPrefix)) {
      fail(`journal idx ${e.idx} carries tag "${e.tag}", which does not start with "${expectedPrefix}". ` +
           'A mismatch here applies a different file than the index implies.');
    }
  }

  /* ── 3. Snapshot present for the newest migration ─────────────────── */
  const last = entries[entries.length - 1];
  if (last) {
    const snapshots = readdirSync(META).filter((f) => /^\d+_snapshot\.json$/.test(f));
    const highestSnapshot = snapshots
      .map((f) => parseInt(f.slice(0, 4), 10))
      .sort((a, b) => a - b)
      .pop() ?? -1;
    if (highestSnapshot < last.idx) {
      fail(
        `the newest migration is idx ${last.idx} ("${last.tag}") but the newest snapshot is ` +
        `${highestSnapshot < 0 ? '(none)' : String(highestSnapshot).padStart(4, '0')}. ` +
        'This is the 0034/0035 failure mode: the next `db:generate` will re-emit ' +
        'already-applied DDL in non-idempotent form. Refresh with `npm run db:generate` ' +
        'in server/, keep meta/<idx>_snapshot.json, and hand-write the .sql if the ' +
        'generated statements include changes that are already live.',
      );
    } else {
      notes.push(`snapshot ${String(highestSnapshot).padStart(4, '0')} covers newest migration ${String(last.idx).padStart(4, '0')}`);
    }
  }
}

/* ── 5. Idempotency convention on hand-written SQL ─────────────────── */

const NON_IDEMPOTENT = [
  { re: /ALTER\s+TABLE\s+[^;]*?\bADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/is, what: 'ADD COLUMN without IF NOT EXISTS' },
  { re: /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY\s+IF\s+NOT\s+EXISTS)/im, what: 'CREATE INDEX without IF NOT EXISTS' },
  { re: /^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/im, what: 'CREATE TABLE without IF NOT EXISTS' },
];

/* Files predating the convention. Frozen: they are already applied
 * everywhere, so rewriting them would change history for no benefit. New
 * migrations must not be added here. */
const LEGACY_ALLOWLIST = new Set(
  readdirSync(DRIZZLE)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => parseInt(f.slice(0, 4), 10) <= 33),
);

for (const file of readdirSync(DRIZZLE).filter((f) => f.endsWith('.sql')).sort()) {
  if (LEGACY_ALLOWLIST.has(file)) continue;
  const sql = readFileSync(join(DRIZZLE, file), 'utf8');
  /* Strip comments and DO-block bodies: a guarded block is idempotent by
   * construction even though it contains a bare ADD COLUMN. */
  const stripped = sql
    .replace(/^\s*--.*$/gm, '')
    .replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, '');
  for (const { re, what } of NON_IDEMPOTENT) {
    if (re.test(stripped)) {
      fail(`drizzle/${file}: ${what}. Every migration in this repo must be safe to re-run; ` +
           'use IF NOT EXISTS or wrap the statement in a guarded DO $$ ... $$ block.');
    }
  }
}

/* ── 4. `db:generate` must have nothing to emit ────────────────────── */

let scratch = null;
try {
  scratch = mkdtempSync(join(tmpdir(), 'drizzle-drift-'));
  for (const entry of ['drizzle', 'src', 'drizzle.config.js', 'package.json', 'tsconfig.json']) {
    const from = join(SERVER, entry);
    if (existsSync(from)) cpSync(from, join(scratch, entry), { recursive: true });
  }
  /* drizzle-kit resolves from the server's own node_modules. Symlinking keeps
   * the copy cheap; a full copy of node_modules would dominate CI time. */
  const nm = join(SERVER, 'node_modules');
  if (existsSync(nm)) {
    execFileSync('ln', ['-s', nm, join(scratch, 'node_modules')]);
  }

  const before = new Set(readdirSync(join(scratch, 'drizzle')).filter((f) => f.endsWith('.sql')));
  execFileSync('npx', ['drizzle-kit', 'generate', '--config=drizzle.config.js'], {
    cwd: scratch, encoding: 'utf8', stdio: 'pipe', timeout: 180_000,
  });
  const after = readdirSync(join(scratch, 'drizzle')).filter((f) => f.endsWith('.sql'));
  const emitted = after.filter((f) => !before.has(f));

  if (emitted.length > 0) {
    const preview = emitted
      .map((f) => {
        const body = readFileSync(join(scratch, 'drizzle', f), 'utf8').trim();
        return `        ${f}:\n` + body.split('\n').map((l) => `          ${l}`).join('\n');
      })
      .join('\n');
    fail(
      'src/db/schema.ts and the drizzle snapshot disagree: `db:generate` still has ' +
      `${emitted.length} migration(s) to emit.\n` +
      '      Anything listed below is a change that exists in the schema but not in the\n' +
      '      recorded metadata. If it is ALREADY applied to production, the snapshot is\n' +
      '      stale (refresh it and hand-write an idempotent .sql). If it is genuinely\n' +
      '      new, commit the generated migration.\n' + preview,
    );
  } else {
    notes.push('db:generate has nothing to emit — schema and snapshot agree');
  }
} catch (err) {
  const detail = (err.stderr || err.stdout || err.message || '').toString().trim().split('\n').slice(-6).join('\n');
  fail(`could not run drizzle-kit generate to check for drift:\n      ${detail}\n` +
       '      Fix the tooling rather than skipping the check — this is the guard that ' +
       'stops a non-idempotent migration from reaching production.');
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}

/* ── Report ───────────────────────────────────────────────────────── */

for (const n of notes) console.log(`[drizzle] ok: ${n}`);

if (problems.length > 0) {
  console.error(`\n[drizzle] ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('[drizzle] migration metadata is consistent');
