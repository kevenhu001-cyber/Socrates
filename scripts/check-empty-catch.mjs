#!/usr/bin/env node
/*
 * scripts/check-empty-catch.mjs — empty-catch-blocks ratchet.
 *
 * Many `try { ... } catch (_) {}` blocks intentionally swallow errors
 * (feature absent in a local-only build, callback side-effect that
 * must not abort the parent flow, best-effort cleanup). The cost is
 * that nothing reaches the tree's error-reporting path — the SPA's
 * `frontend/src/app/errorGuard.ts` banner / beacon, or the server's
 * `server/src/lib/logger.ts` — and nothing surfaces in devtools either,
 * so a regression that turns a previously-fine catch into a real
 * failure is invisible until a user reports it.
 *
 * The ratchet instruments those sites one batch at a time. Each
 * instrumented catch keeps its original swallow behaviour and gains a
 * single observability call so the event becomes reportable. This check
 * counts what remains UN-instrumented, so a site that loses its reporting
 * call (or a new file that adds one without converting) cannot land
 * unnoticed.
 *
 * Scope: `frontend/src`, `server/src`, and every `packages/<name>/src`
 * (the same trees `scripts/check-explicit-any.mjs` scans). Vendored
 * bundles, generated output and build output are skipped.
 *
 * Rule: counts may only go DOWN. A target's current count must not
 * exceed its baseline; if it does, fail (exit 1). Shrink a target's
 * baseline with `--update` after an intentional reduction. An empty
 * catch that carries a marker comment of the form
 *   `empty-catch: intentional — <reason>`
 * is exempted (see `isExempted`). Reasoned exemptions are documented
 * individually; a blanket exemption is not.
 *
 * History — 415 -> 392 was NOT a loosening. The old regex parser reported
 * 418 offenders on the same tree and 27 of those (across 20 files) were
 * false positives: it stripped `//` comments before matching, so a `//`
 * inside a regex or string ate the rest of the line including any catch on
 * it, and `catch(e){}` text inside an iframe srcdoc string literal counted
 * as real source. It also stripped the body's `empty-catch: intentional`
 * marker BEFORE testing for the exemption, so every exempted multi-line
 * catch was miscounted as an offender. The AST parser counts what
 * JavaScript actually parses.
 *
 * Usage:  node scripts/check-empty-catch.mjs [--update]
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* Resolve TypeScript from the tree that invoked the check first. The frontend
   and server both declare it at different major versions, and Server CI
   installs only `server/`, so a hard-coded frontend require crashed that lane
   with MODULE_NOT_FOUND before it could count anything. */
function loadTypeScript() {
  const candidates = [
    join(process.cwd(), 'package.json'),
    join(ROOT, 'frontend', 'package.json'),
    join(ROOT, 'server', 'package.json'),
  ];
  for (const manifest of candidates) {
    try {
      const loaded = createRequire(manifest)('typescript');
      // TypeScript 7 ships the native compiler with no JS compiler API.
      if (typeof loaded.createSourceFile === 'function') return loaded;
    } catch {
      // Try the next declared tree; the final miss is reported below.
    }
  }
  throw new Error(
    'check-empty-catch: no TypeScript compiler API found; run this from frontend/ or the repository root',
  );
}

const ts = loadTypeScript();

const BASELINE = join(ROOT, 'scripts', 'empty-catch.baseline.json');
const UPDATE = process.argv.includes('--update');

const EXEMPT_MARKER = /empty-catch:[ \t]*intentional[ \t]*—[ \t]*[^\s]/;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'vendor-files', 'generated']);

/* The trees that must stay free of un-instrumented empty catches. Package
   names are part of the baseline key so a regression in one package cannot
   be hidden by a reduction in another. */
function targets() {
  const list = [
    { key: 'frontend', dir: join(ROOT, 'frontend', 'src') },
    { key: 'server', dir: join(ROOT, 'server', 'src') },
  ];
  for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(ROOT, 'packages', entry.name, 'src');
    if (existsSync(dir)) list.push({ key: `packages/${entry.name}`, dir });
  }
  return list;
}

