#!/usr/bin/env node
/*
 * scripts/check-empty-catch.mjs — empty-catch-blocks ratchet.
 *
 * Many `try { ... } catch (_) {}` blocks intentionally swallow errors
 * (feature absent in a local-only build, callback side-effect that
 * must not abort the parent flow, best-effort cleanup). The cost is
 * that nothing reaches `src/app/errorGuard.js`'s banner / beacon path
 * and nothing surfaces in devtools either, so a regression that turns
 * a previously-fine catch into a real failure is invisible until a
 * user reports it.
 *
 * The ratchet instruments those sites one batch at a time. Each
 * instrumented catch keeps its original swallow behaviour and gains a
 * single `reportSwallow(err, '<context>')` call so the event becomes
 * observable. This check counts what remains UN-instrumented, so a
 * site that loses its reportSwallow call (or a new file that adds
 * one without converting) cannot land unnoticed.
 *
 * Rule: counts may only go DOWN. The current empty-catch count must
 * not exceed the baseline; if it does, fail (exit 1). Shrink the
 * baseline with `--update` after an intentional reduction. An empty
 * catch that carries a marker comment of the form
 *   `empty-catch: intentional — <reason>`
 * is exempted (see `isExempted`). Reasoned exemptions are documented
 * individually; a blanket exemption is not.
 *
 * Usage:  node scripts/check-empty-catch.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(FRONTEND, 'src');
const BASELINE = join(FRONTEND, 'scripts', 'empty-catch.baseline.json');
const UPDATE = process.argv.includes('--update');

const EXEMPT_MARKER = /empty-catch:[ \t]*intentional[ \t]*—[ \t]*[^\s]/;

/* Walk `src/`, skipping the vendored bundle directory. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor-files') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(?:js|ts|tsx|jsx|mjs|cjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Parse source, excluding catch-looking text in strings, regexes and comments. */
export function collectEmptyCatchSites(raw, filename = 'fixture.js') {
  const source = ts.createSourceFile(filename, raw, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) {
    throw new Error('Cannot parse ' + filename + ': ' +
      ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n'));
  }
  const offenders = [];
  const exempted = [];
  function hasExemption(node) {
    // Read attached comments from the original source, before any stripping.
    const positions = [node.pos, node.block.getStart(source) + 1, node.end];
    return positions.some((position) => {
      const ranges = [
        ...(ts.getLeadingCommentRanges(raw, position) || []),
        ...(ts.getTrailingCommentRanges(raw, position) || []),
      ];
      return ranges.some(({ pos, end, kind }) => {
        if (position === node.end &&
            source.getLineAndCharacterOfPosition(pos).line !==
            source.getLineAndCharacterOfPosition(node.end).line) return false;
        if (position === node.pos &&
            source.getLineAndCharacterOfPosition(end).line !==
            source.getLineAndCharacterOfPosition(node.getStart(source)).line) return false;
        const comment = raw.slice(pos + 2,
          kind === ts.SyntaxKind.MultiLineCommentTrivia ? end - 2 : end);
        return EXEMPT_MARKER.test(comment);
      });
    });
  }
  function visit(node) {
    if (ts.isCatchClause(node) && node.block.statements.length === 0) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      (hasExemption(node) ? exempted : offenders).push(`${filename}:${line}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { offenders, exempted };
}

function collect() {
  const offenders = [];
  const exempted = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/');
    const sites = collectEmptyCatchSites(readFileSync(file, 'utf8'), rel);
    offenders.push(...sites.offenders);
    exempted.push(...sites.exempted);
  }
  offenders.sort();
  exempted.sort();
  return { offenders, exempted };
}

function main() {
  const { offenders, exempted } = collect();
  const baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, 'utf8'))
    : null;

  if (!baseline || UPDATE) {
    /* On first run or `--update`, freeze the current count as the new
       baseline. We never GROW the baseline (the ratchet semantics);
       when updating with a real one, take the smaller of the two so an
       accidental regression can't be laundered into a higher budget. */
    const count = baseline && typeof baseline.count === 'number'
      ? Math.min(baseline.count, offenders.length)
      : offenders.length;
    writeFileSync(BASELINE, JSON.stringify({
      count,
      note: 'Empty catch blocks (try { ... } catch (_) {} / catch {}). May only go down. Run with --update after an intentional reduction.',
      generatedBy: 'check-empty-catch.mjs --update',
    }, null, 2) + '\n');
    console.log(`empty-catch: baseline ${baseline ? 'updated' : 'written'} (count=${count}).`);
    if (exempted.length) {
      console.log(`Exempted sites (${exempted.length}):`);
      for (const e of exempted) console.log(`  - ${e}`);
    }
    if (offenders.length) {
      console.log(`Current offenders (${offenders.length}):`);
      for (const o of offenders) console.log(`  - ${o}`);
    }
    return;
  }

  if (offenders.length > baseline.count) {
    console.error('empty-catch check FAILED:');
    console.error(`  empty catch blocks: ${offenders.length} > baseline ${baseline.count} (+${offenders.length - baseline.count}).`);
    for (const o of offenders) console.error(`  - ${o}`);
    console.error('  Convert with `reportSwallow(err, "<context>")` from src/util/reportSwallow.ts, or annotate with `empty-catch: intentional — <reason>` to exempt.');
    process.exitCode = 1;
  } else {
    console.log(`empty-catch check passed (${offenders.length}/${baseline.count} allowed).`);
    if (exempted.length) {
      console.log(`Exempted sites (${exempted.length}):`);
      for (const e of exempted) console.log(`  - ${e}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
