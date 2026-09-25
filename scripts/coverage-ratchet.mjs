#!/usr/bin/env node
/*
 * scripts/coverage-ratchet.mjs — turn coverage from a number into a floor.
 *
 * Measuring coverage without a floor changes nothing: the 2026-09-25 review
 * found 132 test files and no coverage instrumentation at all, so the gate was
 * pass/fail with no way to tell whether a change was making things better or
 * worse. Printing a percentage would have been the same situation with extra
 * steps.
 *
 * So this follows the ratchet idiom the repo already uses for CSS debt and
 * dependency advisories:
 *
 *   - Coverage below the recorded floor fails the build.
 *   - Coverage meaningfully ABOVE the floor also fails, with an instruction to
 *     raise it. That is what makes it a ratchet: without it the floor rots
 *     while real coverage drifts up and back down inside the slack.
 *   - A small tolerance band absorbs the jitter from Node's V8 coverage, which
 *     is not bit-identical between runs (async timing changes which lines
 *     execute).
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs <server|frontend>            # gate
 *   node scripts/coverage-ratchet.mjs <server|frontend> --update   # re-record
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = `${ROOT}scripts/coverage.baseline.json`;

/* Dead band around the floor.
 *
 * Node's V8 coverage is NOT reproducible to the decimal: async timing decides
 * which lines happen to execute, so repeated runs of an unchanged tree differ.
 * Measured on this repo's frontend suite while building this script: branch
 * coverage read 69.88% and 70.00% on two consecutive runs of identical code —
 * a 0.12 spread. An exact floor therefore fails at random, and a gate that
 * fires on noise teaches people to bypass gates.
 *
 * JITTER is the downward tolerance: a drop smaller than this is measurement
 * noise, not a regression. It is deliberately larger than the observed spread.
 * SLACK is the upward tolerance before the ratchet asks to be tightened;
 * without it the floor rots while real coverage drifts up and back down inside
 * the gap. */
const JITTER = 0.5;
const SLACK = 2.0;

const args = process.argv.slice(2);
const update = args.includes('--update');
const project = args.find((a) => !a.startsWith('--'));

if (!project || !['server', 'frontend'].includes(project)) {
  console.error('usage: node scripts/coverage-ratchet.mjs <server|frontend> [--update]');
  process.exit(2);
}

/* Node's coverage reporter prints an "all files" summary row:
 *   ℹ all files   |  81.46 |    77.40 |   58.51 |
 * Parse that rather than re-deriving totals from per-file rows. */
function measure(proj) {
  let out;
  try {
    out = execSync('npm run test:coverage', {
      cwd: `${ROOT}${proj}`, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60 * 1000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
  } catch (err) {
    /* A failing test also fails coverage collection. Surface that clearly
     * rather than reporting "coverage dropped". */
    out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    if (!/all files/.test(out)) {
      console.error(`[coverage] ${proj}: the test run itself failed; fix the tests first.`);
      console.error(out.trim().split('\n').slice(-25).join('\n'));
      process.exit(1);
    }
  }

  const rows = out.split('\n').filter((l) => l.includes('all files'));
  const row = rows[rows.length - 1];
  if (!row) {
    console.error(`[coverage] ${proj}: could not find the "all files" summary row.`);
    console.error(out.trim().split('\n').slice(-25).join('\n'));
    process.exit(1);
  }
  const nums = row.match(/\d+\.\d+/g);
  if (!nums || nums.length < 3) {
    console.error(`[coverage] ${proj}: unexpected summary row: ${row}`);
    process.exit(1);
  }
  const [line, branch, func] = nums.map(Number);
  return { line, branch, func };
}

const measured = measure(project);
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};

if (update) {
  baseline[project] = {
    line: measured.line,
    branch: measured.branch,
    func: measured.func,
    recorded: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(`[coverage] ${project}: floor recorded — line ${measured.line}% branch ${measured.branch}% func ${measured.func}%`);
  process.exit(0);
}

const floor = baseline[project];
if (!floor) {
  console.error(`[coverage] no floor recorded for "${project}".\n` +
                `           Record it with: node scripts/coverage-ratchet.mjs ${project} --update`);
  process.exit(1);
}

const METRICS = [
  ['line', 'lines'],
  ['branch', 'branches'],
  ['func', 'functions'],
];

const regressions = [];
const improvements = [];
for (const [key, label] of METRICS) {
  const now = measured[key];
  const min = floor[key];
  if (now < min - JITTER) {
    regressions.push(`${label}: ${now.toFixed(2)}% is ${(min - now).toFixed(2)} below the ${min.toFixed(2)}% floor`);
  } else if (now > min + SLACK) {
    improvements.push(`${label}: ${now.toFixed(2)}% vs floor ${min.toFixed(2)}% (+${(now - min).toFixed(2)})`);
  }
}

console.log(`[coverage] ${project}: line ${measured.line}% branch ${measured.branch}% func ${measured.func}% ` +
            `(floor ${floor.line}/${floor.branch}/${floor.func}, recorded ${floor.recorded})`);

if (regressions.length > 0) {
  console.error(`\n[coverage] ${project}: coverage regressed:`);
  for (const r of regressions) console.error(`  - ${r}`);
  console.error('\n  Add tests for the code this change introduced. Lowering the floor is\n' +
                '  a deliberate act: it needs a reason in the commit message.');
  process.exit(1);
}

if (improvements.length > 0) {
  console.error(`\n[coverage] ${project}: coverage improved past the floor — raise it:`);
  for (const i of improvements) console.error(`  - ${i}`);
  console.error(`\n  Run: node scripts/coverage-ratchet.mjs ${project} --update\n` +
                '  (A floor left behind by real progress stops protecting anything.)');
  process.exit(1);
}

console.log(`[coverage] ${project}: at or just above the floor`);
