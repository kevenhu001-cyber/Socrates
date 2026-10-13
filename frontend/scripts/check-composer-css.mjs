#!/usr/bin/env node
/*
 * scripts/check-composer-css.mjs — composer ownership guard.
 *
 * The landing and conversation composers are one shared component. Styling is
 * allowed in exactly two files, split by responsibility rather than by DOM:
 *   - src/styles/parity/composer-unified.css — shared contract, desktop and
 *     expanded/feature states
 *   - src/styles/parity/composer-mobile.css — <=768px resting geometry
 *
 * The mobile owner is additionally required to stay inside a <=768px media
 * query. Any other stylesheet that styles the shell, its controls or editor
 * (see scripts/composer-surface.mjs for the matcher) fails this check.
 *
 * The removed wrapper classes (.chat-composer-body, .chat-input-footer,
 * .topic-footer) are rejected everywhere, including owner files.
 *
 * Usage: node scripts/check-composer-css.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

import { COMPOSER_SURFACE, matchesSurface } from './composer-surface.mjs';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');
const UNIFIED_OWNER = join(STYLES, 'parity', 'composer-unified.css');
const MOBILE_OWNER = join(STYLES, 'parity', 'composer-mobile.css');
const OWNERS = new Set([UNIFIED_OWNER, MOBILE_OWNER]);
const REMOVED = /\.chat-composer-body|\.chat-input-footer|\.topic-footer/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.css') ? [p] : [];
  });
}

function isPhoneOnly(rule) {
  for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type !== 'atrule' || parent.name !== 'media') continue;
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(parent.params);
    if (max && Number(max[1]) <= 768) return true;
  }
  return false;
}

const problems = [];
for (const file of walk(STYLES)) {
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  root.walkRules((rule) => {
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule' && /keyframes/i.test(p.name)) return;
    }
    for (const sel of rule.selectors) {
      const where = `${relative(FRONTEND, file)}:${rule.source?.start?.line ?? '?'}`;
      if (REMOVED.test(sel)) {
        problems.push(`${where}  removed wrapper class: ${sel}`);
        continue;
      }
      if (!matchesSurface(COMPOSER_SURFACE, sel)) continue;
      if (!OWNERS.has(file)) {
        problems.push(`${where}  composer rule outside canonical composer owners: ${sel}`);
        continue;
      }
      if (file === MOBILE_OWNER && !isPhoneOnly(rule)) {
        problems.push(`${where}  composer-mobile.css rule must be scoped to <=768px: ${sel}`);
      }
    }
  });
}

if (problems.length) {
  console.error(`composer CSS check failed (${problems.length}):`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nStyle the shared composer only in src/styles/parity/composer-unified.css or the <=768px src/styles/parity/composer-mobile.css owner.');
  process.exit(1);
}
console.log('composer CSS check passed (shared owner + phone-only geometry owner)');
