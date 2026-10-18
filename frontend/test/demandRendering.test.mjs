import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { getKatex, hasMathDelimiters } = await import('../src/render/markdownMath.ts');
const { highlightCodeElement } = await import('../src/render/highlight.ts');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('plain prose and literal code do not request a math runtime', () => {
  for (const source of [
    'Plain prose.',
    'Use `$value` literally.',
    '```js\nconst price = "$5";\n```',
    '```python\nprint("$x',
    String.raw`Escaped currency: \$20.`,
  ]) {
    assert.equal(hasMathDelimiters(source), false, source);
    assert.equal(getKatex(source), undefined);
  }
  assert.equal(document.querySelectorAll('script').length, 0);
  for (const source of ['$x^2$', '$$x', String.raw`\(x\)`, String.raw`\[x`]) {
    assert.equal(hasMathDelimiters(source), true, source);
  }
});

test('delayed highlighter deduplicates, rejects stale hosts, and can retry a failed paint', async () => {
  const makeCode = (language, source) => {
    const code = document.createElement('code');
    code.className = `language-${language}`;
    code.textContent = source;
    document.body.appendChild(code);
    return code;
  };
  const changed = makeCode('python', 'old source');
  const detached = makeCode('python', 'removed source');
  const unknown = makeCode('unsupported-language', 'literal source');
  for (const code of [changed, changed, detached, unknown]) highlightCodeElement(code);
  assert.equal(document.querySelectorAll('script').length, 1);
  changed.textContent = 'new source';
  detached.remove();
  const paints = [];
  let fail = false;
  window.hljs = {
    getLanguage: (name) => ['python', 'plaintext'].includes(name),
    highlightElement: (code) => {
      if (fail) throw new Error('temporary paint failure');
      paints.push(code.textContent);
      code.dataset.highlighted = 'yes';
    },
  };
  document.querySelector('script').onload();
  await tick();
  assert.deepEqual(paints, ['literal source']);
  assert.equal(unknown.className, 'language-plaintext');
  assert.equal(changed.dataset.highlighted, undefined);
  highlightCodeElement(unknown);
  highlightCodeElement(changed);
  await tick();
  assert.deepEqual(paints, ['literal source', 'new source']);
  changed.textContent = 'a later revision';
  fail = true;
  highlightCodeElement(changed);
  await tick();
  fail = false;
  highlightCodeElement(changed);
  await tick();
  assert.deepEqual(paints, ['literal source', 'new source', 'a later revision']);
});
