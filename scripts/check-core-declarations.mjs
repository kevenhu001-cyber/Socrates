#!/usr/bin/env node
/**
 * Guard the hand-written `.d.ts` declarations in `packages/core/src/`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `packages/core` ships its implementation as plain `.js` (the server's
 * production `dist/` executes those files directly under Node, so they must
 * stay `.js`), and types each module with a hand-written sibling `.d.ts`.
 * That pairing is a second source of truth: the declaration can silently
 * disagree with the implementation, and TypeScript believes the declaration
 * because `allowJs` is off and the `.js` is never checked.
 *
 * It already has. `demonstration.d.ts` declared
 * `createDemonstrationRuntime(program: DemonstrationProgram, ...)`, while the
 * implementation accepts an arbitrary `input`, normalizes it internally, and
 * only then validates it. Callers had to paper over the lie with a cast.
 *
 * WHAT THIS CHECKS
 * ----------------
 * For every `packages/core/src/<name>.js` that has a `<name>.d.ts` sibling:
 *   1. the two files export the same set of runtime values;
 *   2. every exported function has the same parameter count, with the same
 *      parameter names in the same order.
 *
 * A mismatch means the declaration no longer describes the implementation,
 * which is exactly the trap this guard closes.
 *
 * Type-only exports (`export interface X`, `export type X`) live only in the
 * declaration file and are not compared — they have no runtime counterpart.
 *
 * BASELINE
 * --------
 * The findings are a shrink-only ratchet (`core-declarations.baseline.json`),
 * matching the convention used by the other guards in this repo: a violation
 * may be fixed but never added. Run with `--update` after fixing entries.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const coreDir = path.join(root, 'packages', 'core', 'src');
const baselinePath = path.join(root, 'scripts', 'core-declarations.baseline.json');
const requireFrontend = createRequire(path.join(root, 'frontend', 'package.json'));
const ts = requireFrontend('typescript');

/** Parse a source file into its AST. */
function parse(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** The source file currently being scanned. */
let currentSourceFile = null;

/**
 * Collect the exported runtime values of a source file.
 *
 * Returns a map of exported name -> parameter names (null for non-functions).
 */
function exportedValues(sourceFile) {
  const found = new Map();

  /** Record a name exported through an export statement / declaration. */
  const record = (name, params) => {
    if (!found.has(name)) found.set(name, params);
  };

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        record(
          node.name.text,
          (node.parameters ?? []).map((p) => parameterName(p)),
        );
      }
    } else if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          record(declaration.name.text, null);
        }
      }
    } else if (ts.isExportAssignment(node)) {
      // `export default ...` — a default export has no stable name to match.
    }

    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        const exported = element.name.text;
        // `export { local as exported }` — the local binding may be a function.
        const local = element.propertyName?.text ?? exported;
        const localSymbol = node
          .getSourceFile()
          .statements.find(
            (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === local,
          );
        record(
          exported,
          localSymbol ? (localSymbol.parameters ?? []).map((p) => parameterName(p)) : null,
        );
      }
    } else if (ts.isExportDeclaration(node) && !node.exportClause) {
      // `export * from './x.js'` — the names come from another module; the
      // sibling declaration file spells them out, so nothing to compare here.
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

/** The declared name of a parameter, without its type or default value. */
function parameterName(parameter) {
  if (ts.isIdentifier(parameter.name)) return parameter.name.text;
  return parameter.name.getText();
}

/** Type-only names exported by a declaration file. */
function typeOnlyExports(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    // `export type { X } from './y.js'` carries no modifier — the `export`
    // keyword belongs to the ExportDeclaration itself, so this branch has to
    // be taken before the modifier gate below.
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      const clause = statement.exportClause;
      if (!ts.isNamedExports(clause)) continue;
      const clauseIsTypeOnly = statement.isTypeOnly || clause.isTypeOnly;
      for (const element of clause.elements) {
        if (clauseIsTypeOnly || element.isTypeOnly) names.add(element.name.text);
      }
      continue;
    }
    const modifiers = statement.modifiers ?? [];
    const exported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
    } else if (ts.isTypeAliasDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
    }
  }
  return names;
}

const findings = [];

for (const entry of readdirSync(coreDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const base = entry.name.slice(0, -3);
  const declName = `${base}.d.ts`;
  const declPath = path.join(coreDir, declName);
  let declSource;
  try {
    declSource = readFileSync(declPath, 'utf8');
  } catch {
    continue; // No declaration sibling — nothing to compare against.
  }

  currentSourceFile = parse(
    `packages/core/src/${entry.name}`,
    readFileSync(path.join(coreDir, entry.name), 'utf8'),
  );
  const impl = exportedValues(currentSourceFile);

  currentSourceFile = parse(`packages/core/src/${declName}`, declSource);
  const decl = exportedValues(currentSourceFile);
  const typeOnly = typeOnlyExports(currentSourceFile);

  for (const [name, implParams] of impl) {
    if (!decl.has(name)) {
      findings.push({
        file: `packages/core/src/${entry.name}`,
        kind: 'missing-declaration',
        detail: `exports \`${name}\` but ${declName} does not declare it`,
      });
      continue;
    }
    if (implParams === null) continue;
    const declParams = decl.get(name);
    if (declParams === null) continue;
    if (implParams.length !== declParams.length) {
      findings.push({
        file: `packages/core/src/${entry.name}`,
        kind: 'arity-mismatch',
        detail: `\`${name}\` takes ${implParams.length} parameter(s) (${implParams.join(', ')}) but ${declName} declares ${declParams.length} (${declParams.join(', ')})`,
      });
      continue;
    }
    for (let i = 0; i < implParams.length; i++) {
      if (implParams[i] !== declParams[i]) {
        findings.push({
          file: `packages/core/src/${entry.name}`,
          kind: 'parameter-name-mismatch',
          detail: `\`${name}\` parameter ${i + 1} is \`${implParams[i]}\` in the implementation but \`${declParams[i]}\` in ${declName}`,
        });
      }
    }
  }

  for (const [name] of decl) {
    if (!impl.has(name) && !typeOnly.has(name)) {
      findings.push({
        file: `packages/core/src/${declName}`,
        kind: 'stale-declaration',
        detail: `declares \`${name}\` but ${entry.name} does not export it`,
      });
    }
  }
}

findings.sort((a, b) =>
  a.file === b.file ? a.detail.localeCompare(b.detail) : a.file.localeCompare(b.file),
);

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const current = findings.length;

if (process.argv.includes('--update')) {
  if (current > baseline.count) {
    console.error(
      `Refusing to raise the core-declarations baseline (${baseline.count} -> ${current}).`,
    );
    for (const finding of findings) console.error(`  ${finding.file}: ${finding.detail}`);
    process.exit(1);
  }
  writeFileSync(baselinePath, `${JSON.stringify({ count: current, findings }, null, 2)}\n`);
  console.log(`core-declarations baseline updated: ${baseline.count} -> ${current}.`);
  process.exit(0);
}

if (current > baseline.count) {
  console.error(
    `packages/core declaration drift: ${current} finding(s), baseline allows ${baseline.count}.`,
  );
  console.error('A hand-written .d.ts no longer describes its .js implementation.');
  for (const finding of findings) console.error(`  ${finding.file}: ${finding.detail}`);
  console.error(
    'Fix the declaration (or the implementation) and run --update to shrink the baseline.',
  );
  process.exit(1);
}

console.log(`core-declarations check passed (${current}/${baseline.count}).`);
