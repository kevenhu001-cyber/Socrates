#!/usr/bin/env node
/*
 * scripts/check-css-debt.mjs — CSS design-debt ratchet + cascade guard.
 *
 * Two machine-checked rules (the 2026-09-23 audit's "Remaining work" item):
 *
 * 1. Cascade order: styles/index.css must import the tiers in the documented
 *    order (tokens → legacy → modular → restore → polish). Reordering across
 *    tiers silently flips which layer owns a surface.
 *
 * 2. Debt ratchet: for every stylesheet under src/styles we count
 *    `!important`, literal hex colors, and literal px border-radius values.
 *    legacy/ and restore/ are frozen historical zones; every other directory
 *    is "live". Counts may only go DOWN — if a metric grows past its baseline
 *    the check fails. Shrink the baseline with --update after an intentional
 *    reduction.
 *
 * Usage:  node scripts/check-css-debt.mjs [--update]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const BASELINE = join(FRONTEND, 'scripts', 'css-debt.baseline.json');
const UPDATE = process.argv.includes('--update');

const FROZEN_DIRS = new Set(['legacy', 'restore']);

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function walkCss(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkCss(p));
    else if (entry.name.endsWith('.css')) out.push(p);
  }
  return out;
}

function countMetric(re, text) {
  let n = 0;
  while (re.exec(text) !== null) n += 1;
  return n;
}

const METRICS = {
  important: /!important/g,
  hexColor: /#[0-9a-fA-F]{3,8}\b/g,
  literalRadius: /border-radius:\s*(?:[0-9.]+px|var\([^)]*\)\s+[0-9.]+px)/g,
};

/* ---------- 1. cascade order ---------- */
function checkCascadeOrder() {
  const indexCss = readFileSync(join(STYLES, 'index.css'), 'utf8');
  const imports = [...indexCss.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1]);
  const tierOf = (spec) => {
    if (spec === './tokens.css' || spec === './themes.css') return 1;
    if (spec.startsWith('./legacy/')) return 2;
    if (spec.startsWith('./restore/')) return 4;
    if (spec.startsWith('./polish/')) return 5;
    if (spec.startsWith('./foundations/') || spec.startsWith('./layout/')
      || spec.startsWith('./components/') || spec.startsWith('./features/')) return 3;
    return 3; // unknown modular path — treat as tier 3
  };
  const problems = [];
  const tiers = imports.map(tierOf);
  for (let i = 1; i < tiers.length; i += 1) {
    // Tiers must be non-decreasing EXCEPT that index.css imports one file
    // per tier (legacy/index.css etc.), which is already handled because the
    // nested order lives inside those index files. Here we only check the
    // top-level manifest.
    if (tiers[i] < tiers[i - 1]) {
      problems.push(`tier regression: '${imports[i]}' (tier ${tiers[i]}) imported after '${imports[i - 1]}' (tier ${tiers[i - 1]})`);
    }
  }
  // polish must be the final import; restore must precede it directly.
  if (tiers[tiers.length - 1] !== 5) problems.push('last import must be a polish/ file');
  if (!imports.includes('./polish/index.css')) problems.push('polish/index.css missing from styles/index.css');
  return problems;
}

/* ---------- 2. debt ratchet ---------- */
function collectCounts() {
  const totals = { live: {}, frozen: {} };
  for (const dir of ['live', 'frozen']) totals[dir] = Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0]));
  const perFile = {};
  for (const file of walkCss(STYLES)) {
    const rel = relative(STYLES, file).split(sep).join('/');
    const top = rel.split('/')[0];
    const zone = FROZEN_DIRS.has(top) ? 'frozen' : 'live';
    const text = stripComments(readFileSync(file, 'utf8'));
    perFile[rel] = { zone };
    for (const [name, re] of Object.entries(METRICS)) {
      const n = countMetric(re, text);
      totals[zone][name] += n;
      perFile[rel][name] = n;
    }
  }
  return { totals, perFile };
}

function main() {
  const orderProblems = checkCascadeOrder();
  const { totals } = collectCounts();

  let baseline = null;
  if (existsSync(BASELINE)) {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  }

  const failures = [...orderProblems.map((p) => `cascade: ${p}`)];

  if (!baseline) {
    writeFileSync(BASELINE, JSON.stringify({ totals, generatedBy: 'check-css-debt.mjs --update' }, null, 2) + '\n');
    console.log('css-debt: no baseline found — wrote scripts/css-debt.baseline.json from current counts.');
    console.log('Review the numbers, commit the baseline, and re-run. Growth beyond it will now fail.');
  } else if (UPDATE) {
    const shrunk = {};
    for (const zone of Object.keys(totals)) {
      shrunk[zone] = {};
      for (const metric of Object.keys(totals[zone])) {
        const cur = totals[zone][metric];
        const base = baseline?.totals?.[zone]?.[metric] ?? cur;
        // ratchet: only ever record the smaller number, never grow the budget
        shrunk[zone][metric] = Math.min(cur, base);
      }
    }
    writeFileSync(BASELINE, JSON.stringify({ totals: shrunk, generatedBy: 'check-css-debt.mjs --update' }, null, 2) + '\n');
    console.log('css-debt: baseline updated (counts only ever shrink).');
  } else {
    for (const zone of ['live', 'frozen']) {
      for (const metric of Object.keys(METRICS)) {
        const cur = totals[zone][metric];
        const base = baseline?.totals?.[zone]?.[metric];
        if (base == null) { failures.push(`baseline missing ${zone}.${metric}`); continue; }
        if (cur > base) {
          failures.push(`${zone}.${metric}: ${cur} > baseline ${base} (+${cur - base}). Design debt may only shrink — revert the additions or, if intentional, migrate the rule into an existing token/layer.`);
        }
      }
    }
  }

  if (failures.length) {
    console.error('css-debt check FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
  } else if (!baseline || UPDATE) {
    // informational paths above already printed; exit 0
  } else {
    console.log('css-debt check passed (live:', JSON.stringify(totals.live), '| frozen:', JSON.stringify(totals.frozen), ')');
  }
}

main();
