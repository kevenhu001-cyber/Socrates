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
const EL = args.el ? parseSig(args.el) : null;
const ANC = args.anc ? args.anc.split('|').map(parseSig) : null;
if (!MATCH && !EL) {
  console.error('usage: node scripts/css-war-audit.mjs (--match=<selector-substr> | --el=<tag#id.cls[attr=v]>) [--anc="<anc sig> <anc sig> ..."] [--sel=<regex>] [--prop=<css-prop>]');
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

/* ---------- element signature matching (--el / --anc) ---------- */
// Signatures look like "#sitesPanel.creation-panel.main-page" or
// 'body.workspace-active[data-mode=dark]'. parseSig/parseCompound share the
// same token shape; a compound matches a signature when every simple
// selector the compound names is present in the signature.
function parseSig(sig) {
  const s = { tag: null, ids: new Set(), classes: new Set(), attrs: new Map() };
  const re = /\[[^\]]*\]|#[\w-]+|\.[\w-]+|[a-zA-Z][\w-]*|\*/g;
  for (const m of sig.replace(/::[\w-]+/g, '').matchAll(re)) {
    const tok = m[0];
    if (tok === '*') continue;
    if (tok[0] === '#') s.ids.add(tok.slice(1));
    else if (tok[0] === '.') s.classes.add(tok.slice(1));
    else if (tok[0] === '[') {
      const a = /\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/.exec(tok);
      if (a) s.attrs.set(a[1], a[2] === undefined ? true : a[2]);
    } else s.tag = tok.toLowerCase();
  }
  return s;
}

function parseCompound(c) {
  const out = { tag: null, ids: [], classes: [], attrs: [], not: [], state: false, pseudo: false };
  if (/::[\w-]+|:(?:before|after|first-line|first-letter|backdrop|marker|placeholder|selection|cue|file-selector-button|-webkit-scrollbar[\w-]*)/i.test(c)) out.pseudo = true;
  c = c.replace(/::[\w-]+(?:\([^)]*\))?/g, '');
  c = c.replace(/:not\(([^()]*)\)/g, (_, inner) => { out.not.push(parseCompound(inner)); return ' '; });
  c = c.replace(/:(?:is|has|where)\([^()]*\)/g, () => { out.state = true; return ' '; });
  const re = /\[[^\]]*\]|#[\w-]+|\.[\w-]+|:(?!:)[\w-]+(?:\([^)]*\))?|[a-zA-Z][\w-]*|\*/g;
  for (const m of c.matchAll(re)) {
    const tok = m[0];
    if (tok === '*') continue;
    if (tok[0] === '#') out.ids.push(tok.slice(1));
    else if (tok[0] === '.') out.classes.push(tok.slice(1));
    else if (tok[0] === '[') out.attrs.push(tok);
    else if (tok[0] === ':') out.state = true;
    else out.tag = tok.toLowerCase();
  }
  return out;
}

// compound vs signature: true (always applies) | false (never) | 'cond'
function compoundMatch(comp, sig) {
  if (comp.tag) {
    if (sig.tag && comp.tag !== sig.tag) return false;
    if (!sig.tag) return 'cond';
  }
  for (const id of comp.ids) if (!sig.ids.has(id)) return false;
  for (const cls of comp.classes) if (!sig.classes.has(cls)) return false;
  let cond = false;
  for (const a of comp.attrs) {
    const m = /\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/.exec(a);
    if (!m) { cond = true; continue; }
    if (sig.attrs.has(m[1])) {
      if (m[2] !== undefined && String(sig.attrs.get(m[1])) !== m[2]) return false;
    } else cond = true; // attribute may still be set at runtime
  }
  for (const n of comp.not) {
    const r = compoundMatch(n, sig);
    if (r === true) return false;
    if (r === 'cond') cond = true;
  }
  if (comp.state) cond = true;
  return cond ? 'cond' : true;
}

