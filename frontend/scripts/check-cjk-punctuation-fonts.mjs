#!/usr/bin/env node
/*
 * scripts/check-cjk-punctuation-fonts.mjs — CJK punctuation font gate.
 *
 * The product contract for Chinese punctuation:
 *
 *   1. a face without a unicode-range may be used for every code point, so
 *      the browser hands it whatever comes first in the font stack. Geist
 *      Sans is first, and it carries narrow, Latin-proportioned glyphs for
 *      U+3000-303F and U+FF00-FFEF — so ，。！？；：（） were painted with
 *      Latin metrics and read as English punctuation even though the text
 *      in the DOM was full width. That is invisible in a string assertion
 *      and obvious on screen;
 *   2. only a CJK family may own those blocks — Noto Sans SC and friends
 *      carry the full-width metrics;
 *   3. every local face must declare a range, so no future font can claim
 *      the whole Unicode space by accident.
 *
 * Usage: node scripts/check-cjk-punctuation-fonts.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const STYLES = join(FRONTEND, 'src', 'styles');

/* CJK Symbols and Punctuation, and Halfwidth and Fullwidth Forms. */
export const CJK_PUNCTUATION_BLOCKS = [
  [0x3000, 0x303f],
  [0xff00, 0xffef],
];

/* Families that are allowed to own those blocks. */
const CJK_FAMILY = /Noto Sans SC|Noto Serif SC|PingFang|Hiragino|Microsoft YaHei|Songti|SimSun/i;

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (path.endsWith('.css')) out.push(path);
  }
  return out;
}

export function parseFaces(css) {
  const faces = [];
  for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1];
    const family = (body.match(/font-family:\s*([^;]+);/) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1]?.trim();
    if (family) faces.push({ family, range: range || null });
  }
  return faces;
}

/** Expand a unicode-range declaration into the code points it covers. */
export function coveredCodePoints(range) {
  const points = new Set();
  if (!range) return points;
  for (const part of range.split(',')) {
    const token = part.trim().replace(/^[uU]\+/, '');
    if (token.includes('-')) {
      const [start, end] = token.split('-');
      const from = parseInt(start, 16);
      const to = parseInt(end, 16);
      if (Number.isNaN(from) || Number.isNaN(to)) continue;
      for (let cp = from; cp <= to; cp++) points.add(cp);
    } else {
      const cp = parseInt(token, 16);
      if (!Number.isNaN(cp)) points.add(cp);
    }
  }
  return points;
}

export function checkFaces(faces) {
  const violations = [];
  for (const face of faces) {
    const where = `${face.family} (${face.range ? 'has unicode-range' : 'NO unicode-range'})`;
    if (!face.range) {
      violations.push(`${where}: a face without a unicode-range may claim every code point, including the CJK punctuation blocks`);
      continue;
    }
    const covered = coveredCodePoints(face.range);
    const claimsCjk = CJK_PUNCTUATION_BLOCKS.some(([from, to]) => {
      for (let cp = from; cp <= to; cp++) if (covered.has(cp)) return true;
      return false;
    });
    if (claimsCjk && !CJK_FAMILY.test(face.family)) {
      violations.push(`${where}: a non-CJK family may not own U+3000-303F / U+FF00-FFEF — those code points need full-width metrics`);
    }
  }
  return violations;
}

const violations = [];
let faceCount = 0;
for (const file of cssFiles(STYLES)) {
  const css = readFileSync(file, 'utf8');
  const faces = parseFaces(css);
  faceCount += faces.length;
  for (const violation of checkFaces(faces)) {
    violations.push(`${relative(FRONTEND, file)}: ${violation}`);
  }
}

if (!faceCount) {
  console.error('check-cjk-punctuation-fonts: parsed 0 @font-face blocks — refusing to gate on an empty parse');
  process.exit(1);
}

if (violations.length) {
  console.error(`check-cjk-punctuation-fonts: ${violations.length} violation(s)`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log(`check-cjk-punctuation-fonts: ${faceCount} @font-face blocks ok (no face claims the CJK punctuation blocks without a CJK family)`);