/* Walk a source tree, skipping vendored, generated and build output. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
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
    throw new Error(
      'Cannot parse ' +
        filename +
        ': ' +
        ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, '\n'),
    );
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
        if (
          position === node.end &&
          source.getLineAndCharacterOfPosition(pos).line !==
            source.getLineAndCharacterOfPosition(node.end).line
        )
          return false;
        if (
          position === node.pos &&
          source.getLineAndCharacterOfPosition(end).line !==
            source.getLineAndCharacterOfPosition(node.getStart(source)).line
        )
          return false;
        const comment = raw.slice(
          pos + 2,
          kind === ts.SyntaxKind.MultiLineCommentTrivia ? end - 2 : end,
        );
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

function collect(dir) {
  const offenders = [];
  const exempted = [];
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const sites = collectEmptyCatchSites(readFileSync(file, 'utf8'), rel);
    offenders.push(...sites.offenders);
    exempted.push(...sites.exempted);
  }
  offenders.sort();
  exempted.sort();
  return { offenders, exempted };
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
  /* The baseline used to be a single `{ count }` for frontend/src alone. A
     number is read as that tree's budget so an older checkout still works. */
  if (typeof parsed.count === 'number' && !parsed.counts) {
    return { counts: { frontend: parsed.count } };
  }
  return parsed;
}

function main() {
  const baseline = readBaseline();
  const results = targets().map(({ key, dir }) => ({ key, ...collect(dir) }));
  const total = results.reduce((sum, r) => sum + r.offenders.length, 0);
  const exemptedTotal = results.reduce((sum, r) => sum + r.exempted.length, 0);

  if (!baseline || UPDATE) {
    /* On first run or `--update`, freeze the current count as the new
       baseline. We never GROW a budget (the ratchet semantics); when
       updating with a real one, take the smaller of the two so an
       accidental regression can't be laundered into a higher budget. */
    const counts = {};
    for (const { key, offenders } of results) {
      const previous = baseline?.counts?.[key];
      counts[key] =
        typeof previous === 'number' ? Math.min(previous, offenders.length) : offenders.length;
    }
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          counts,
          note: 'Empty catch blocks (try { ... } catch (_) {} / catch {}) per source tree. May only go down. Run with --update after an intentional reduction.',
          generatedBy: 'check-empty-catch.mjs --update',
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`empty-catch: baseline ${baseline ? 'updated' : 'written'} (total=${total}).`);
    for (const [key, count] of Object.entries(counts)) console.log(`  ${key}: ${count}`);
    return;
  }

  const failures = results.filter(
    ({ key, offenders }) => offenders.length > (baseline.counts?.[key] ?? 0),
  );
  const regressions = results.filter(
    ({ key, offenders }) => offenders.length < (baseline.counts?.[key] ?? 0),
  );

  if (failures.length) {
    console.error('empty-catch check FAILED:');
    for (const { key, offenders } of failures) {
      const allowed = baseline.counts?.[key] ?? 0;
      console.error(
        `  ${key}: ${offenders.length} > baseline ${allowed} (+${offenders.length - allowed}).`,
      );
      for (const o of offenders) console.error(`    - ${o}`);
    }
    console.error(
      "  Log through the tree's reporter (frontend: reportSwallow from src/util/reportSwallow.ts; server: lib/logger.ts), or annotate with `empty-catch: intentional — <reason>` to exempt.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`empty-catch check passed (${total} allowed across ${results.length} trees).`);
  for (const { key, offenders } of results) {
    console.log(`  ${key}: ${offenders.length}/${baseline.counts?.[key] ?? 0}`);
  }
  if (regressions.length) {
    console.log('  Budget to reclaim with --update:');
    for (const { key, offenders } of regressions) {
      console.log(`    ${key}: ${offenders}/${baseline.counts?.[key] ?? 0}`);
    }
  }
  if (exemptedTotal) {
    console.log(`Exempted sites (${exemptedTotal}):`);
    for (const { exempted } of results) for (const e of exempted) console.log(`  - ${e}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
