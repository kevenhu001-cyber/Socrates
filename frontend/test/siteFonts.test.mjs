import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chineseFontStyles } from '../scripts/sync-site-fonts.mjs';

test('app Chinese fonts use the marketing site glyph subsets, weights and unicode coverage', () => {
  const source = readFileSync(new URL('../../site/fonts.css', import.meta.url), 'utf8');
  const app = readFileSync(
    new URL('../src/styles/foundations/fonts-cjk.css', import.meta.url),
    'utf8',
  );
  assert.equal(app, chineseFontStyles(source));
  const faces = [...app.matchAll(/@font-face\s*\{[^}]+\}/g)].map(([face]) => face);
  /* The site ships two Noto Sans SC variable faces whose unicode-ranges are
     generated from each subset's own cmap: CJK ideographs + full-width
     punctuation, and the latin/greek/symbol fallthrough. The split keeps an
     English page from downloading the whole CJK face without letting Geist
     Sans claim U+3000-303F / U+FF00-FFEF (its ，。！？；：（） are half-width). */
  assert.ok(faces.length >= 2, 'keep the CJK / latin script split');
  /* One variable face per script subset: the weight axis runs the whole
     100–900 range so the dark canvas can step down to a half step (450)
     instead of declaring a weight the browser snaps back to 500. */
  assert.ok(
    faces.every((face) => /font-weight:\s*100 900;/.test(face)),
    'every Chinese face declares the full variable weight range',
  );
  const rangeValues = faces.map((face) => face.match(/unicode-range:\s*([^;]+);/)[1]);
  assert.equal(new Set(rangeValues).size, faces.length, 'one face per unicode range');
  const parsedRanges = rangeValues.flatMap((value) =>
    value
      .split(',')
      .map((part) => part.trim().match(/^U\+([0-9a-f]+)(?:-([0-9a-f]+))?$/i))
      .filter(Boolean)
      .map((m) => [parseInt(m[1], 16), m[2] ? parseInt(m[2], 16) : parseInt(m[1], 16)]),
  );
  const covers = (cp) => parsedRanges.some(([start, end]) => cp >= start && cp <= end);
  for (const cp of [0x3001, 0x3002, 0xff08, 0xff09, 0xff0c, 0xff1a, 0xff1b, 0xff1f]) {
    assert.ok(
      covers(cp),
      `full-width punctuation U+${cp.toString(16)} must resolve to Noto Sans SC, not Geist Sans`,
    );
  }
  for (const face of faces) {
    assert.match(face, /unicode-range:/);
    assert.match(face, /font-display:\s*swap/);
    const path = face.match(/url\('([^']+)'\)/)[1];
    assert.ok(
      existsSync(
        new URL(path, new URL('../src/styles/foundations/fonts-cjk.css', import.meta.url)),
      ),
      path,
    );
    assert.doesNotMatch(face, /https?:/);
  }
});

test('font sync refuses a missing family or a third-party asset', () => {
  assert.throws(() => chineseFontStyles(''), /missing/);
  assert.throws(
    () =>
      chineseFontStyles(
        "@font-face { font-family: 'Noto Sans SC'; src: url(https://example.test/font.woff2); }",
      ),
    /local marketing font/,
  );
});
