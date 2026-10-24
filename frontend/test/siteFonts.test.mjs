import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chineseFontStyles } from '../scripts/sync-site-fonts.mjs';

test('app Chinese fonts use the marketing site glyph subsets, weights and unicode coverage', () => {
  const source = readFileSync(new URL('../../site/fonts.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/styles/foundations/fonts-cjk.css', import.meta.url), 'utf8');
  assert.equal(app, chineseFontStyles(source));
  const faces = [...app.matchAll(/@font-face\s*\{[^}]+\}/g)].map(([face]) => face);
  assert.ok(faces.length > 100, 'keep unicode subsetting instead of downloading a full CJK face');
  assert.deepEqual([...new Set(faces.map((face) => face.match(/font-weight:\s*(\d+)/)[1]))], ['400', '500', '600', '700']);
  for (const face of faces) {
    assert.match(face, /unicode-range:/);
    assert.match(face, /font-display:\s*swap/);
    const path = face.match(/url\('([^']+)'\)/)[1];
    assert.ok(existsSync(new URL(path, new URL('../src/styles/foundations/fonts-cjk.css', import.meta.url))), path);
    assert.doesNotMatch(face, /https?:/);
  }
});

test('font sync refuses a missing family or a third-party asset', () => {
  assert.throws(() => chineseFontStyles(''), /missing/);
  assert.throws(() => chineseFontStyles("@font-face { font-family: 'Noto Sans SC'; src: url(https://example.test/font.woff2); }"), /local marketing font/);
});
