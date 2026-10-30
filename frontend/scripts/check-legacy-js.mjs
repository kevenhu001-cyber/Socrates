#!/usr/bin/env node
/*
 * scripts/check-legacy-js.mjs — keep first-party SPA source in TypeScript.
 *
 * `frontend/tsconfig.json` has `allowJs: false`. This guard additionally
 * freezes the exact first-party `.js` / `.mjs` / `.cjs` / `.jsx` path set so
 * a new JavaScript module cannot evade the TypeScript include set.
 *
 * The baseline is now empty. Future frontend source belongs in `.ts`/`.tsx`;
 * `--update` remains shrink-only and refuses to absorb new JavaScript paths.
 *
 * Vendored UMD bundles (`src/vendor-files/**`) are third-party bytes and are
 * not counted.
 *
 * Usage:  node scripts/check-legacy-js.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(FRONTEND, 'src');
const BASELINE = join(FRONTEND, 'scripts', 'legacy-js.baseline.json');
const UPDATE = process.argv.includes('--update');
const SKIP_DIRS = new Set(['vendor-files', 'node_modules']);
const LEGACY_EXT = /\.(?:[cm]?js|jsx)$/;

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path, out);
    } else if (LEGACY_EXT.test(entry.name)) {
      out.push(relative(FRONTEND, path).split(sep).join('/'));
    }
  }
  return out;
}

const files = walk(SRC, []).sort();
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

function writeBaseline(next) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      { count: next.length, files: next, generatedBy: 'check-legacy-js.mjs --update' },
      null,
      2,
    ) + '\n',
  );
}

const baselineFiles = Array.isArray(baseline?.files) ? baseline.files : [];
const baselineSet = new Set(baselineFiles);
const currentSet = new Set(files);
const added = files.filter((file) => !baselineSet.has(file));
const removed = baselineFiles.filter((file) => !currentSet.has(file));

if (!baseline) {
  writeBaseline(files);
  console.log(`legacy JS: no baseline found — wrote scripts/legacy-js.baseline.json (${files.length} files).`);
  console.log('Commit the baseline; growth beyond it now fails.');
} else if (UPDATE) {
  /* Shrink-only: an update may drop known paths, never add new ones. */
  if (added.length) {
    console.error('legacy JS baseline update refused: new JS paths are not allowed.');
    console.error('Write new frontend modules in TypeScript instead:');
    for (const file of added) console.error(`  ${file}`);
    process.exitCode = 1;
  } else {
    writeBaseline(files);
    console.log(`legacy JS: baseline updated to ${files.length} paths (the allow-list only shrinks).`);
  }
} else {
  const failures = [];
  if (baseline.count !== baselineFiles.length) {
    failures.push(`baseline count ${baseline.count} does not match its ${baselineFiles.length} paths; run --update after reviewing the inventory`);
  }
  if (added.length) {
    failures.push('new untyped JavaScript paths are not allowed; write new frontend modules in TypeScript:');
    for (const file of added) failures.push(`  ${file}`);
  }
  if (removed.length) {
    failures.push('the inventory has shrunk; review the migration and run --update to record removed paths:');
    for (const file of removed) failures.push(`  ${file}`);
  }

  if (failures.length) {
    console.error('legacy JS check FAILED:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`legacy JS check passed (${files.length} paths match the frozen allow-list).`);
  }
}
