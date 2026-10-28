#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts/shadcn-adoption.baseline.json');
const CONTROLS = new Set(['button', 'input', 'textarea', 'select', 'label', 'hr']);

/** JSX parsing deliberately ignores HTML in editor previews/template strings. */
export function inspectSource(source, name) {
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const normalizedName = name.replaceAll('\\', '/');
  const replacedFeature = /(?:^|\/)react\/(?:settings|profileModal|adminModal|sidebar|sidebar-chrome)\//.test(normalizedName)
    || /(?:^|\/)react\/pages\/workspace\/(?:LibraryToolbar|PluginDetailHeader|PluginDirectory|PluginDirectoryCard|ProjectsView|workspaceUi)\.tsx$/.test(normalizedName);
  const problems = [];
  function report(node, kind, message) {
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    problems.push({ kind, message, line });
  }
  function visit(node) {
    if (replacedFeature && ts.isImportDeclaration(node) && /\/ui\/(?:Button|IconButton)$|\/ui\/shadcn\/native-select$/.test(node.moduleSpecifier.text)) {
      report(node, 'compatibilityControls', 'use a semantic shadcn component in this migrated feature');
    }
    if (replacedFeature && ts.isJsxAttribute(node) && node.name.text === 'variant' && node.initializer && ts.isStringLiteral(node.initializer) && node.initializer.text === 'surface') {
      report(node, 'compatibilityControls', 'use a semantic component variant in this migrated feature');
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && CONTROLS.has(node.tagName.getText(ast))) {
      report(node, 'rawControls', `use a shared shadcn control instead of <${node.tagName.getText(ast)}>`);
    }
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text?.startsWith('@base-ui/react/')) {
      // The menu boundary retains its viewport positioning algorithm. Its
      // interactive root, items, groups and popup are shadcn components.
      if (!(name.replaceAll('\\', '/').endsWith('menu/FoundationMenu.tsx') && node.moduleSpecifier.text === '@base-ui/react/menu')) {
        report(node, 'unadaptedPrimitives', 'import the adapted component from react/ui/shadcn');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return problems;
}

function collect(dir, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== join(ROOT, 'src/react/ui')) collect(path, results);
    } else if (/\.tsx?$/.test(entry.name)) {
      const name = relative(ROOT, path).replaceAll('\\', '/');
      for (const problem of inspectSource(readFileSync(path, 'utf8'), name)) results.push({ ...problem, name });
    }
  }
  return results;
}

function main() {
  const problems = collect(join(ROOT, 'src/react'));
  const counts = { rawControls: 0, unadaptedPrimitives: 0, compatibilityControls: 0 };
  for (const problem of problems) counts[problem.kind]++;
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (process.argv.includes('--update')) {
    const next = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.min(value, baseline[key])]));
    writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log('shadcn adoption baseline only shrank:', next);
  }
  const exceeded = new Set(Object.keys(counts).filter((key) => counts[key] > baseline[key]));
  if (exceeded.size) {
    for (const problem of problems.filter((item) => exceeded.has(item.kind))) console.error(`${problem.name}:${problem.line} ${problem.message}`);
    process.exitCode = 1;
  } else {
    console.log(`shadcn adoption passed (${counts.rawControls}/${baseline.rawControls} raw controls, ${counts.unadaptedPrimitives}/${baseline.unadaptedPrimitives} unadapted primitives, ${counts.compatibilityControls}/${baseline.compatibilityControls} compatibility controls in migrated features).`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
