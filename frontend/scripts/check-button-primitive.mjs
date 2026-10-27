#!/usr/bin/env node
/*
 * scripts/check-button-primitive.mjs — raw-button ratchet.
 *
 * The React tree grew a shared primitives layer (src/react/ui/) so the
 * button grammar — a real button, a forwarded ref, the disabled / loading
 * states and the size ladder from styles/tokens.css — lives in one place
 * instead of being re-invented per feature.
 *
 * Before that layer existed the tree carried two hundred-odd raw <button>
 * elements across dozens of files. Each one re-declared the type, the
 * focus behaviour, the hit area and often its own copy of an icon button.
 * The cost was not duplication of markup; it was divergence of behaviour:
 * a focus ring fixed in one feature and not the next, a touch target that
 * reached the ladder in one toolbar and not another.
 *
 * This check counts the raw <button> elements that remain in src/react/**
 * and freezes the count. The count may only go DOWN: a new raw button is
 * allowed to land only if it is paired with a migration that removes one.
 *
 * The count is taken from the TypeScript AST, not from a text search. A
 * text search cannot tell a JSX element from the same word inside an HTML
 * template string, and several files under src/ build markup as strings.
 * The AST sees the elements that actually render.
 *
 * src/react/ui/ is excluded: the primitives render a <button> on purpose,
 * and that is the one place a raw button belongs.
 *
 * Usage:  node scripts/check-button-primitive.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REACT = join(FRONTEND, 'src', 'react');
const BASELINE = join(FRONTEND, 'scripts', 'button-primitive.baseline.json');
const UPDATE = process.argv.includes('--update');

/* The primitives themselves render a <button> — that is the point of them. */
const EXCLUDED_DIRS = ['ui'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/* Every JSX <button> element in a file, with the line it sits on. */
function countButtons(file) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /* A file that does not parse would silently contribute zero buttons, so a
   * parse error has to be reported rather than swallowed — otherwise the
   * ratchet would be blind to exactly the file it cannot read. */
  const parseErrors = source.parseDiagnostics ?? [];
  if (parseErrors.length) {
    const first = parseErrors[0];
    const { line } = source.getLineAndCharacterOfPosition(first.start ?? 0);
    return {
      hits: [],
      error: { line: line + 1, message: ts.flattenDiagnosticMessageText(first.messageText, ' ') },
    };
  }
  const hits = [];
  const visit = (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName
      && ts.isIdentifier(node.tagName)
      && node.tagName.text === 'button'
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      hits.push(line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { hits, error: null };
}

function collect() {
  const offenders = [];
  const errors = [];
  for (const file of walk(REACT)) {
    const rel = relative(REACT, file).split(sep).join('/');
    if (EXCLUDED_DIRS.includes(rel.split('/')[0])) continue;
    const { hits, error } = countButtons(file);
    if (error) {
      errors.push(`src/react/${rel}:${error.line} did not parse — ${error.message}`);
      continue;
    }
    for (const line of hits) {
      offenders.push({ file: `src/react/${rel}`, line });
    }
  }
  return { offenders, errors };
}

function main() {
  const { offenders, errors } = collect();
  const baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : null;

  if (errors.length) {
    console.error('button-primitive check FAILED:');
    console.error('  A file under src/react/ did not parse, so its buttons could not be counted:');
    for (const e of errors) console.error('  - ' + e);
    process.exitCode = 1;
    return;
  }

  if (!baseline || UPDATE) {
    const count = baseline && typeof baseline.count === 'number'
      ? Math.min(baseline.count, offenders.length)
      : offenders.length;
    writeFileSync(BASELINE, JSON.stringify({
      count,
      excluded: EXCLUDED_DIRS.map((dir) => `src/react/${dir}`),
      note: 'Raw JSX <button> elements in src/react/** outside the shared primitives. May only go down. Run with --update after an intentional reduction.',
      generatedBy: 'check-button-primitive.mjs --update',
    }, null, 2) + '\n');
    console.log(`button-primitive: baseline ${baseline ? 'updated' : 'written'} (count=${count}).`);
    if (offenders.length) {
      console.log('Current raw buttons:');
      for (const o of offenders) console.log(`  - ${o.file}:${o.line}`);
    }
    return;
  }

  if (offenders.length > baseline.count) {
    console.error('button-primitive check FAILED:');
    console.error(`  Raw JSX <button> elements: ${offenders.length} > baseline ${baseline.count} (+${offenders.length - baseline.count}).`);
    for (const o of offenders) console.error(`  - ${o.file}:${o.line}`);
    console.error('  Use the shared primitives from src/react/ui/ instead of a raw button.');
    process.exitCode = 1;
    return;
  }

  console.log(`button-primitive check passed (${offenders.length}/${baseline.count} allowed).`);
}

main();
