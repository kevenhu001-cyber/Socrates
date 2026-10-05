/**
 * scripts/check-chat-layering.mjs — `src/chat/**` must not import `src/react/**`.
 *
 * The legacy chat layer and the React tree are migrating toward a boundary in
 * which React renders from the store and legacy code only writes state. The
 * one thing that quietly undoes that boundary is an import in the wrong
 * direction: `chat/` importing `react/`.
 *
 * It is easy to introduce and invisible in review, because it works. It makes
 * the legacy hot path depend on the React component tree, which
 *
 *   - pulls React (and react-dom) into the entry chunk for code that does not
 *     render anything,
 *   - creates a directory-level cycle, since `react/` reads state that
 *     `chat/` writes, and
 *   - makes the legacy path untestable in isolation: a test that wants
 *     `chat/streamingTurn.js` must now boot a React component module.
 *
 * A concrete instance this check is guarding: `chat/streamingTurn.js` used to
 * import `isMsgListMounted()` from `react/message-list/MessageList.tsx` just
 * to read one boolean. The flag now lives in the neutral `src/ui/` layer.
 *
 * Shared types are fine — `react/types/domain` is the contract both sides
 * speak. What is forbidden is reaching into the component tree.
 *
 * Usage: node scripts/check-chat-layering.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(FRONTEND, 'src');
const BASELINE = join(FRONTEND, 'scripts', 'chat-layering.baseline.json');
const UPDATE = process.argv.includes('--update');

/** `src/react/types/**` is the shared contract, not the component tree. */
const REACT_ROOT = resolve(SRC, 'react');
const ALLOWED_ROOT = resolve(REACT_ROOT, 'types');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'vendor-files') continue;
      walk(full, out);
    } else if (/\.(js|mjs|ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isWithin(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function isStringSpecifier(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function collectSpecifierIssues(node, line, rel, offenders) {
  if (typeof node !== 'string' || !node) return;
  if (!node.startsWith('.') && !isAbsolute(node)) {
    if (node.startsWith('src/react/')) {
      const target = resolve(FRONTEND, node);
      if (isWithin(REACT_ROOT, target) && !isWithin(ALLOWED_ROOT, target)) {
        offenders.push(`${rel}:${line}: -> ${node}`);
      }
    }
    return;
  }

  const target = isAbsolute(node) ? resolve(node) : resolve(dirname(join(SRC, rel)), node);
  if (isWithin(REACT_ROOT, target) && !isWithin(ALLOWED_ROOT, target)) {
    offenders.push(`${rel}:${line}: -> ${node}`);
  }
}

function collect() {
  const offenders = [];
  for (const file of walk(join(SRC, 'chat'))) {
    const rel = relative(SRC, file).split(sep).join('/');
    const raw = readFileSync(file, 'utf8');
    const scriptKind = /\.tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const source = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true, scriptKind);

    function visit(node) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier && isStringSpecifier(node.moduleSpecifier)) {
        collectSpecifierIssues(node.moduleSpecifier.text, line, rel, offenders);
      } else if (ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression
        && isStringSpecifier(node.moduleReference.expression)) {
        collectSpecifierIssues(node.moduleReference.expression.text, line, rel, offenders);
      } else if (ts.isImportTypeNode(node)
        && ts.isLiteralTypeNode(node.argument)
        && isStringSpecifier(node.argument.literal)) {
        collectSpecifierIssues(node.argument.literal.text, line, rel, offenders);
      } else if (ts.isCallExpression(node)) {
        const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        if (isDynamicImport || isRequire) {
          const argument = node.arguments[0];
          if (argument && isStringSpecifier(argument)) {
            collectSpecifierIssues(argument.text, line, rel, offenders);
          } else {
            offenders.push(`${rel}:${line}: -> non-literal ${isDynamicImport ? 'dynamic import' : 'require'} (target cannot be checked)`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return offenders.sort();
}

function main() {
  const offenders = collect();
  if (UPDATE || !existsSync(BASELINE)) {
    const previous = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
    const count = previous && typeof previous.count === 'number'
      ? Math.min(previous.count, offenders.length)
      : offenders.length;
    writeFileSync(BASELINE, JSON.stringify({
      count,
      note: 'src/chat/** modules importing src/react/** (src/react/types/** is the allowed shared contract). May only go down.',
      generatedBy: 'check-chat-layering.mjs --update',
    }, null, 2) + '\n');
    console.log(`chat-layering: baseline ${previous ? 'updated' : 'written'} (count=${count}).`);
    return;
  }

  const allowed = JSON.parse(readFileSync(BASELINE, 'utf8')).count;
  if (offenders.length > allowed) {
    console.error(`chat-layering FAILED: ${offenders.length} chat/ -> react/ imports, ${allowed} allowed.`);
    for (const o of offenders) console.error(`  - ${o}`);
    console.error('The legacy chat layer must not depend on the React component tree.');
    console.error('Move the shared piece to src/ui/ or src/react/types/, not into the import.');
    process.exit(1);
  }
  console.log(`chat-layering check passed (${offenders.length}/${allowed} allowed).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
