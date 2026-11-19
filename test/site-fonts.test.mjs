/*
 * The site paints Chinese prose with one self-hosted Noto Sans SC subset
 * (site/fonts.css, built by scripts/build-site-cjk-subset.py) instead of
 * Google's 101 unicode-range slices. A subset only carries the code points it
 * was built from, so copy edits can outrun it: a new ideograph that is not in
 * the file renders in the platform font, and if it is not in the declared
 * unicode-range either, it can render as tofu. This test is the ratchet —
 * regenerate with the builder when it fails.
 *
 * It also pins the two things that made the old arrangement expensive:
 * no numbered slice files (4.29 MB of fonts), and no page reaching a remote
 * font host for copy the site already self-hosts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const FONTS = join(SITE, 'media', 'fonts');

/* The blocks a Latin-only face cannot paint: Noto Sans SC has to own these. */
const CJK_BLOCKS = [
  [0x2e80, 0x2fdf],
  [0x3000, 0x303f],
  [0x3400, 0x9fff],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
];
const isCjk = (code) => CJK_BLOCKS.some(([from, to]) => code >= from && code <= to);

function coveredCodePoints(range) {
  const points = new Set();
  for (const part of range.split(',')) {
    const token = part.trim().replace(/^[uU]\+/, '');
    if (!token) continue;
    const [from, to = from] = token.split('-');
    for (let cp = parseInt(from, 16); cp <= parseInt(to, 16); cp++) points.add(cp);
  }
  return points;
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
    }),
  );
  return paths.flat();
}

const css = await readFile(join(SITE, 'fonts.css'), 'utf8');
const notoFaces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
  .map(([, body]) => body)
  .filter((body) => /font-family:\s*['"]Noto Sans SC['"]/.test(body));

test('the site ships two script-split Noto Sans SC faces, each with a range', () => {
  assert.equal(
    notoFaces.length,
    2,
    'one ideograph face and one latin/greek face replace the 101 Google slices',
  );
  for (const face of notoFaces) {
    assert.match(face, /unicode-range:/, 'a range-less face would claim every code point');
    assert.match(
      face,
      /noto-sans-sc-(?:cjk|latin)-var\.woff2/,
      'both faces point at built subsets',
    );
  }
});

test('the two faces claim disjoint code points', () => {
  const [cjk, latin] = notoFaces.map((face) =>
    coveredCodePoints(face.match(/unicode-range:\s*([^;]+);/)[1]),
  );
  const overlap = [...cjk].filter((cp) => latin.has(cp));
  assert.deepEqual(
    overlap.slice(0, 5).map((cp) => `U+${cp.toString(16).toUpperCase()}`),
    [],
    'overlapping ranges would make the later face win silently',
  );
});

test('every CJK code point a page can paint is inside the subset range', async () => {
  const covered = new Set();
  for (const face of notoFaces) {
    for (const cp of coveredCodePoints(face.match(/unicode-range:\s*([^;]+);/)[1])) covered.add(cp);
  }
  const missing = new Map();

  for (const file of await htmlFiles(SITE)) {
    const source = await readFile(file, 'utf8');
    if (!source.includes('fonts.css')) continue;
    for (const char of source) {
      const code = char.codePointAt(0);
      if (!isCjk(code) || covered.has(code)) continue;
      const key = `U+${code.toString(16).toUpperCase()}`;
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(relative(SITE, file).replaceAll('\\', '/'));
    }
  }

  assert.equal(
    missing.size,
    0,
    `pages paint ${missing.size} code point(s) the subset does not carry — ` +
      `run scripts/build-site-cjk-subset.py --source <NotoSansSC[wght].ttf>:\n` +
      [...missing].map(([code, files]) => `  ${code} in ${[...files].join(', ')}`).join('\n'),
  );
});

test('no page reaches a remote font host', async () => {
  const offenders = [];
  for (const file of await htmlFiles(SITE)) {
    const source = await readFile(file, 'utf8');
    if (/fonts\.(?:googleapis|gstatic)\.com/.test(source)) {
      offenders.push(relative(SITE, file).replaceAll('\\', '/'));
    }
  }
  assert.deepEqual(offenders, [], 'fonts.css is the only font source');
});

test('the retired numbered slices are gone and every font file is referenced', async () => {
  const files = (await readdir(FONTS)).filter((name) => name.endsWith('.woff2'));
  assert.deepEqual(
    files.filter((name) => /^noto-sans-sc-\d+-var\.woff2$/.test(name)),
    [],
    'the 101 Google slices are replaced by the generated subset',
  );

  const sheets = ['fonts.css', 'chrome.css', 'public.css', 'inner.css', 'account.css'];
  const text = (await Promise.all(sheets.map((name) => readFile(join(SITE, name), 'utf8')))).join(
    '\n',
  );
  const unreferenced = files.filter((name) => !text.includes(name));
  assert.deepEqual(unreferenced, [], 'every committed font file is used by a stylesheet');

  const bytes = (
    await Promise.all(files.map(async (name) => (await stat(join(FONTS, name))).size))
  ).reduce((sum, size) => sum + size, 0);
  assert.ok(
    bytes < 900 * 1024,
    `site font payload is ${(bytes / 1024).toFixed(0)} KB; the ceiling is 900 KB`,
  );
});
