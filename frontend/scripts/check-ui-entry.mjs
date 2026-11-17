#!/usr/bin/env node
/** Fail when frontend/src imports the @socrates/ui root barrel; only narrow subpaths are allowed. */
import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const ts = requireFrontend('typescript');

const files = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(p);
      continue;
    }
    if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) files.push(p);
  }
}
await collect(path.join(frontend, 'src'));

const findings = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const visit = (node) => {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ((callee.kind === ts.SyntaxKind.Identifier && callee.text === 'require') ||
          callee.kind === ts.SyntaxKind.ImportKeyword) &&
        node.arguments.length &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifier = node.arguments[0].text;
      }
    }
    if (specifier === '@socrates/ui') {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push(`frontend/${path.relative(frontend, file)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (findings.length) {
  console.error(
    '[check-ui-entry] frontend/src must use @socrates/ui/* subpaths, never the root barrel:',
  );
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log('[check-ui-entry] OK — no root barrel imports in frontend/src.');
