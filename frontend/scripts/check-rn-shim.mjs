#!/usr/bin/env node
/*
 * scripts/check-rn-shim.mjs — keeps the retired RN shim at zero.
 *
 * ADR 0027 makes React DOM the only UI stack. packages/ui/src/react-web.tsx
 * reached zero importers on 2026-11-23 and was deleted; this guard counts any
 * new file that tries to import it (the baseline is 0) and rejects a recreated
 * shim. Adding an import fails.
 *
 * It also fails if package.json reintroduces a react-native dependency, which
 * would recreate the runtime this migration is removing.
 *
 * Usage:  node scripts/check-rn-shim.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(FRONTEND, '..');
const UI_SRC = join(REPO, 'packages', 'ui', 'src');
const BASELINE = join(FRONTEND, 'scripts', 'rn-shim.baseline.json');
const UPDATE = process.argv.includes('--update');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const shim = join(UI_SRC, 'react-web.tsx');
if (existsSync(shim)) {
  console.error('rn-shim check FAILED: packages/ui/src/react-web.tsx was deleted on 2026-11-23.');
  console.error('  Do not recreate the RN shim; use React DOM elements and CSS.');
  process.exit(1);
}

const importers = [];
for (const file of walk(UI_SRC)) {
  const text = readFileSync(file, 'utf8');
  if (/from\s+'(?:\.{1,2}\/)+react-web(?:\.tsx)?'/.test(text)) importers.push(file);
}
importers.sort();

const banned = [];
for (const pkg of ['package.json', 'frontend/package.json', 'packages/ui/package.json']) {
  const path = join(REPO, pkg);
  if (!existsSync(path)) continue;
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(parsed[field] || {})) {
      if (/^react-native(?:-web)?$/.test(name)) banned.push(`${pkg}: ${name}`);
    }
  }
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

if (!baseline || UPDATE) {
  const count =
    baseline && typeof baseline.files === 'number'
      ? Math.min(baseline.files, importers.length)
      : importers.length;
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        files: count,
        note: 'Files under packages/ui/src importing the retired react-web shim. The shim was deleted on 2026-11-23; the count stays at 0.',
        generatedBy: 'check-rn-shim.mjs --update',
      },
      null,
      2,
    )}\n`,
  );
  console.log(`rn-shim: baseline ${baseline ? 'updated' : 'written'} (files=${count}).`);
  process.exit(0);
}

let failed = false;
if (importers.length > baseline.files) {
  failed = true;
  console.error('rn-shim check FAILED:');
  console.error(`  ${importers.length} files import react-web, baseline ${baseline.files}.`);
  console.error('  Migrate the component to DOM elements instead of adding an import.');
  for (const file of importers) console.error(`  - ${relative(REPO, file).split(sep).join('/')}`);
}
if (banned.length) {
  failed = true;
  console.error('rn-shim check FAILED: react-native dependency reintroduced:');
  for (const entry of banned) console.error(`  - ${entry}`);
}
if (failed) {
  process.exitCode = 1;
} else {
  console.log(
    `rn-shim check passed (${importers.length}/${baseline.files} files; may only shrink).`,
  );
}
