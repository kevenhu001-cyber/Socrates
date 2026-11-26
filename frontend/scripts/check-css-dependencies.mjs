#!/usr/bin/env node
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

const RETIRED_FAMILIES = [
  /^--(?:text|bg|border|accent|brand|oncolor|surface)-\d+$/,
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
const errors = [];
for (const dir of ['legacy', 'restore']) {
  if (existsSync(join(STYLES, dir))) {
    errors.push(`styles/${dir}: put rules in the stylesheet for the surface they style`);
  }
}

for (const file of files) {
  const rel = relative(STYLES, file).split(sep).join('/');
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  root.walkDecls((decl) => {
    const names = [
      decl.prop,
      ...Array.from(decl.value.matchAll(/var\(\s*(--[\w-]+)/g), (match) => match[1]),
    ];
    for (const name of names) {
      if (RETIRED_FAMILIES.some((pattern) => pattern.test(name))) {
        errors.push(`${rel}:${decl.source.start.line}: retired theme variable ${name}`);
      }
    }
  });
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
if (VERBOSE) console.log(`Scanned ${files.length} stylesheets.`);
console.log('CSS dependencies check passed (no retired stylesheet trees or theme variables).');
