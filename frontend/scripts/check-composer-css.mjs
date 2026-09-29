#!/usr/bin/env node
/*
 * scripts/check-composer-css.mjs — single-owner guard for the composer.
 *
 * The landing (#topicInputWrap) and conversation (#chatInputWrap) composers
 * are one component styled by exactly one stylesheet:
 * src/styles/parity/composer-unified.css. Any other stylesheet that styles
 * the shell, its controls or its editor (see scripts/composer-surface.mjs for
 * the matcher) fails this check — that is how the two surfaces drifted apart
 * before (≈900 competing selectors across 16 files).
 *
 * The removed wrapper classes (.chat-composer-body, .chat-input-footer,
 * .topic-footer) are rejected everywhere, including the owner file.
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
const OWNER = join(STYLES, 'parity', 'composer-unified.css');
const REMOVED = /\.chat-composer-body|\.chat-input-footer|\.topic-footer/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith('.css') ? [p] : [];
  });
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
      if (REMOVED.test(sel)) problems.push(`${where}  removed wrapper class: ${sel}`);
      else if (file !== OWNER && matchesSurface(COMPOSER_SURFACE, sel)) {
        problems.push(`${where}  composer rule outside composer-unified.css: ${sel}`);
      }
    }
  });
}

if (problems.length) {
  console.error(`composer CSS check failed (${problems.length}):`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nStyle the composer only in src/styles/parity/composer-unified.css (via .composer-shell).');
  process.exit(1);
}
console.log('composer CSS check passed (single owner: src/styles/parity/composer-unified.css)');
