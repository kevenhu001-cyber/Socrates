#!/usr/bin/env node
/*
 * Retire frozen CSS rules by SELECTOR, never by line number.
 *
 * Line-number seeds were unsafe here: a rule's audit line points at the first
 * selector of a multi-line list, so pruning by line can delete a sibling
 * selector that is still live (`.workspace-table-head, .library-row`). Instead
 * this tool re-derives death from the selector itself:
 *
 *   - parse the file, walk every rule;
 *   - split it into its comma-separated selectors;
 *   - keep the selectors whose identity classes are still emitted;
 *   - delete the selectors that are not.
 *
 * A rule with survivors is REWRITTEN to just those selectors (declarations
 * untouched, byte-identical); a rule with none is removed whole. So a dead
 * half of a selector list never takes a live half with it, and a surviving
 * declaration is never re-typed by this tool.
 *
 *   node scripts/retire-frozen-css.mjs src/styles/legacy/10-tutor-scaffolds.css --dry
 *   node scripts/retire-frozen-css.mjs src/styles/legacy/*.css
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const FRONTEND = 'C:/Users/Jiacheng/Desktop/Socrates/frontend';
const REPO = 'C:/Users/Jiacheng/Desktop/Socrates';
const DRY = process.argv.includes('--dry');
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const SOURCE_EXT = ['.ts', '.tsx', '.js', '.mjs', '.html'];
const SKIP = new Set([
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

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !e.name.startsWith('.tmp-')) walk(p, out);
    } else if (SOURCE_EXT.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const corpus = [
  ...walk(join(FRONTEND, 'src')),
  ...walk(join(FRONTEND, 'test')),
  ...walk(join(FRONTEND, 'e2e')),
  ...walk(join(REPO, 'packages')),
  ...walk(join(REPO, 'server', 'src')),
  join(FRONTEND, 'index.html'),
]
  .filter((f) => !f.split(/[\\/]/).includes('styles'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/* Generic state words never carry identity on their own. */
const GENERIC = new Set([
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
  'first',
  'last',
  'even',
  'odd',
  'assistant',
  'user',
  'system',
]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const referenced = (cls) => new RegExp('(?<![\\w-])' + escapeRe(cls) + '(?![\\w-])').test(corpus);

/* One selector survives when EVERY identity class in it is still emitted.
 * All-of, not any-of: `.inline-proof > .ui-collapse-inner` cannot match once
 * `.inline-proof` is gone, even though `.ui-collapse-inner` exists elsewhere. */
function selectorAlive(selector) {
  const classes = [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)]
    .map((m) => m[1])
    .filter((c) => !GENERIC.has(c) && !/^(?:is|has)-/.test(c));
  if (!classes.length) return true; // no identity class — not ours to judge
  return classes.every(referenced);
}

let totalRemoved = 0;
let totalShrunk = 0;
for (const target of targets) {
  const text = readFileSync(target, 'utf8');
  const ast = postcss.parse(text, { from: target });
  const edits = []; // { rule, keep: string[] | null }

  ast.walkRules((rule) => {
    const parent = rule.parent;
    if (parent && parent.type === 'atrule' && /keyframes/.test(parent.name)) return;
    const selectors = rule.selectors;
    if (selectors.length === 1) {
      if (!selectorAlive(selectors[0])) edits.push({ rule, keep: null });
      return;
    }
    const keep = selectors.filter(selectorAlive);
    if (keep.length === selectors.length) return;
    edits.push({ rule, keep: keep.length ? keep : null });
  });

  if (!edits.length) {
    console.log(`${target}: already at fixed point`);
    continue;
  }
  if (DRY) {
    for (const e of edits) {
      const label = e.keep ? `shrink -> ${e.keep.join(', ')}` : 'remove';
      console.log(
        `  L${e.rule.source.start.line}  ${label}\n      ${e.rule.selector.replace(/\s+/g, ' ').slice(0, 100)}`,
      );
    }
    console.log(`${target}: ${edits.length} rules would change`);
    continue;
  }

  for (const e of edits) {
    if (e.keep) {
      e.rule.selector = e.keep.join(', ');
      totalShrunk += 1;
    } else {
      e.rule.remove();
      totalRemoved += 1;
    }
  }
  /* Drop at-rule wrappers left with nothing inside. */
  ast.walkAtRules((at) => {
    if (!at.nodes || !at.nodes.length) at.remove();
  });
  writeFileSync(target, ast.toString());
  console.log(`${target}: ${edits.length} rules changed`);
}
console.log(`\nremoved ${totalRemoved} rules, narrowed ${totalShrunk} selector lists`);
