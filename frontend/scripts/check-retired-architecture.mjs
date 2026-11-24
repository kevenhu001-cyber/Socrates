#!/usr/bin/env node
/** Fixed invariants for completed migrations. No writable debt baseline. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RULES = ['legacy-js', 'state-facade', 'rn-shim'];
const SKIP = new Set(['vendor-files', 'node_modules', 'dist']);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) yield* walk(full);
    } else if (entry.isFile()) yield full;
  }
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

function resolvesTo(file, specifier, src, target) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(src, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(file), specifier);
  else return false;
  return [base, base + '.ts', base + '.tsx', base.replace(/\.js$/, '.ts')].includes(target);
}

function scanTypescript(file, onImport, onNode) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifier = node.argument.literal;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      specifier = node.arguments[0];
    }
    const line = () => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (specifier && ts.isStringLiteralLike(specifier)) onImport(specifier.text, line);
    onNode(node, line);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

export function checkRetiredArchitecture(root = ROOT, rules = RULES) {
  const enabled = new Set(rules);
  const failures = [];
  const src = path.join(root, 'frontend', 'src');
  const ui = path.join(root, 'packages', 'ui', 'src');
  const facade = path.join(src, 'state', 'store.ts');
  const shim = path.join(ui, 'react-web.tsx');
  const report = (rule, file, message, line) => {
    const relative = path.relative(root, file).split(path.sep).join('/');
    failures.push({ rule, file: relative, line, message });
  };

  if (enabled.has('state-facade') && existsSync(facade)) {
    report('state-facade', facade, 'Retired facade must not be recreated.');
  }
  for (const file of walk(src)) {
    if (enabled.has('legacy-js') && /\.(?:[cm]?js|jsx)$/.test(file)) {
      report('legacy-js', file, 'Use first-party TypeScript instead.');
    }
    if (!enabled.has('state-facade') || !/\.tsx?$/.test(file) || file.endsWith('.d.ts')) {
      continue;
    }
    scanTypescript(
      file,
      (specifier, line) => {
        if (resolvesTo(file, specifier, src, facade)) {
          report('state-facade', file, 'Import typed store/index.ts instead.', line());
        }
      },
      (node, line) => {
        if (
          (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
          isWindow(node.expression)
        ) {
          const name = ts.isPropertyAccessExpression(node)
            ? node.name.text
            : ts.isStringLiteralLike(node.argumentExpression)
              ? node.argumentExpression.text
              : undefined;
          if (name === 'stateStore') {
            report('state-facade', file, 'Use typed store actions instead.', line());
          }
        }
      },
    );
  }

  if (enabled.has('rn-shim')) {
    if (existsSync(shim)) report('rn-shim', shim, 'Retired RN shim must not be recreated.');
    for (const file of walk(ui)) {
      if (!/\.tsx?$/.test(file)) continue;
      scanTypescript(
        file,
        (specifier, line) => {
          if (/^(?:\.{1,2}\/)+react-web(?:\.tsx)?$/.test(specifier)) {
            report('rn-shim', file, 'Use React DOM and CSS.', line());
          }
        },
        () => {},
      );
    }
    for (const name of ['package.json', 'frontend/package.json', 'packages/ui/package.json']) {
      const file = path.join(root, name);
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const dep of Object.keys(pkg[field] || {})) {
          if (/^react-native(?:-web)?$/.test(dep)) {
            report('rn-shim', file, 'Forbidden dependency: ' + dep);
          }
        }
      }
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rule = args[0]?.startsWith('--rule=') ? args[0].slice(7) : null;
  if (args.length && (args.length !== 1 || !RULES.includes(rule))) {
    console.error('Usage: check-retired-architecture.mjs [--rule=legacy-js|state-facade|rn-shim]');
    process.exitCode = 1;
  } else {
    const failures = checkRetiredArchitecture(ROOT, rule ? [rule] : RULES);
    for (const { rule: name, file, line, message } of failures) {
      console.error(name + ': ' + file + (line ? ':' + line : '') + ' — ' + message);
    }
    if (failures.length) process.exitCode = 1;
    else console.log('Retired architecture check passed (zero violations).');
  }
}
