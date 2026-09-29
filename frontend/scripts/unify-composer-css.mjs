// scripts/unify-composer-css.mjs — one-off: make styles/parity/composer-unified.css
// the ONLY stylesheet that styles the composer (#topicInputWrap / #chatInputWrap).
//
// Deletes, at every width, each selector whose subject is the composer shell
// or one of its controls/editor (same matcher as migrate-surface-css.mjs), in
// every stylesheet except the unified one. Voice-recording, attachment-chip
// and popover rules are kept (they are separate components), but any of them
// that still names a removed wrapper class is reported.
//
//   node scripts/unify-composer-css.mjs --dry
//   node scripts/unify-composer-css.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

import { COMPOSER_SURFACE, matchesSurface } from './composer-surface.mjs';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const OWNER = join(STYLES, 'parity', 'composer-unified.css');
const dry = process.argv.includes('--dry');
const REMOVED = /chat-composer-body|chat-input-footer|topic-footer/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.css') ? [p] : [];
  });
}

function inKeyframes(rule) {
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule' && /keyframes/i.test(p.name)) return true;
  }
  return false;
}

let total = 0;
const stale = [];
for (const file of walk(STYLES)) {
  if (file === OWNER) continue;
  const src = readFileSync(file, 'utf8');
  const root = postcss.parse(src, { from: file });
  let removed = 0;
  const rules = [];
  root.walkRules((r) => { rules.push(r); });
  for (const rule of rules) {
    if (inKeyframes(rule)) continue;
    const sels = rule.selectors;
    const hit = sels.filter((s) => matchesSurface(COMPOSER_SURFACE, s));
    const keep = sels.filter((s) => !hit.includes(s));
    for (const s of keep) if (REMOVED.test(s)) stale.push(`${relative(FRONTEND, file)}: ${s}`);
    if (!hit.length) continue;
    removed += hit.length;
    if (keep.length) rule.selectors = keep;
    else rule.remove();
  }
  // Drop at-rules left empty (repeat: nested media).
  for (let i = 0; i < 3; i++) root.walkAtRules((a) => { if (a.nodes && a.nodes.length === 0) a.remove(); });
  if (removed) {
    total += removed;
    console.log(`${relative(FRONTEND, file)}: removed ${removed} selectors`);
    if (!dry) writeFileSync(file, root.toString());
  }
}
console.log(`total removed: ${total}${dry ? ' (dry run)' : ''}`);
if (stale.length) {
  console.log('\nkept rules still naming a removed wrapper class:');
  for (const s of stale) console.log('  ' + s);
}
