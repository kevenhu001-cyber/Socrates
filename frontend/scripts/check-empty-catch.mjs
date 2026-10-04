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

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(FRONTEND, 'src');
const BASELINE = join(FRONTEND, 'scripts', 'empty-catch.baseline.json');
const UPDATE = process.argv.includes('--update');

/* Single-line `catch (...) {}` — open and close braces on the same line,
   with at most whitespace between them. Matches both `catch {}` and
   `catch (id) {}` forms. The brief is strict: the body is literally
   empty (or whitespace-only) AND on the same line as the catch header.
   Multi-line `catch (_) { /* comment-only *\/ }` is a separate case —
   see `MULTILINE_CATCH_PATTERN` below for those, but the brief treats
   them as out of scope for this wave. */
const SINGLELINE_CATCH_PATTERN = /catch\s*(?:\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*\))?\s*\{\s*\}/g;

/* A multi-line catch block whose body, AFTER comment-stripping, contains
   nothing but whitespace. Catches whose only body content is a
   comment (e.g. a `handleAuthExpired failed` notice) fall into this
   bucket once the comment is removed. */
const MULTILINE_CATCH_PATTERN = /catch\s*(?:\([^)]*\))?\s*\{/g;

const EXEMPT_MARKER = /empty-catch:\s*intentional\s*—\s*[^\n]*/;

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

/* Preserve column positions inside line-blocks and block comments by
   replacing each non-newline character with a space. Mirrors the
   stripping used by `check-react-globals.mjs` and `check-css-debt.mjs`
   so every ratchet counts the same set of files after the same
   transform. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));
}

/* True if a catch site is exempted by a marker comment in the
   surrounding source — either on the same line (single-line form) or
   anywhere in the block body before the matching close brace (multi-line
   form). The marker must include the reason so the next reader can
   judge whether the exemption is still valid. */
function isExempted(text, headerStart, headerEnd, body) {
  // Same-line marker (e.g. `} catch (_) {} /* empty-catch: intentional — foo */`)
  // — only checked AFTER stripping, so the marker must survive the
  // strip (it doesn't contain `//` or `/*` so it always does).
  const sameLineAfter = text.slice(headerEnd, text.indexOf('\n', headerEnd) < 0 ? text.length : text.indexOf('\n', headerEnd));
  if (EXEMPT_MARKER.test(sameLineAfter)) return true;
  // Multi-line body marker — already stripped, so we check the body
  // string itself (which is what `collect` extracted) for the marker.
  if (EXEMPT_MARKER.test(body)) return true;
  // Same-line marker that lives BEFORE the catch header on the same line
  // (rare; included so authors can annotate `} /* empty-catch: intentional — … */ catch (_) {}`).
  const lineStart = text.lastIndexOf('\n', headerStart) + 1;
  const before = text.slice(lineStart, headerStart);
  if (EXEMPT_MARKER.test(before)) return true;
  return false;
}

function collect() {
  const offenders = [];
  const exempted = [];
  for (const file of walk(SRC)) {
    const raw = readFileSync(file, 'utf8');
    const text = stripComments(raw);
    const rel = relative(SRC, file).split(sep).join('/');
    // Single-line form: `catch (...) { ... }` all on one line.
    for (const m of text.matchAll(SINGLELINE_CATCH_PATTERN)) {
      // Compute the line number in the original (pre-strip) source. The
      // strip preserves line breaks, so positions are stable.
      const line = raw.slice(0, m.index).split('\n').length;
      if (isExempted(text, m.index, m.index + m[0].length, m[0])) {
        exempted.push(`${rel}:${line} (same-line)`);
        continue;
      }
      offenders.push(`${rel}:${line}`);
    }
    // Multi-line form: header on one line, `}` on a later line. Walk
    // braces to find the matching close.
    for (const m of text.matchAll(MULTILINE_CATCH_PATTERN)) {
      const headerStart = m.index;
      const headerEnd = m.index + m[0].length;
      // Skip if this is part of a single-line match (the SINGLELINE_CATCH_PATTERN
      // would have caught it above). The single-line pattern requires
      // `}\s*` immediately after the open brace, so we check whether the
      // character right after `headerEnd` is `}` (optionally whitespace).
      let probe = headerEnd;
      while (probe < text.length && /\s/.test(text[probe]) && text[probe] !== '\n') probe += 1;
      if (text[probe] === '}') continue; // already counted as single-line
      // Walk to matching close brace.
      let depth = 1;
      let i = probe;
      while (i < text.length && depth > 0) {
        const c = text[i];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        i += 1;
      }
      const body = text.slice(probe, i - 1);
      if (body.trim() !== '') continue;
      const line = raw.slice(0, headerStart).split('\n').length;
      if (isExempted(text, headerStart, headerEnd, body)) {
        exempted.push(`${rel}:${line} (multi-line)`);
        continue;
      }
      offenders.push(`${rel}:${line}`);
    }
  }
  offenders.sort();
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

main();