// split a complex selector into compounds on combinators (paren/bracket aware)
function splitCompounds(sel) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// 'yes' | 'cond' | 'no': last compound must match the element signature and
// earlier compounds must hit ancestors in order. With no --anc, selectors
// with ancestor compounds are conditional (they may match some ancestor).
function selectorApplies(sel) {
  const comps = splitCompounds(sel);
  if (!comps.length) return 'no';
  let verdict = 'yes';
  const lastComp = parseCompound(comps[comps.length - 1]);
  // Declarations on a pseudo-element apply to the pseudo, not the element —
  // they can never compete for the element's own props.
  if (lastComp.pseudo) return 'no';
  const last = compoundMatch(lastComp, EL);
  if (last === false) return 'no';
  if (last === 'cond') verdict = 'cond';
  let ai = 0;
  for (let i = 0; i < comps.length - 1; i++) {
    if (!ANC) { verdict = 'cond'; continue; }
    const comp = parseCompound(comps[i]);
    let hit = null;
    for (; ai < ANC.length; ai++) {
      const r = compoundMatch(comp, ANC[ai]);
      if (r !== false) { hit = r; ai++; break; }
    }
    if (hit === null) return 'no';
    if (hit === 'cond') verdict = 'cond';
  }
  return verdict;
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
      if (SEL && !SEL.test(sel)) continue;
      let elCond = false;
      if (EL) {
        const v = selectorApplies(sel);
        if (v === 'no') continue;
        elCond = v === 'cond';
      } else if (!sel.includes(MATCH)) continue;
      for (const decl of rule.nodes || []) {
        if (decl.type !== 'decl') continue;
        if (decl.prop.startsWith('--')) continue;
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
          stateful: STATEFUL.test(sel) || elCond,
          order: order++,
        });
      }
    }
  });
});

/* ---------- winner computation ---------- */
const CONTEXTS = [
  { name: 'desktop', width: 1440 },
  { name: 'narrow', width: 1000 },
  { name: 'tablet', width: 850 },
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

const LOSERS = !!args.losers;
const fmt = (c) => `${c.file}:${c.line} [${c.spec.join(',')}]${c.important ? ' !' : ''}${c.stateful ? ' (stateful)' : ''}`;

for (const [prop, list] of byProp) {
  if (!LOSERS) console.log(`\n=== ${prop} ===`);
  for (const ctx of CONTEXTS) {
    const applicable = list.filter((c) => applies(c, ctx) !== 'no');
    const conditional = applicable.filter((c) => applies(c, ctx) === 'cond' || c.stateful);
    const definite = applicable.filter((c) => applies(c, ctx) === 'yes' && !c.stateful);
    const pool = definite.length ? definite : applicable;
    if (!pool.length) {
      if (!LOSERS) console.log(`  ${ctx.name.padEnd(7)} winner: — (no candidate applies)`);
      continue;
    }
    const winner = pool.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
    if (LOSERS) {
      // A decl is only reported dead when it loses in EVERY context it can
      // apply in: a mid-width or state-dependent win elsewhere means it is
      // still live somewhere.
      for (const c of pool) {
        if (c === winner) continue;
        const stillAlive = CONTEXTS.some((o) => {
          if (applies(c, o) === 'no') return false;
          const opool = (() => {
            const app = list.filter((x) => applies(x, o) !== 'no');
            const def = app.filter((x) => applies(x, o) === 'yes' && !x.stateful);
            return def.length ? def : app;
          })();
          const ow = opool.reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
          return cmp(ow, c) <= 0; // c wins or ties (ties keep it: same value anyway)
        });
        const conditionalOutranks = conditional.some((o) => o !== c && cmp(o, c) > 0);
        if (!stillAlive && !c.stateful && !conditionalOutranks) {
          console.log(`${ctx.name}\t${prop}\t${c.file}:${c.line}\t${c.value}\t<- loses to ${winner.file}:${winner.line}`);
        }
      }
      continue;
    }
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
  if (!LOSERS) {
    const list2 = [...list].sort((a, b) => cmp(b, a));
    for (const c of list2) {
      console.log(`    ${c.important ? '!' : ' '} ${fmt(c)}  ${c.value}`);
    }
  }
}
