#!/usr/bin/env node
/** Reject imports of the retired state facade and accesses to its browser global. */
import { createRequire } from 'node:module';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFrontend = createRequire(path.join(frontendRoot, 'package.json'));
const ts = requireFrontend('typescript');

const SRC = path.join(frontendRoot, 'src');
const FACADE = path.join(SRC, 'state', 'store.ts');
const baselinePath = path.join(frontendRoot, 'scripts', 'state-facade.baseline.json');
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'vendor-files'].includes(entry.name)) await walk(full, out);
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = await walk(SRC);

function resolvesToFacade(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return false;
  return [base, `${base}.ts`, `${base}.tsx`, base.replace(/\.js$/, '.ts')].includes(FACADE);
}

function isWindow(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    node = node.expression;
  }
  return ts.isIdentifier(node) && node.text === 'window';
}

const importers = [];
for (const file of files) {
  if (file === FACADE) continue;
  const text = await readFile(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  let hit = null;
  const record = (node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    hit = `${path.relative(frontendRoot, file).replaceAll('\\', '/')}:${line + 1}`;
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (resolvesToFacade(file, node.moduleSpecifier.text)) record(node);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      if (resolvesToFacade(file, node.argument.literal.text)) record(node);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      if (resolvesToFacade(file, node.arguments[0].text)) record(node);
    } else if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      isWindow(node.expression)
    ) {
      const property = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isStringLiteralLike(node.argumentExpression)
          ? node.argumentExpression.text
          : undefined;
      if (property === 'stateStore') record(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (hit) importers.push(hit);
}
importers.sort();

if (process.argv.includes('--update')) {
  if (importers.length > baseline.count) {
    console.error(
      `Refusing to raise state-facade baseline (${baseline.count} → ${importers.length}).`,
    );
    if (importers.length) console.error(importers.join('\n'));
    process.exit(1);
  }
  if (importers.length < baseline.count) {
    await writeFile(baselinePath, `${JSON.stringify({ count: importers.length }, null, 2)}\n`);
    console.log(`State-facade baseline shrank: ${baseline.count} → ${importers.length}.`);
  } else {
    console.log(`State-facade baseline unchanged: ${baseline.count}.`);
  }
} else if (importers.length > baseline.count) {
  console.error(`State-facade importers ${importers.length} exceed baseline ${baseline.count}.`);
  console.error('Use the typed hooks in src/store/index.ts instead of stateStore.read/dispatch:');
  console.error(importers.join('\n'));
  process.exit(1);
} else {
  console.log(`State-facade check passed (${importers.length}/${baseline.count}).`);
}
