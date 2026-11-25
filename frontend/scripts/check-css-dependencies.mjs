#!/usr/bin/env node
/*
 * scripts/check-css-dependencies.mjs — no canonical CSS may read a custom
 * property that only the frozen compatibility trees define.
 *
 * `styles/legacy/` is scheduled for retirement. A
 * canonical owner (`components/`, `features/`, `foundations/`, `layout/`,
 * `parity/`, `polish/`, `tokens.css`, `themes.css`) must not depend on a
 * variable that exists only in one of those trees: deleting the frozen file
 * would silently drop the declaration and the live surface would fall back to
 * a browser default.
 *
 * The guard also rejects live reads of the theme families that were retired
 * on 2026-11-26 (`--lobe-*`, `--chatgpt-*`, `--cg-*` palette roles,
 * `--conversation-*` palette roles, `--chat-*` palette roles). The frozen
 * tree may keep its compatibility reads until it is deleted, but new
 * canonical code may only speak `--ui-*`, shadcn roles and local geometry.
 *
 * It is a fixed zero invariant: there is no baseline and no update mode.
 *
 * Usage:
 *   node scripts/check-css-dependencies.mjs [--verbose]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const VERBOSE = process.argv.includes('--verbose');
if (process.argv.slice(2).some((arg) => arg !== '--verbose')) {
  console.error('Usage: node scripts/check-css-dependencies.mjs [--verbose]');
  process.exit(1);
}

const FROZEN_DIRS = ['legacy'];
const RETIRED_FAMILIES = [
  /^--lobe-/,
  /^--chatgpt-/,
  /^--chat-page$/,
  /^--chat-surface$/,
  /^--chat-control(-hover)?$/,
  /^--chat-line$/,
  /^--chat-text$/,
  /^--chat-muted$/,
  /^--chat-overlay$/,
  /^--conversation-(page|surface|control|control-hover|border|text|text-muted|text-secondary|user|user-text)$/,
  /^--cg-(page|rail|surface|surface-hover|surface-raised|border|border-strong|text|text-secondary|text-muted|text-faint|accent|accent-strong|accent-ink|danger|font)$/,
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

const files = walk(STYLES);
const defs = new Map();
const refs = [];
for (const file of files) {
  const rel = relative(STYLES, file).split(sep).join('/');
  const css = readFileSync(file, 'utf8');
  const root = postcss.parse(css, { from: file });
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) {
      if (!defs.has(decl.prop)) defs.set(decl.prop, new Set());
      defs.get(decl.prop).add(rel);
    }
    if (decl.value.includes('var(')) {
      for (const match of decl.value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        refs.push({ name: match[1], file: rel, line: decl.source?.start?.line ?? 0 });
      }
    }
  });
}

const tree = (rel) => (FROZEN_DIRS.some((dir) => rel.startsWith(`${dir}/`)) ? 'frozen' : 'canonical');
const errors = [];
const retired = new Map();

for (const ref of refs) {
  if (tree(ref.file) === 'frozen') continue;
  if (RETIRED_FAMILIES.some((pattern) => pattern.test(ref.name))) {
    errors.push(
      `${ref.file}:${ref.line}: canonical CSS reads retired theme variable ${ref.name}; use the --ui-* role instead`,
    );
    continue;
  }
  const declared = defs.get(ref.name);
  if (!declared) continue;
  const hasCanonical = [...declared].some((decl) => tree(decl) === 'canonical');
  const frozenDecl = [...declared].find((decl) => tree(decl) === 'frozen');
  if (!hasCanonical && frozenDecl) {
    errors.push(
      `${ref.file}:${ref.line}: canonical CSS reads ${ref.name}, which is only defined in ${frozenDecl}; move the definition to tokens.css or a canonical owner`,
    );
  }
}

if (VERBOSE) {
  console.log(`scanned ${files.length} stylesheets, ${refs.length} var() reads`);
  for (const [name, declared] of defs) {
    if (RETIRED_FAMILIES.some((pattern) => pattern.test(name))) {
      retired.set(name, [...declared]);
    }
  }
  if (retired.size) {
    console.log('\nRetired families still defined in frozen trees (expected until deletion):');
    for (const [name, declared] of retired) console.log(`  ${name} — ${declared.join(', ')}`);
  }
}

if (errors.length) {
  console.error(`\ncheck-css-dependencies: ${errors.length} violation(s)\n`);
  for (const error of errors) console.error(`  ${error}`);
  console.error(
    '\nCanonical CSS must not depend on frozen legacy/restore definitions, and must not read retired theme families.',
  );
  process.exit(1);
}

console.log(
  `check-css-dependencies: ${files.length} stylesheets scanned; canonical CSS has no frozen-only variable dependency and no retired theme-family read.`,
);
