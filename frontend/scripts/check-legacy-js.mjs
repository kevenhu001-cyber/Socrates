#!/usr/bin/env node
/*
 * scripts/check-legacy-js.mjs — freeze the untyped half of the SPA.
 *
 * `frontend/tsconfig.json` runs with `allowJs: true, checkJs: false`: the
 * `.js` modules are bundled, imported by typed code, and never type-checked.
 * `npm run lint` therefore reports a clean `tsc` even though 206 first-party
 * files (as of 2026-10-17) sit outside `strict`. The migration is real — the
 * extracted modules under `src/` are `.ts` — but nothing stops the next
 * helper from being written in `.js` and quietly widening that hole.
 *
 * This ratchet freezes the current set instead of demanding a big-bang
 * conversion. New frontend source is `.ts`/`.tsx`; converting a file to TS
 * lowers the baseline with `--update`.
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
const LEGACY_EXT = /\.jsx?$/;

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

if (!baseline) {
  writeBaseline(files);
  console.log(`legacy JS: no baseline found — wrote scripts/legacy-js.baseline.json (${files.length} files).`);
  console.log('Commit the baseline; growth beyond it now fails.');
} else if (UPDATE) {
  /* Shrink-only: an update may drop files, never add one. */
  const allowed = new Set(baseline.files ?? files);
  const next = files.filter((file) => allowed.has(file));
  writeBaseline(next);
  console.log(`legacy JS: baseline updated to ${next.length} files (counts only ever shrink).`);
} else if (files.length > baseline.count) {
  const known = new Set(baseline.files ?? []);
  const added = files.filter((file) => !known.has(file));
  console.error(
    `legacy JS check FAILED: ${files.length} > baseline ${baseline.count} (+${files.length - baseline.count}).`,
  );
  console.error('Write new frontend modules in TypeScript instead:');
  for (const file of added) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log(
    `legacy JS check passed (${files.length}/${baseline.count} untyped .js files under src/; baseline only shrinks).`,
  );
}
