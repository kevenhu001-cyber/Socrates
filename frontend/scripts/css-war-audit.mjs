#!/usr/bin/env node
/*
 * scripts/css-war-audit.mjs — cascade winner matrix for a selector pattern.
 *
 * Walks every stylesheet in true cascade order (following styles/index.css
 * @imports), collects every rule whose selector contains --match=<substr>,
 * and for each declaration answers: which rule wins at desktop (1440px) and
 * at mobile (390px)? Winners are computed with real cascade ranking —
 * !important > specificity > source order — while @media width bounds and
 * state-dependent selectors (:not([data-*]), [data-mode], :hover, …) are
 * reported, not resolved.
 *
 * Use it before stripping !important: a live decl whose flag can be dropped
 * still wins if every higher-ranked competitor also loses its flag.
 *
 *   node scripts/css-war-audit.mjs --match='.topic-title.greeting'
 *   node scripts/css-war-audit.mjs --match='#composerToolsMenu' --prop=border-radius
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const MATCH = args.match;
const PROP = args.prop;
const SEL = args.sel ? new RegExp(args.sel) : null;
if (!MATCH) {
  console.error('usage: node scripts/css-war-audit.mjs --match=<selector-substr> [--sel=<regex-on-full-selector>] [--prop=<css-prop>]');
  process.exit(2);
}

/* ---------- cascade order: follow @import from index.css ---------- */
function importOrder(entry) {
  const out = [];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/@import\s+'([^']+)'/g)) {
      const target = join(dirname(file), m[1]);
      visit(target);
    }
    out.push(file);
  };
  visit(entry);
  return out;
}

/* ---------- specificity: (ids, classes+attrs+pseudo-classes, elements) ---------- */
function specificity(sel) {
  // :where() contributes nothing; :not()/:is()/:has() contribute their arg.
  let s = sel.replace(/:where\(([^)]*)\)/g, '');
  let inner = 0;
  s = s.replace(/:(?:not|is|has)\(([^()]*)\)/g, (_, arg) => {
    const [a, b, c] = specificity(arg);
    inner += a * 1e6 + b * 1e3 + c; // accumulate flattened
    return ' ';
  });
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]*\]/g) || []).length +
    (s.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
  const cleaned = s
    .replace(/#[\w-]+/g, ' ')
    .replace(/\.[\w-]+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/::?[\w-]+(?:\([^)]*\))?/g, ' ')
    .replace(/\*/g, ' ');
  const elements = cleaned
    .split(/[\s>+~,]+/)
    .filter((t) => /^[a-zA-Z][\w-]*$/.test(t)).length;
  const flat = inner; // inner contributions
  const a = ids + Math.floor(flat / 1e6);
  const b = classes + Math.floor((flat % 1e6) / 1e3);
  const c = elements + (flat % 1e3);
  return [a, b, c];
}

