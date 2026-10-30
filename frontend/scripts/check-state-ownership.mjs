#!/usr/bin/env node
/*
 * scripts/check-state-ownership.mjs — React→state-ownership ratchet.
 *
 * React state reads and updates should go through typed selectors and actions
 * in src/store/index.ts. This guard freezes the remaining direct
 * stateStore.dispatch(...) writes in src/react/**, where string-keyed actions
 * bypass that boundary. Direct window access is covered by
 * check-react-globals.mjs.
 *
 * Usage: node scripts/check-state-ownership.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REACT = join(FRONTEND, 'src', 'react');
const BASELINE = join(FRONTEND, 'scripts', 'state-ownership.baseline.json');
const UPDATE = process.argv.includes('--update');
const ALLOWED_FILES = new Set(['legacy/gateway.ts']);

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function normaliseWindowAccess(text) {
  return text
    .replace(/\(\s*window\s+as\s+[^)]+\)/g, 'window')
    .replace(/window\s*\[\s*['"]([A-Za-z_$][\w$]*)['"]\s*\]/g, 'window.$1');
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

function collect() {
  const directDispatches = [];
  for (const file of walk(REACT)) {
    const rel = relative(REACT, file).split(sep).join('/');
    if (ALLOWED_FILES.has(rel)) continue;
    const text = normaliseWindowAccess(stripComments(readFileSync(file, 'utf8')));
    for (const match of text.matchAll(/(?:window\.)?stateStore\.dispatch\s*\(/g)) {
      directDispatches.push({ file: `src/react/${rel}`, line: lineAt(text, match.index) });
    }
  }
  return directDispatches;
}

function main() {
  const directDispatches = collect();
  const baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : null;
  const previous = baseline?.directDispatches;
  const limit = typeof previous === 'number'
    ? Math.min(previous, directDispatches.length)
    : directDispatches.length;

  if (!baseline || UPDATE) {
    writeFileSync(BASELINE, JSON.stringify({
      directDispatches: limit,
      note: 'React-side direct writes through the string-keyed stateStore facade. May only go down. Run with --update after an intentional reduction.',
      generatedBy: 'check-state-ownership.mjs --update',
    }, null, 2) + '\n');
    console.log(`state-ownership: baseline ${baseline ? 'updated' : 'written'} (directDispatches=${limit}).`);
    for (const item of directDispatches) console.log(`  - ${item.file}:${item.line}`);
    return;
  }

  if (directDispatches.length > limit) {
    console.error('state-ownership check FAILED:');
    console.error(`  directDispatches: ${directDispatches.length} > baseline ${limit} (+${directDispatches.length - limit}).`);
    for (const item of directDispatches) console.error(`  - ${item.file}:${item.line}`);
    console.error('  Route state access through the typed hooks in src/store/index.ts.');
    process.exitCode = 1;
    return;
  }

  console.log(`state-ownership check passed (${directDispatches.length}/${limit} allowed).`);
}

main();
