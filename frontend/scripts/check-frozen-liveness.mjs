#!/usr/bin/env node
/*
 * scripts/check-frozen-liveness.mjs — retirement ratchet for the frozen CSS
 * compatibility trees (styles/legacy/ and styles/restore/).
 *
 * Those two directories are the historical cascade foundation. They are
 * imported before the canonical owners and are allowed to keep only rules
 * that still match a class the application actually emits. A rule whose
 * selector names a class that no source file mentions cannot style anything:
 * it is a stylesheet describing a DOM that no longer exists.
 *
 * This guard makes that machine-checked. For every rule in every frozen
 * stylesheet it extracts the identity classes of the selector and asks
 * whether ANY of them appears as a word in the first-party source corpus
 * (frontend/src, frontend/test, frontend/e2e, packages/, server/src,
 * index.html — the CSS tree itself is excluded so a selector cannot vouch
 * for itself). A rule with no surviving identity class is counted as dead.
 *
 * The dead count is ratcheted per file: it may only go DOWN. Retiring rules
 * lowers it with `--update`; re-adding a rule against a class nobody emits
 * raises it and fails.
 *
 * Two things deliberately do not count as death:
 *   - generic state words (`.selected`, `.ok`, `.active`, …), which appear on
 *     unrelated elements in every file and would mask real deaths;
 *   - framework- or vendor-owned tokens, which the app never spells out.
 *
 * Usage:
 *   node scripts/check-frozen-liveness.mjs
 *   node scripts/check-frozen-liveness.mjs --update
 *   node scripts/check-frozen-liveness.mjs --verbose   # per-rule detail
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(FRONTEND, '..');
const STYLES = join(FRONTEND, 'src', 'styles');
const BASELINE = join(FRONTEND, 'scripts', 'frozen-liveness.baseline.json');
const UPDATE = process.argv.includes('--update');
const VERBOSE = process.argv.includes('--verbose');

const FROZEN_DIRS = ['legacy', 'restore'];
const SOURCE_EXT = ['.ts', '.tsx', '.js', '.mjs', '.html'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'test-results',
  'debug',
  'coverage',
  'styles',
  'vendor-files',
  '.vite',
]);

/* State words that ride on top of an identity class. They carry no meaning on
 * their own, so letting them decide liveness would keep every `.selected`
 * rule alive even after its component is gone. */
const GENERIC_STATE = new Set([
  'selected',
  'active',
  'open',
  'closed',
  'opened',
  'ok',
  'bad',
  'err',
  'error',
  'warn',
  'warning',
  'loading',
  'loaded',
  'disabled',
  'hidden',
  'visible',
  'correct',
  'wrong',
  'done',
  'current',
  'expanded',
  'collapsed',
  'on',
  'off',
  'recorded',
  'pending',
  'success',
  'fail',
  'failed',
  'empty',
  'live',
  'settled',
  'in',
  'out',
  'all',
  'none',
  'checked',
  'focus',
  'hovered',
  'dark',
  'light',
  'mobile',
  'desktop',
  'true',
  'false',
  'first',
  'last',
  'even',
  'odd',
  'assistant',
  'user',
  'system',
  'file',
  'code',
  'read',
  'write',
  'edit',
]);

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return out;
    throw error;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.tmp-')) continue;
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const corpusFiles = [
  ...walk(join(FRONTEND, 'src'), SOURCE_EXT),
  ...walk(join(FRONTEND, 'test'), SOURCE_EXT),
  ...walk(join(FRONTEND, 'e2e'), SOURCE_EXT),
  ...walk(join(REPO, 'packages'), SOURCE_EXT),
  ...walk(join(REPO, 'server', 'src'), ['.ts', '.js']),
];
if (existsSync(join(FRONTEND, 'index.html'))) corpusFiles.push(join(FRONTEND, 'index.html'));

const corpus = corpusFiles
  .filter((file) => !file.split(sep).includes('styles'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function referenced(cls) {
  return new RegExp('(?<![\\w-])' + escapeRe(cls) + '(?![\\w-])').test(corpus);
}

/* The identity classes of one rule. A rule dies when NONE of its identity
 * classes is emitted anywhere: an ancestor that never renders takes every
 * descendant rule with it. */
function identityClasses(selector) {
  const classes = new Set();
  for (const part of selector.split(',')) {
    for (const m of part.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(m[1]);
  }
  const own = [...classes].filter((c) => !GENERIC_STATE.has(c) && !/^(?:is|has)-/.test(c));
  return own.length ? own : [...classes];
}

function frozenFiles() {
  const out = [];
  for (const dir of FROZEN_DIRS) {
    const abs = join(STYLES, dir);
    for (const file of walk(abs, ['.css'])) {
      const rel = relative(STYLES, file).split(sep).join('/');
      if (rel.endsWith('/index.css')) continue; // pure manifests
      out.push({ rel, file });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

const results = [];
for (const { rel, file } of frozenFiles()) {
  const ast = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  const dead = [];
  let rules = 0;
  ast.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === 'atrule' && /keyframes|-webkit-keyframes/.test(parent.name))
      return;
    const classes = identityClasses(rule.selector);
    if (!classes.length) return; // element/id-only rule — not class-addressable
    rules += 1;
    if (classes.some((cls) => referenced(cls))) return;
    dead.push({
      line: rule.source.start.line,
      selector: rule.selector.replace(/\s+/g, ' ').trim(),
    });
  });
  results.push({ file: rel, rules, dead });
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { dead: {} };
const previous = baseline.dead || {};

const grew = [];
let totalDead = 0;
for (const { file, rules, dead } of results) {
  totalDead += dead.length;
  const was = previous[file];
  if (was !== undefined && dead.length > was) grew.push({ file, was, now: dead.length, dead });
}

if (VERBOSE) {
  for (const { file, rules, dead } of results) {
    if (!dead.length) continue;
    console.log(`\n${file}  ${dead.length}/${rules} dead`);
    for (const d of dead) console.log(`  L${d.line}  ${d.selector}`);
  }
}

if (UPDATE) {
  const next = {
    description:
      'Dead rules per frozen stylesheet (no identity class emitted by any first-party source). Shrink-only.',
    generatedBy: 'check-frozen-liveness.mjs --update',
    dead: Object.fromEntries(results.map((r) => [r.file, r.dead.length])),
  };
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`frozen-liveness: baseline updated (dead total ${totalDead}).`);
  process.exit(0);
}

if (grew.length) {
  for (const g of grew) {
    console.error(`frozen-liveness: ${g.file} grew ${g.was} -> ${g.now} dead rules`);
    for (const d of g.dead.slice(0, 10)) console.error(`  L${d.line}  ${d.selector}`);
  }
  console.error(
    'A frozen rule whose class no source emits cannot style anything. Delete it, or emit the class.',
  );
  process.exit(1);
}

/* A rule count that fell without --update is a win, not a failure: printed so
 * the author can lock it in with --update, but the gate stays green. */
const shrank = results.filter(
  (r) => previous[r.file] !== undefined && r.dead.length < previous[r.file],
);
if (shrank.length) {
  console.log(
    `frozen-liveness: ${shrank.length} file(s) below baseline — run --update to lock the reduction in.`,
  );
}

console.log(
  `frozen-liveness check passed (${totalDead} dead rules across ${results.length} files).`,
);
