import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFootnoteDefinitions, splitMathSegments, stripCitationMarkers } from './math.ts';
import { buildMathDocument } from './artifactDocument.ts';

test('display math splits out of prose', () => {
  const segments = splitMathSegments('Here is $$E = mc^2$$ done.');
  assert.deepEqual(segments, [
    { kind: 'prose', text: 'Here is ' },
    { kind: 'math', tex: 'E = mc^2', display: true },
    { kind: 'prose', text: ' done.' },
  ]);
});

test('display math may span lines; bread-and-paren forms work', () => {
  const segments = splitMathSegments('a \\[x +\ny\\] b \\(z\\) c');
  assert.deepEqual(segments, [
    { kind: 'prose', text: 'a ' },
    { kind: 'math', tex: 'x +\ny', display: true },
    { kind: 'prose', text: ' b ' },
    { kind: 'math', tex: 'z', display: false },
    { kind: 'prose', text: ' c' },
  ]);
});

test('inline dollars need TeX content and tight closers', () => {
  assert.deepEqual(splitMathSegments('solve $x$ now'), [
    { kind: 'prose', text: 'solve ' },
    { kind: 'math', tex: 'x', display: false },
    { kind: 'prose', text: ' now' },
  ]);
  // Prices stay literal.
  assert.deepEqual(splitMathSegments('it costs $5 today'), [{ kind: 'prose', text: 'it costs $5 today' }]);
  assert.deepEqual(splitMathSegments('from $5 and $10 up'), [{ kind: 'prose', text: 'from $5 and $10 up' }]);
  assert.deepEqual(splitMathSegments('about $5.99 total'), [{ kind: 'prose', text: 'about $5.99 total' }]);
  assert.deepEqual(splitMathSegments('dot dot $...$ done'), [{ kind: 'prose', text: 'dot dot $...$ done' }]);
});

test('code spans are never math', () => {
  const fenced = splitMathSegments('```js\nconst a = a[i] + $5;\n``` after $x$');
  assert.equal(fenced.length, 2);
  assert.equal(fenced[0].kind, 'prose');
  assert.ok((fenced[0] as { text: string }).text.includes('$5'));
  assert.ok((fenced[0] as { text: string }).text.endsWith(' after '));
  assert.deepEqual(fenced[1], { kind: 'math', tex: 'x', display: false });
  const inline = splitMathSegments('run `a[i] + $x$` then $y$');
  assert.deepEqual(inline, [
    { kind: 'prose', text: 'run `a[i] + $x$` then ' },
    { kind: 'math', tex: 'y', display: false },
  ]);
});

test('unclosed and empty math stays literal', () => {
  assert.deepEqual(splitMathSegments('price $$5 open'), [{ kind: 'prose', text: 'price $$5 open' }]);
  assert.deepEqual(splitMathSegments('empty $$$$ here'), [{ kind: 'prose', text: 'empty $$$$ here' }]);
  assert.deepEqual(splitMathSegments('just text'), [{ kind: 'prose', text: 'just text' }]);
  assert.deepEqual(splitMathSegments(''), []);
});

test('citation markers strip from prose but survive in code and links', () => {
  assert.equal(stripCitationMarkers('Paris is lovely [1] today.'), 'Paris is lovely today.');
  assert.equal(stripCitationMarkers('a [1, 2] and [3][4] end'), 'a and end');
  assert.equal(stripCitationMarkers('full 【5】 width'), 'full width');
  assert.equal(stripCitationMarkers('see [1](https://example.com) here'), 'see [1](https://example.com) here');
  assert.equal(stripCitationMarkers('[1]: https://example.com'), '[1]: https://example.com');
  assert.equal(stripCitationMarkers('`code [1]` kept'), '`code [1]` kept');
  // Parity with the web baseline (helpers.ts): the inner marker of `[[1]]`
  // strips, leaving the outer pair — verified against the real function.
  assert.equal(stripCitationMarkers('matrix [[1]] kept'), 'matrix [] kept');
  assert.equal(stripCitationMarkers('mixed [1】【2] kept'), 'mixed [1】【2] kept');
  // Idempotent.
  const once = stripCitationMarkers('a [1] b [2,3] c');
  assert.equal(stripCitationMarkers(once), once);
});

test('footnote definitions lift into notes and refs renumber', () => {
  const { body, notes } = extractFootnoteDefinitions('Claim[^a] here.\n\n[^a]: The source.\n');
  assert.equal(body, 'Claim[1] here.');
  assert.deepEqual(notes, [{ id: 'a', text: 'The source.' }]);
  const missing = extractFootnoteDefinitions('No def [^z] stays.');
  assert.equal(missing.body, 'No def [^z] stays.');
  assert.deepEqual(missing.notes, []);
});

test('the math island pins KaTeX by SRI and keeps a source fallback', () => {
  const palette = { page: '#fff', raised: '#f5f5f5', text: '#111', muted: '#666', border: '#ddd', accent: '#00f' };
  const doc = buildMathDocument({ artifactId: 'math-0', title: 'Formula', tex: 'E = mc^2', display: true, palette });
  assert.match(doc, /katex@0\.16\.11/);
  // SRI hashes ride in the loader (assigned to the injected elements at
  // runtime), so assert the pinned values, not static attributes.
  assert.match(doc, /sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm\/Yr2r3Dy4lfFg/);
  assert.match(doc, /sha384-nB0miv6\/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx\/\/Rlm\+ZU03BU6SQNC66uf4l5\+/);
  assert.match(doc, /trust: false/);
  assert.match(doc, /E = mc\^2/);
  // The narrow math CSP allows the pinned CDN and nothing else.
  assert.match(doc, /style-src 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(doc, /default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; media-src/);
});
