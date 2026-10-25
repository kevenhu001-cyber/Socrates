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
 * Two trees are checked, because both paint Chinese prose with the same
 * font stack:
 *
 *   frontend/src/styles — strict. Every face must declare a range.
 *   site/               — every face must declare a range, unless it points
 *                         at an explicitly subsetted file (the file name
 *                         carries a subset marker such as `latin`). Such a
 *                         file cannot contain the code points it never
 *                         shipped, so an unbounded face over it is harmless.
 *                         The site's Inter / Source Serif 4 / Newsreader
 *                         faces are exactly that case.
 *
 * Usage: node scripts/check-cjk-punctuation-fonts.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = fileURLToPath(new URL('../..', import.meta.url));

/* CJK Symbols and Punctuation, and Halfwidth and Fullwidth Forms. */
export const CJK_PUNCTUATION_BLOCKS = [
  [0x3000, 0x303f],
  [0xff00, 0xffef],
];

/* Families that are allowed to own those blocks. */
const CJK_FAMILY = /Noto Sans SC|Noto Serif SC|PingFang|Hiragino|Microsoft YaHei|Songti|SimSun/i;

/* A file whose name carries one of these markers is an explicit subset. */
const SUBSET_FILE = /[-_](latin|latin-ext|cyrillic|cyrillic-ext|vietnamese|greek|arabic|hebrew|thai|symbols2?|ext)([-_.]|$)/i;

/* The trees that paint Chinese prose, and how strict each one is. */
const TREES = [
  { dir: join(FRONTEND, 'src', 'styles'), allowSubsetFile: false, label: 'frontend/src/styles' },
  { dir: join(REPO, 'site'), allowSubsetFile: true, label: 'site' },
];

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
    const src = (body.match(/src:\s*([^;]+);/) || [])[1]?.trim() || '';
    if (family) faces.push({ family, range: range || null, src });
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

export function checkFaces(faces, { allowSubsetFile = false } = {}) {
  const violations = [];
  for (const face of faces) {
    const where = `${face.family} (${face.range ? 'has unicode-range' : 'NO unicode-range'})`;
    if (!face.range) {
      if (allowSubsetFile && SUBSET_FILE.test(face.src)) continue;
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
for (const tree of TREES) {
  let treeFaces = 0;
  for (const file of cssFiles(tree.dir)) {
    const faces = parseFaces(readFileSync(file, 'utf8'));
    treeFaces += faces.length;
    for (const violation of checkFaces(faces, { allowSubsetFile: tree.allowSubsetFile })) {
      violations.push(`${relative(REPO, file)}: ${violation}`);
    }
  }
  if (!treeFaces) {
    console.error(`check-cjk-punctuation-fonts: parsed 0 @font-face blocks under ${tree.label} — refusing to gate on an empty parse`);
    process.exit(1);
  }
  faceCount += treeFaces;
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
