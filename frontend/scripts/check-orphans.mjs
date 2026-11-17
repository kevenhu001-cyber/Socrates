#!/usr/bin/env node
/**
 * Fail when a first-party frontend module has no inbound edge.
 *
 * A file that nothing imports is not "dead weight we might use later" — it is
 * a module every reader has to open, classify, and then discover is unused.
 * The 2026-11 audit found a 204-line hook, a wave loader, an artifact host,
 * and eight shadcn components in exactly that state.
 *
 * The rule is deliberately conservative: a file is only reported when NO
 * tracked file imports it. Files reachable only from a test are therefore not
 * reported — that is a separate decision (wire it or delete it with its test),
 * not something this guard should force.
 *
 * Usage:
 *   node scripts/check-orphans.mjs            # gate
 *   node scripts/check-orphans.mjs --update   # lower the baseline
 */
import { createRequire } from 'node:module';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const ts = requireFrontend('typescript');

const SRC = path.join(frontendRoot, 'src');
const baselinePath = path.join(frontendRoot, 'scripts', 'orphans.baseline.json');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'vendor-files', 'coverage', '.tmp-']);
const SOURCE_EXT = /\.(?:ts|tsx)$/;
const SCAN_ROOTS = [
  path.join(frontendRoot, 'src'),
  path.join(frontendRoot, 'test'),
  path.join(frontendRoot, 'e2e'),
  path.join(repoRoot, 'scripts'),
];

async function walk(directory, results = []) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return results;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.tmp-'))
        await walk(full, results);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(?:ts|tsx|mjs|js)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    results.push(full);
  }
  return results;
}

const allFiles = [];
for (const root of SCAN_ROOTS) await walk(root, allFiles);

const srcFiles = allFiles.filter((file) => file.startsWith(SRC + path.sep));
const fileSet = new Set(srcFiles);

/** Resolve a relative or `@/` specifier to a file in `src/`. */
function resolveSpecifier(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function specifiersOf(filePath, text) {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const specifiers = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

const referenced = new Set();
for (const file of allFiles) {
  const text = await readFile(file, 'utf8');
  for (const specifier of specifiersOf(file, text)) {
    const target = resolveSpecifier(file, specifier);
    if (target) referenced.add(target);
  }
}

/* `index.html` loads the entry directly; it has no JS importer by design. */
const ENTRY = path.join(SRC, 'main.ts');
const orphans = srcFiles
  .filter((file) => file !== ENTRY && !referenced.has(file))
  .map((file) => path.relative(frontendRoot, file).replaceAll('\\', '/'))
  .sort();

if (process.argv.includes('--update')) {
  if (orphans.length > baseline.count) {
    console.error(`Refusing to raise orphan baseline (${baseline.count} → ${orphans.length}).`);
    if (orphans.length) console.error(orphans.join('\n'));
    process.exit(1);
  }
  if (orphans.length < baseline.count) {
    await writeFile(baselinePath, `${JSON.stringify({ count: orphans.length }, null, 2)}\n`);
    console.log(`Orphan baseline shrank: ${baseline.count} → ${orphans.length}.`);
  } else {
    console.log(`Orphan baseline unchanged: ${baseline.count}.`);
  }
} else if (orphans.length > baseline.count) {
  console.error(`Orphan modules ${orphans.length} exceed baseline ${baseline.count}.`);
  console.error('Delete the file, or import it from the code that needs it:');
  console.error(orphans.join('\n'));
  process.exit(1);
} else {
  console.log(`Orphan check passed (${orphans.length}/${baseline.count}).`);
}