/* ---------- state-dependent selector detection ---------- */
const STATEFUL = /:(?:not|is|has)\([^)]*(?:\[data-|\[aria-|\.|:)|\[data-|\[aria-|:(?:hover|focus|active|focus-visible|focus-within|checked|disabled|placeholder-shown|first-child|last-child|nth-|only-child|empty|link|visited|target|lang|dir|root|not)/;

/* ---------- @media evaluation ---------- */
// returns 'yes' | 'no' | 'cond' (non-width condition we can't evaluate)
function mediaVerdict(params, viewportWidth) {
  let sawWidth = false;
  let widthOk = false;
  let conditional = false;
  for (const part of params.split(',')) {
    const p = part.trim().toLowerCase();
    if (/print|speech|tv\b/.test(p)) continue;
    let partWidthOk = true;
    let partSawWidth = false;
    for (const m of p.matchAll(/\(([^)]+)\)/g)) {
      const cond = m[1];
      const mm = /^(min|max)-width\s*:\s*([\d.]+)px$/.exec(cond.trim());
      if (mm) {
        partSawWidth = true;
        const [, dir, val] = mm;
        const ok = dir === 'min' ? viewportWidth >= +val : viewportWidth <= +val;
        if (!ok) partWidthOk = false;
      } else if (/prefers-|orientation|color-scheme|hover|pointer|aspect-ratio|height/.test(cond)) {
        conditional = true; // state/media-feature we can't resolve
      }
      // unknown conditions: treat as satisfied-but-flagged? keep conditional
      if (!mm && !/prefers-|orientation|color-scheme|hover|pointer|aspect-ratio|height/.test(cond)) {
        conditional = true;
      }
    }
    if (partSawWidth) sawWidth = true;
    if (partWidthOk) widthOk = true;
  }
  if (!sawWidth) return conditional ? 'cond' : 'yes';
  if (!widthOk) return 'no';
  return conditional ? 'cond' : 'yes';
}

/* ---------- collect candidates ---------- */
const files = importOrder(join(STYLES, 'index.css'));
const candidates = []; // {fileIdx, file, line, selector, spec, important, prop, value, media:[verdicts], stateful, order}

let order = 0;
files.forEach((file, fileIdx) => {
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  root.walkRules((rule) => {
    // media chain, outermost first
    const medias = [];
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule') medias.unshift(p.params);
    }
    for (const sel of rule.selectors) {
      if (!sel.includes(MATCH)) continue;
      if (SEL && !SEL.test(sel)) continue;
      for (const decl of rule.nodes || []) {
        if (decl.type !== 'decl') continue;
        if (PROP && decl.prop !== PROP) continue;
        candidates.push({
          fileIdx,
          file: relative(STYLES, file),
          line: decl.source?.start?.line ?? rule.source?.start?.line,
          selector: sel.trim(),
          spec: specificity(sel),
          important: !!decl.important,
          prop: decl.prop,
          value: decl.value.replace(/\s+/g, ' ').slice(0, 80),
          medias,
          stateful: STATEFUL.test(sel),
          order: order++,
        });
      }
    }
  });
});

/* ---------- winner computation ---------- */
const CONTEXTS = [
  { name: 'desktop', width: 1440 },
  { name: 'mobile', width: 390 },
];

function applies(c, ctx) {
  for (const m of c.medias) {
    const v = mediaVerdict(m, ctx.width);
    if (v === 'no') return 'no';
    if (v === 'cond') return 'cond';
  }
  return 'yes';
}

const score = (c) => [c.important ? 1 : 0, ...c.spec, c.order];
const cmp = (a, b) => {
  const sa = score(a), sb = score(b);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
  return 0;
};

const byProp = new Map();
for (const c of candidates) {
  if (!byProp.has(c.prop)) byProp.set(c.prop, []);
  byProp.get(c.prop).push(c);
}

const fmt = (c) => `${c.file}:${c.line} [${c.spec.join(',')}]${c.important ? ' !' : ''}${c.stateful ? ' (stateful)' : ''}`;

for (const [prop, list] of byProp) {
  console.log(`\n=== ${prop} ===`);
  for (const ctx of CONTEXTS) {
    const applicable = list.filter((c) => applies(c, ctx) !== 'no');
    const conditional = applicable.filter((c) => applies(c, ctx) === 'cond' || c.stateful);
    const definite = applicable.filter((c) => applies(c, ctx) === 'yes' && !c.stateful);
    const pool = definite.length ? definite : applicable;
    if (!pool.length) {
      console.log(`  ${ctx.name.padEnd(7)} winner: — (no candidate applies)`);
      continue;
    }
    const winner = pool.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
    const condWinner = conditional.length
      ? conditional.reduce((a, b) => (cmp(a, b) >= 0 ? a : b))
      : null;
    const beatsWinner = condWinner && cmp(condWinner, winner) > 0;
    console.log(
      `  ${ctx.name.padEnd(7)} winner: ${fmt(winner)}  = ${winner.value}` +
        (beatsWinner ? `  ⚠ conditional override possible: ${fmt(condWinner)} = ${condWinner.value}` : '')
    );
  }
  // losers carrying !important or sitting in live files are the actionable rows
  const list2 = [...list].sort((a, b) => cmp(b, a));
  for (const c of list2) {
    console.log(`    ${c.important ? '!' : ' '} ${fmt(c)}  ${c.value}`);
  }
}
