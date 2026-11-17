import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAst } from 'rolldown/parseAst';
import { createRetryDynamicImportsPlugin } from '../scripts/retry-dynamic-imports.mjs';

function transform(code) {
  return createRetryDynamicImportsPlugin().renderChunk.call({ parse: parseAst }, code);
}

test('build transform preserves namespace adapters and ignores strings and static imports', () => {
  const source = `import './static.js'; const text = 'import("./example.js")'; export const load = () => import('./editor.js').then(m => (m.init(), m.exports));`;
  const result = transform(source);
  assert.match(
    result.code,
    /__socratesImport\('\.\/editor.js'\)\.then\(m => \(m.init\(\), m.exports\)\)/,
  );
  assert.ok(result.code.includes(`const text = 'import("./example.js")'`));
  assert.ok(result.code.includes(`import './static.js'`));
  assert.equal(transform('export const value = 1;'), null);
});

test('failed imports get fresh same-origin URLs while successful imports retain their identity', async () => {
  const result = transform(`const load = () => import('./editor.js');`);
  const urls = [];
  const module = { editor: true };
  const load = new Function(
    '__testImport',
    result.code
      .replaceAll('import.meta.url', JSON.stringify('https://example.test/assets/boot.js'))
      .replace('import(url.href)', '__testImport(url.href)') + '\nreturn load;',
  )(async (url) => {
    urls.push(url);
    if (urls.length === 1) throw new TypeError('Failed to fetch dynamically imported module');
    return module;
  });
  await assert.rejects(load());
  assert.equal(await load(), module);
  assert.equal(await load(), module);
  assert.deepEqual(urls, [
    'https://example.test/assets/editor.js',
    'https://example.test/assets/editor.js?__load_retry=1',
    'https://example.test/assets/editor.js?__load_retry=1',
  ]);
});
