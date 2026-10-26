#!/usr/bin/env node
/** Only ownedRoot.ts creates/hydrates React roots. Typed callers choose
 * single-host, grouped or hydration semantics without creating another owner. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts/react-roots.baseline.json');
const OWNER = 'react/lib/boot/ownedRoot.ts';
const RETIRED = new Set([
  '__socratesShareMsgListTakeover', '__socratesReleaseMsgListReact',
  '__socratesMountAssistantTurn', '__socratesReleaseAssistantTurns', '__socratesPillRoot',
]);

export function collectReactRootViolations(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const issues = [];
  const canonical = file.split('\\').join('/') === OWNER;
  const add = (node, message) => issues.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1} ${message}`);
  const visit = (node) => {
    if (!canonical && ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'react-dom/client') {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (clause && !clause.isTypeOnly && (clause.name || (bindings && (ts.isNamespaceImport(bindings)
        || bindings.elements.some((item) => !item.isTypeOnly && ['createRoot', 'hydrateRoot'].includes((item.propertyName || item.name).text)))))) {
        add(node, 'import root creation from the canonical lifecycle module');
      }
    }
    if (!canonical && ts.isCallExpression(node)) {
      const target = node.expression;
      if ((target.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(target) && target.text === 'require'))
        && node.arguments[0] && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0])) && node.arguments[0].text === 'react-dom/client') {
        add(node, 'load the canonical lifecycle module instead of a raw React DOM runtime');
      }
      if (ts.isPropertyAccessExpression(target) && ['createRoot', 'hydrateRoot'].includes(target.name.text)) {
        add(node, 'create/hydrate roots through the canonical lifecycle module');
      }
    }
    if (ts.isPropertyAccessExpression(node) && RETIRED.has(node.name.text)) add(node, 'retired window mount bridge; use the typed module interface');
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)
      && RETIRED.has(node.argumentExpression.text)) add(node, 'retired window mount bridge; use the typed module interface');
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return issues;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return ['vendor-files', 'node_modules'].includes(entry.name) ? [] : walk(join(dir, entry.name));
    return /\.(?:js|mjs|ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [join(dir, entry.name)] : [];
  });
}

function main() {
  const issues = walk(join(ROOT, 'src')).flatMap((file) =>
    collectReactRootViolations(relative(join(ROOT, 'src'), file).split(sep).join('/'), readFileSync(file, 'utf8'))).sort();
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const allowed = new Set(baseline.issues);
  const added = issues.filter((issue) => !allowed.has(issue));
  if (added.length) {
    console.error('React root ownership check FAILED:');
    added.forEach((issue) => console.error(`  ${issue}`));
    process.exitCode = 1;
  } else if (process.argv.includes('--update')) {
    writeFileSync(BASELINE, JSON.stringify({ issues, generatedBy: 'check-react-roots.mjs --update' }, null, 2) + '\n');
    console.log(`React root ownership baseline shrank by ${baseline.issues.length - issues.length}.`);
  } else {
    console.log(`React root ownership passed (${issues.length}/${baseline.issues.length}; one creation owner, no retired mount globals).`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
