#!/usr/bin/env node
/*
 * scripts/check-shadcn-retirement.mjs — monotonic ratchet retiring src/react/ui/shadcn.
 *
 * Counts:
 *   1. Remaining files under src/react/ui/shadcn/*.tsx
 *   2. Imports of ui/shadcn across src/**
 *
 * Counts may only go down as modules migrate to @openai/apps-sdk-ui (src/react/ui/v3).
 * Run with --update after an intentional reduction.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const SHADCN_DIR = join(SRC, 'react', 'ui', 'shadcn');
const BASELINE = join(ROOT, 'scripts', 'shadcn-retirement.baseline.json');
const UPDATE = process.argv.includes('--update');

function walk(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor-files') walk(full, results);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const shadcnFiles = existsSync(SHADCN_DIR)
  ? readdirSync(SHADCN_DIR).filter((name) => name.endsWith('.tsx')).length
  : 0;

let shadcnImports = 0;
const importRe = /from\s+['"][^'"]*ui\/shadcn(?:\/[^'"]*)?['"]/g;
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('src/react/ui/shadcn/')) continue;
  const text = readFileSync(file, 'utf8');
  const matches = text.match(importRe);
  if (matches) shadcnImports += matches.length;
}

const current = { shadcnFiles, shadcnImports };

if (UPDATE) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        ...current,
        note: 'Remaining src/react/ui/shadcn/*.tsx files and external imports. May only go down toward 0 as components migrate to @openai/apps-sdk-ui.',
        generatedBy: 'check-shadcn-retirement.mjs --update',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log('Updated shadcn-retirement baseline:', JSON.stringify(current));
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];
if (current.shadcnFiles > baseline.shadcnFiles) {
  failures.push(`shadcnFiles grew: ${current.shadcnFiles} > ${baseline.shadcnFiles}`);
}
if (current.shadcnImports > baseline.shadcnImports) {
  failures.push(`shadcnImports grew: ${current.shadcnImports} > ${baseline.shadcnImports}`);
}

if (failures.length) {
  console.error('shadcn-retirement check failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}

console.log(
  `shadcn-retirement check passed (${current.shadcnFiles}/${baseline.shadcnFiles} files, ${current.shadcnImports}/${baseline.shadcnImports} imports).`,
);
