#!/usr/bin/env node
/*
 * scripts/audit-ratchet.mjs — dependency audit gate with a reviewed baseline.
 *
 * Why not just `npm audit --audit-level=high`?
 * -------------------------------------------
 * Because the repo already carries a backlog. Before 2026-09-25 the only
 * audit in CI was `server-ci.yml`'s `npm audit --audit-level=high` with
 * `continue-on-error: true` — a report dressed as a check, which is how the
 * backlog accumulated unnoticed in the first place. Flipping that flag to
 * blocking would have turned every CI run red on day one, and a
 * permanently-red gate gets ignored exactly like a non-blocking one.
 *
 * So this follows the ratchet idiom the repo already uses for CSS debt
 * (frontend/scripts/check-css-debt.mjs + css-debt.baseline.json):
 *
 *   - Any high/critical advisory NOT in the baseline fails the build. New
 *     debt is blocked from the first run.
 *   - Advisories in the baseline are reported but tolerated, each with a
 *     written reason and, where relevant, the blocker.
 *   - A baseline entry that no longer reproduces is ALSO a failure, so the
 *     baseline shrinks and cannot silently rot. This is the part that makes
 *     it a ratchet rather than an ignore-list.
 *
 * Usage:
 *   node scripts/audit-ratchet.mjs <project>            # gate
 *   node scripts/audit-ratchet.mjs <project> --update    # re-record
 *
 * <project> is a directory containing package.json (frontend|server|mobile).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = `${ROOT}scripts/audit.baseline.json`;
const BLOCKING = new Set(['high', 'critical']);

const args = process.argv.slice(2);
const update = args.includes('--update');
const project = args.find((a) => !a.startsWith('--'));

if (!project) {
  console.error('usage: node scripts/audit-ratchet.mjs <frontend|server|mobile> [--update]');
  process.exit(2);
}

const cwd = `${ROOT}${project}`;
if (!existsSync(`${cwd}/package.json`)) {
  console.error(`[audit] no package.json in ${project}/`);
  process.exit(2);
}

/* `npm audit --json` exits non-zero when it finds anything, so the failure
 * is expected and the payload is on stdout either way. */
function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], {
      cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.trim()) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(runAudit());
const found = Object.entries(report.vulnerabilities ?? {})
  .filter(([, v]) => BLOCKING.has(v.severity))
  .map(([name, v]) => ({
    name,
    severity: v.severity,
    direct: Boolean(v.isDirect),
    // `range` is the vulnerable range, not the installed version — it is
    // the stable identity of the advisory as npm reports it.
    range: v.range,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { projects: {} };
const accepted = baseline.projects?.[project]?.accepted ?? [];
const acceptedNames = new Set(accepted.map((a) => a.name));

if (update) {
  baseline.projects ??= {};
  const previous = new Map(accepted.map((a) => [a.name, a]));
  baseline.projects[project] = {
    accepted: found.map((f) => ({
      ...f,
      reason: previous.get(f.name)?.reason
        ?? 'TODO: document why this is accepted, the real exposure, and what unblocks the fix',
    })),
  };
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(`[audit] ${project}: recorded ${found.length} accepted high/critical advisor${found.length === 1 ? 'y' : 'ies'}`);
  for (const f of found) console.log(`  ${f.severity} ${f.name} (${f.range})`);
  if (found.some((f) => !previous.has(f.name))) {
    console.log('\n[audit] new entries were written with a TODO reason — fill them in before committing.');
  }
  process.exit(0);
}

const foundNames = new Set(found.map((f) => f.name));
const newlyBroken = found.filter((f) => !acceptedNames.has(f.name));
const stale = accepted.filter((a) => !foundNames.has(a.name));

for (const f of found.filter((x) => acceptedNames.has(x.name))) {
  const entry = accepted.find((a) => a.name === f.name);
  console.log(`[audit] ${project}: accepted ${f.severity} ${f.name} — ${entry.reason}`);
}

let failed = false;

if (newlyBroken.length > 0) {
  failed = true;
  console.error(`\n[audit] ${project}: ${newlyBroken.length} NEW high/critical advisor${newlyBroken.length === 1 ? 'y' : 'ies'}:`);
  for (const f of newlyBroken) {
    console.error(`  ${f.severity} ${f.name} (${f.range})${f.direct ? ' [direct dependency]' : ''}`);
  }
  console.error(
    '\n  Fix it, or — if it is genuinely not exploitable here — record it with\n' +
    `  a written reason:  node scripts/audit-ratchet.mjs ${project} --update`,
  );
}

if (stale.length > 0) {
  failed = true;
  console.error(`\n[audit] ${project}: ${stale.length} baseline entr${stale.length === 1 ? 'y' : 'ies'} no longer reproduce${stale.length === 1 ? 's' : ''}:`);
  for (const a of stale) console.error(`  ${a.name}`);
  console.error(
    '\n  The ratchet only tightens. Shrink the baseline:\n' +
    `      node scripts/audit-ratchet.mjs ${project} --update`,
  );
}

if (failed) process.exit(1);

console.log(`[audit] ${project}: clean (${accepted.length} accepted, 0 new high/critical)`);
