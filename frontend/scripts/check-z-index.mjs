#!/usr/bin/env node
/*
 * scripts/check-z-index.mjs — layering ratchet.
 *
 * The stacking contract lives in styles/tokens.css:
 *
 *   --ui-z-header:    20
 *   --ui-z-panel:     30
 *   --ui-z-menu:      40
 *   --ui-z-backdrop:  80
 *   --ui-z-drawer:    90
 *   --ui-z-popover:  200
 *   --ui-z-modal:    400
 *   --ui-z-sheet:   1600
 *
 * A literal `z-index` in a live sheet is a stacking decision made in the
 * dark. Small integers (0–9) are legitimate *local* stacking inside one
 * component's own context, so they are allowed. Anything at or above 10 is
 * reaching across components and must go through a `--ui-z-*` token (or a
 * `calc()` of one). Without this rule the overlay stack drifts into magic
 * numbers — `1500` for a toast, `1600` for a tool card, `2400` for a tutor
 * overlay — and two surfaces silently fight for the top.
 *
 * legacy/ and restore/ are frozen historical zones and are exempt, exactly
 * as in check-css-debt.mjs and check-button-sizes.mjs — see FROZEN_DIRS.
 *
 * Shrinking the baseline is an explicit act: run with --update.
 *
 * Usage:  node scripts/check-z-index.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const BASELINE = join(FRONTEND, 'scripts', 'z-index.baseline.json');
const UPDATE = process.argv.includes('--update');

/* Frozen historical zones — same split as check-css-debt.mjs. */
const FROZEN_DIRS = new Set(['legacy', 'restore']);

/* A z-index of 0–9 is local stacking inside one component and needs no
 * token. 10 and above reaches across components and must use a --ui-z-* rung. */
const LOCAL_MAX = 9;

/* Any value containing a var() is token-driven (or a calc of one) and is
 * always allowed. Named keywords are allowed too. */
const KEYWORDS = new Set(['auto', 'initial', 'inherit', 'unset', 'revert', 'revert-layer']);

const Z_PROP = /(^|[\s;{])z-index\s*:\s*([^;{}]+)/gi;

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (FROZEN_DIRS.has(entry.name)) continue;
      walk(p, out);
    } else if (entry.name.endsWith('.css')) {
      out.push(p);
    }
  }
  return out;
}

/* Strip comments so a commented-out rule never counts as live debt. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function isOffender(value) {
  const v = value.trim();
  if (KEYWORDS.has(v.toLowerCase())) return false;
  if (v.includes('var(')) return false;
  if (/^-?\d+$/.test(v)) return Math.abs(Number(v)) > LOCAL_MAX;
  /* Anything else (calc without var, env(), etc.) is left alone to avoid
   * false positives; the token ladder covers the real cases. */
  return false;
}

function collect() {
  const files = walk(STYLES, []);
  const hits = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      Z_PROP.lastIndex = 0;
      let m;
      while ((m = Z_PROP.exec(line)) !== null) {
        const value = m[2].trim();
        if (!isOffender(value)) continue;
        /* Attribute to the nearest preceding selector line, like
         * check-button-sizes.mjs, for a readable report. */
        let selector = null;
        for (let j = i; j >= 0 && j > i - 14; j--) {
          const cand = lines[j].trim();
          if (!cand.includes('{') || cand.startsWith('@')) continue;
          selector = cand.replace(/\s*\{\s*$/, '');
          break;
        }
        hits.push({
          file: relative(STYLES, file).split(sep).join('/'),
          line: i + 1,
          value,
          selector: (selector || '?').slice(0, 90),
        });
      }
    });
  }
  return { hits, scanned: files.length };
}

function main() {
  const { hits, scanned } = collect();

  let baseline = null;
  if (existsSync(BASELINE)) {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  }

  const failures = [];

  if (!baseline) {
    writeFileSync(
      BASELINE,
      JSON.stringify({ offenders: hits.length, generatedBy: 'check-z-index.mjs --update' }, null, 2) + '\n',
    );
    console.log(
      `z-index: no baseline found — wrote scripts/z-index.baseline.json (${hits.length} off-token declarations across ${scanned} live sheets).`,
    );
    console.log('Review the list below, commit the baseline, and re-run. Growth beyond it now fails.');
  } else if (UPDATE) {
    const shrunk = Math.min(hits.length, baseline.offenders ?? hits.length);
    writeFileSync(
      BASELINE,
      JSON.stringify({ offenders: shrunk, generatedBy: 'check-z-index.mjs --update' }, null, 2) + '\n',
    );
    console.log(`z-index: baseline updated to ${shrunk} (counts only ever shrink).`);
  } else if (hits.length > baseline.offenders) {
    failures.push(
      `off-token z-index values: ${hits.length} > baseline ${baseline.offenders} (+${hits.length - baseline.offenders}). ` +
        `Use --ui-z-header (20) / --ui-z-panel (30) / --ui-z-menu (40) / --ui-z-backdrop (80) / --ui-z-drawer (90) / --ui-z-popover (200) / --ui-z-modal (400) / --ui-z-sheet (1600), ` +
        `or a calc() of one. Local stacking (0–9) is allowed.`,
    );
  }

  if (failures.length) {
    console.error('z-index check FAILED:');
    for (const f of failures) console.error('  - ' + f);
    console.error('\nOff-token declarations:');
    for (const h of hits) {
      console.error(`  ${h.file}:${h.line}  z-index: ${h.value}  … ${h.selector}`);
    }
    process.exitCode = 1;
  } else if (!baseline || UPDATE) {
    // informational paths above already printed
  } else {
    console.log(
      `z-index check passed (${hits.length}/${baseline.offenders} off-token declarations across ${scanned} live sheets; token rungs 20/30/40/80/90/200/400/1600).`,
    );
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-z-index.mjs')) {
  main();
}
