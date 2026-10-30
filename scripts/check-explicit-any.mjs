#!/usr/bin/env node
/** Fail when first-party production TypeScript adds an explicit `any` type. */
import { createRequire } from 'node:module';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFrontend = createRequire(path.join(root, 'frontend', 'package.json'));
const ts = requireFrontend('typescript');
const baselinePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'explicit-any.baseline.json');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const packageRoots = ['frontend/src', 'server/src', 'apps/socrates/src'];
for (const entry of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
  if (entry.isDirectory()) packageRoots.push(path.join('packages', entry.name, 'src'));
}

const ignoredDirectories = new Set(['node_modules', 'dist', 'vendor-files', 'coverage']);
const files = [];

async function collect(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await collect(filePath);
      continue;
    }
    if (!entry.isFile() || !/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) continue;
    if (entry.name === 'vendor.d.ts') continue;
    files.push(filePath);
  }
}

for (const sourceRoot of packageRoots) await collect(path.join(root, sourceRoot));

const findings = [];
for (const filePath of files.sort()) {
  const text = await readFile(filePath, 'utf8');
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push(`${path.relative(root, filePath)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (process.argv.includes('--update')) {
  if (findings.length > baseline.count) {
    console.error(`Refusing to raise explicit-any baseline (${baseline.count} → ${findings.length}).`);
    if (findings.length) console.error(findings.join('\n'));
    process.exit(1);
  }
  if (findings.length < baseline.count) {
    await writeFile(baselinePath, `${JSON.stringify({ count: findings.length }, null, 2)}\n`);
    console.log(`Explicit-any baseline shrank: ${baseline.count} → ${findings.length}.`);
  } else {
    console.log(`Explicit-any baseline unchanged: ${baseline.count}.`);
  }
} else if (findings.length > baseline.count) {
  console.error(`Explicit-any count ${findings.length} exceeds baseline ${baseline.count}.`);
  console.error(findings.join('\n'));
  process.exit(1);
} else {
  console.log(`Explicit-any check passed (${findings.length}/${baseline.count}).`);
}
