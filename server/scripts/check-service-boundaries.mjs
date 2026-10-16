/** Enforce services/lib/db -> neutral modules, never back to HTTP composition.
 * Uses the installed TS 7 native AST API; no regex parsing or extra dependency.
 * Local type-only imports are edges too: contracts belong outside HTTP modules.
 */
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API } from 'typescript/unstable/sync';
import * as ts from 'typescript/unstable/ast';

const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const slash = (path) => path.split(sep).join('/');
const within = (root, file) => {
  const rel = relative(root, file);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
};
const literal = (node) => node && [ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(node.kind);

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symlinks must be replaced with explicit imports: ${path}`);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (sourceExtension.test(entry.name)) files.push(path);
  }
  return files;
}

function localTarget(file, specifier) {
  let target;
  if (specifier.startsWith('file:')) target = fileURLToPath(specifier);
  else if (specifier.startsWith('.') || isAbsolute(specifier)) target = resolve(dirname(file), specifier);
  else return null;
  const ext = extname(target);
  const base = target.slice(0, -ext.length);
  const candidates = ext === '.js' ? [base + '.ts', base + '.tsx', base + '.d.ts', target]
    : ext === '.mjs' ? [base + '.mts', base + '.d.mts', target]
    : ext === '.cjs' ? [base + '.cts', base + '.d.cts', target]
    : ext ? [target] : [target, ...['.ts', '.tsx', '.js', '.mjs', '.cts', '.mts'].map((suffix) => target + suffix), join(target, 'index.ts'), join(target, 'index.js')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || target;
}

function collectImports(source) {
  const imports = [];
  const requireFactories = new Set(['createRequire']);
  const requireNames = new Set(['require']);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === 'node:module') {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          if ((binding.propertyName || binding.name).text === 'createRequire') requireFactories.add(binding.name.text);
        }
      }
    }
  }
  const discoverRequires = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if ((ts.isCallExpression(init) && ts.isIdentifier(init.expression) && requireFactories.has(init.expression.text)) ||
          (ts.isIdentifier(init) && requireNames.has(init.text))) requireNames.add(node.name.text);
    }
    node.forEachChild(discoverRequires);
  };
  discoverRequires(source);
  const add = (node, specifier, runtime = true) => imports.push({
    specifier: literal(specifier) ? specifier.text : null,
    node: specifier, runtime,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  });
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((part) => part.isTypeOnly));
      add(node, node.moduleSpecifier, !onlyTypes);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const onlyTypes = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((part) => part.isTypeOnly));
      add(node, node.moduleSpecifier, !onlyTypes);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression, !node.isTypeOnly);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node, node.argument.literal, false);
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(expression) && requireNames.has(expression.text)) ||
          (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && requireNames.has(expression.expression.text) && expression.name.text === 'resolve')) {
        add(node, node.arguments[0]);
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
  return imports;
}

export function checkServiceBoundaries(serverDir = fileURLToPath(new URL('..', import.meta.url))) {
  serverDir = resolve(serverDir);
  const src = join(serverDir, 'src');
  const repo = dirname(serverDir);
  const files = sourceFiles(src);
  const protectedFile = (file) => ['services', 'lib', 'db'].some((name) => within(join(src, name), file));
  const forbidden = (file) => ['routes', 'middleware', 'boot'].some((name) => within(join(src, name), file)) ||
    /^(?:app|index(?:\.runtime)?)\.[cm]?[jt]s$/.test(relative(src, file)) ||
    ['frontend', 'apps', 'packages/ui'].some((name) => within(join(repo, name), file));
  if (!files.some(protectedFile)) throw new Error('No services/lib/db source files found; refusing an empty boundary check');
  const api = new API({ cwd: serverDir });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({ openProjects: [join(serverDir, 'tsconfig.json')], openFiles: files });
    const graph = new Map();
    const pending = [...files];
    const parseErrors = [];
    for (let i = 0; i < pending.length; i++) {
      const file = pending[i];
      if (graph.has(file)) continue;
      const project = snapshot.getDefaultProjectForFile(file);
      const source = project?.program.getSourceFile(file);
      if (!source) throw new Error(`Native parser did not load ${file}`);
      const diagnostics = project.program.getSyntacticDiagnostics(file);
      if (diagnostics.length) parseErrors.push({ file, line: 1, message: 'Syntax error; fix parsing before checking dependencies' });
      const edges = collectImports(source).map((entry) => {
        const spec = entry.specifier;
        let target = spec === null ? null : localTarget(file, spec);
        // Resolve tsconfig/package aliases using the compiler, not string guesses.
        if (spec !== null && target === null && !spec.startsWith('node:')) {
          const symbol = project.checker.getSymbolAtLocation(entry.node);
          target = symbol?.declarations?.find((declaration) => declaration.kind === ts.SyntaxKind.SourceFile)?.path || null;
        }
        const external = target?.split(sep).includes('node_modules');
        const local = target && !external && within(repo, target);
        let problem = null;
        if (spec === null) problem = 'Computed import/require cannot be checked; use a literal module specifier';
        else if (entry.runtime && /^(?:express|react|react-dom|react-native)(?:\/|$)/.test(spec)) problem = `HTTP/UI runtime dependency: ${spec}`;
        else if (target && forbidden(target)) problem = `Forbidden HTTP/composition/UI dependency: ${spec}`;
        else if (spec.startsWith('#') && !target) problem = `Unresolved package alias: ${spec}`;
        else if (target && !external && !existsSync(target)) problem = `Unresolved local dependency: ${spec}`;
        if (local && !problem && !forbidden(target) && sourceExtension.test(target) && !graph.has(target) && !pending.includes(target)) pending.push(target);
        return { ...entry, file, target: local ? target : null, problem };
      });
      graph.set(file, edges);
    }
    const violations = new Map();
    // Follow forwarding shims and neutral modules; importing via a barrel is
    // still a reverse dependency. Cycles are visited once, without recursion.
    for (const origin of files.filter(protectedFile)) {
      const queue = [{ file: origin, chain: [origin] }];
      const seen = new Set([origin]);
      for (let i = 0; i < queue.length; i++) {
        const { file, chain } = queue[i];
        for (const edge of graph.get(file) || []) {
          if (edge.problem) {
            const key = `${edge.file}:${edge.line}:${edge.problem}`;
            if (!violations.has(key)) violations.set(key, { file: edge.file, line: edge.line, message: edge.problem, chain: [...chain, edge.target || edge.specifier || '<computed>'] });
          } else if (edge.target && !seen.has(edge.target)) {
            seen.add(edge.target);
            queue.push({ file: edge.target, chain: [...chain, edge.target] });
          }
        }
      }
    }
    return { files: files.length, edges: [...graph.values()].reduce((n, edges) => n + edges.length, 0), violations: [...parseErrors, ...violations.values()] };
  } finally {
    snapshot?.dispose();
    api.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--update')) throw new Error('Usage: node scripts/check-service-boundaries.mjs [--update]');
    const baselinePath = new URL('./service-boundaries.baseline.json', import.meta.url);
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    // This rule starts at zero debt. Even --update cannot create exceptions.
    if (baseline.version !== 1 || !Array.isArray(baseline.accepted) || baseline.accepted.length !== 0) {
      throw new Error('Service-boundary baseline must remain empty; fix reverse dependencies instead of accepting them');
    }
    const result = checkServiceBoundaries();
    for (const violation of result.violations) {
      console.error(`${slash(relative(process.cwd(), violation.file))}:${violation.line}: ${violation.message}`);
      if (violation.chain?.length > 2) console.error('  via ' + violation.chain.map((file) => isAbsolute(file) ? slash(relative(process.cwd(), file)) : file).join(' -> '));
    }
    if (result.violations.length) process.exitCode = 1;
    else {
      if (process.argv.includes('--update')) {
        writeFileSync(baselinePath, JSON.stringify({ version: 1, accepted: [] }, null, 2) + '\n');
        console.log('[service-boundaries] baseline refreshed: 0 accepted, 0 dropped; new exceptions are forbidden');
      }
      console.log(`[service-boundaries] OK — ${result.files} source files, ${result.edges} imports/re-exports; no reverse HTTP/UI dependencies`);
    }
  } catch (err) {
    console.error('[service-boundaries] check failed:', err.message);
    process.exitCode = 1;
  }
}
