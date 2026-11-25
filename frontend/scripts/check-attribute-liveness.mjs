#!/usr/bin/env node
/*
 * scripts/check-attribute-liveness.mjs — every `[data-*]` selector in the
 * canonical stylesheets must have a producer in the first-party source.
 *
 * A class-based liveness check (check-frozen-liveness.mjs) catches dead class
 * rules, but attribute selectors are a second DOM contract: `[data-foo]` can
 * keep a rule alive for years after the code that wrote `data-foo` is gone.
 * This guard extracts every data attribute used by a canonical stylesheet and
 * proves that one of these producers still writes it:
 *
 *   - a literal `data-foo` in TS/TSX/JS/MJS/HTML,
 *   - `dataset.fooBar` (camelCase maps to data-foo-bar),
 *   - a key inside `dataAttributes({ fooBar: ... })`,
 *   - `setAttribute('data-foo', ...)`.
 *
 * Vendor attributes owned by Radix/shadcn are allowlisted: the app does not
 * spell them, the primitive does.
 *
 * Both canonical and frozen `legacy/` sheets are in scope. Fixed zero
 * invariant, no baseline.
 *
 * Usage:
 *   node scripts/check-attribute-liveness.mjs [--verbose]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(FRONTEND, '..');
const STYLES = join(FRONTEND, 'src', 'styles');
const VERBOSE = process.argv.includes('--verbose');
if (process.argv.slice(2).some((arg) => arg !== '--verbose')) {
  console.error('Usage: node scripts/check-attribute-liveness.mjs [--verbose]');
  process.exit(1);
}

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.mjs', '.html'];
const SKIP = new Set([
  'node_modules',
  'dist',
  '.git',
  'test-results',
  'debug',
  'coverage',
  'styles',
  'vendor-files',
  '.vite',
  '.tmp-repro',
]);

const VENDOR_ATTRIBUTES = new Set([
  'data-slot',
  'data-state',
  'data-orientation',
  'data-side',
  'data-align',
  'data-variant',
  'data-size',
  'data-disabled',
  'data-placeholder',
  'data-highlighted',
  'data-selected',
  'data-open',
  'data-closed',
  'data-starting-style',
  'data-ending-style',
  'data-transition',
  'data-scroll',
  'data-nested',
  'data-type',
  'data-value',
  'data-focus',
  'data-focus-visible',
  'data-hover',
  'data-press',
  'data-checked',
  'data-unchecked',
]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name) && !entry.name.startsWith('.tmp-')) walk(path, out);
    } else if (SOURCE_EXT.some((ext) => entry.name.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

const kebab = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

const producers = new Set();
const addProducer = (name) => producers.add(`data-${kebab(name)}`);

const corpus = [
  ...walk(join(FRONTEND, 'src')),
  ...walk(join(FRONTEND, 'test')),
  ...walk(join(FRONTEND, 'e2e')),
  ...walk(join(REPO, 'packages')),
  ...walk(join(REPO, 'server', 'src')),
  join(FRONTEND, 'index.html'),
];

for (const file of corpus) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bdata-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) {
    producers.add(match[0]);
  }
  for (const match of text.matchAll(/\bdataset\.([A-Za-z_$][\w$]*)/g)) {
    addProducer(match[1]);
  }
  for (const match of text.matchAll(/\bsetAttribute\(\s*['"]data-([a-z0-9-]+)/g)) {
    producers.add(`data-${match[1]}`);
  }
  for (const block of text.matchAll(/\bdataAttributes\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const key of block[1].matchAll(
      /(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/g,
    )) {
      addProducer(key[1] ?? key[2] ?? key[3]);
    }
  }
}

const cssFiles = [];
function walkCss(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCss(path);
    } else if (entry.name.endsWith('.css')) {
      cssFiles.push(path);
    }
  }
}
walkCss(STYLES);

const used = new Map();
for (const file of cssFiles) {
  const rel = relative(STYLES, file).split(sep).join('/');
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  root.walkRules((rule) => {
    for (const match of rule.selector.matchAll(/\[(data-[a-z0-9-]+)(?:[~|^$*]?=[^\]]*)?\]/g)) {
      const name = match[1];
      if (!used.has(name)) used.set(name, []);
      used.get(name).push(`${rel}:${rule.source?.start?.line ?? '?'}`);
    }
  });
}

const errors = [];
for (const [name, locations] of used) {
  if (producers.has(name) || VENDOR_ATTRIBUTES.has(name)) continue;
  errors.push(`${name} has no producer (used at ${locations.join(', ')})`);
}

if (VERBOSE) {
  console.log(
    `scanned ${cssFiles.length} stylesheets, ${used.size} data attributes; ${producers.size} producers seen`,
  );
}

if (errors.length) {
  console.error(`\ncheck-attribute-liveness: ${errors.length} dead data-attribute selector(s)\n`);
  for (const error of errors) console.error(`  ${error}`);
  console.error(
    '\nEither write the attribute from first-party code or add it to VENDOR_ATTRIBUTES if a primitive owns it.',
  );
  process.exit(1);
}

console.log(
  `check-attribute-liveness: ${used.size} data-attribute selectors all have a producer (or vendor owner).`,
);
