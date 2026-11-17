#!/usr/bin/env node
/**
 * Freeze the milestone-marker dialect that `docs/architecture/naming.md`
 * already forbids.
 *
 * The rule is not new: naming.md says "Do not add milestone codes (`M1`,
 * `P_*`, `B6 batch`) to new code; put the rationale in the commit or an ADR."
 * In practice the tree carried 660 of them, because nothing enforced the rule.
 * A marker like `P_recents-amplify` or `Extracted from main.js L9169-L9566`
 * points at a refactor batch that no longer exists, so a reader cannot verify
 * it and cannot use it.
 *
 * This is a freeze, not a cleanup: the baseline may only shrink. New code
 * states the invariant ("why this must stay true") and links an ADR instead.
 *
 * Usage:  node scripts/check-milestone-markers.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts', 'milestone-markers.baseline.json');
const UPDATE = process.argv.includes('--update');
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

const ROOTS = ['frontend/src', 'server/src', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'vendor-files',
  'assets',
  'coverage',
  'generated',
]);
const SOURCE_EXT = /\.(?:ts|tsx|js|mjs|cjs)$/;

/* Each pattern is a code the naming rule names explicitly, or the
 * "extracted from <deleted file> at line N" shape that replaces a reason. */
const PATTERNS = {
  milestone: /\bP_[a-z][a-z0-9-]*/g,
  deletedFile: /\bmain\.js\b/g,
  batch: /\bB\d+\s+batch\b/g,
  region: /\bregion\s+\d+/g,
  wave: /\bWave\s+-?\d/g,
};

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path, out);
    } else if (SOURCE_EXT.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(join(ROOT, root), []));
const totals = Object.fromEntries(Object.keys(PATTERNS).map((key) => [key, 0]));
const perFile = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  let fileCount = 0;
  for (const [key, pattern] of Object.entries(PATTERNS)) {
    const count = (text.match(pattern) || []).length;
    totals[key] += count;
    fileCount += count;
  }
  if (fileCount)
    perFile.push({ file: relative(ROOT, file).replaceAll('\\', '/'), count: fileCount });
}

const count = Object.values(totals).reduce((sum, value) => sum + value, 0);
const breakdown = Object.entries(totals)
  .map(([key, value]) => `${key}=${value}`)
  .join(', ');

if (UPDATE) {
  if (count > baseline.count) {
    console.error(`Refusing to raise milestone-marker baseline (${baseline.count} → ${count}).`);
    process.exit(1);
  }
  if (count < baseline.count) {
    writeFileSync(BASELINE, `${JSON.stringify({ count }, null, 2)}\n`);
    console.log(`Milestone-marker baseline shrank: ${baseline.count} → ${count} (${breakdown}).`);
  } else {
    console.log(`Milestone-marker baseline unchanged: ${baseline.count} (${breakdown}).`);
  }
} else if (count > baseline.count) {
  console.error(`Milestone markers ${count} exceed baseline ${baseline.count} (${breakdown}).`);
  console.error('State the invariant and link an ADR instead of naming the refactor batch.');
  console.error(
    perFile
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((entry) => `${entry.file}: ${entry.count}`)
      .join('\n'),
  );
  process.exit(1);
} else {
  console.log(`Milestone-marker check passed (${count}/${baseline.count}; ${breakdown}).`);
}
