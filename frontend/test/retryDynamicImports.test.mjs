import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAst } from 'rolldown/parseAst';
import { createRetryDynamicImportsPlugin } from '../scripts/retry-dynamic-imports.mjs';

function transform(code, importer, chunks) {
  return createRetryDynamicImportsPlugin().renderChunk.call(
    { parse: parseAst },
    code,
    importer,
    {},
    { chunks },
  );
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

test('editor dependency HTTP errors retry outside the module map and bypass cached errors', async () => {
  const importer = { fileName: 'assets/boot.js', imports: ['assets/shared.js'] };
  const result = transform("const load = () => import('./editor.js');", importer, {
    'assets/boot.js': importer,
    'assets/editor.js': {
      moduleIds: ['/app/src/react/composer-input/index.ts'],
      imports: ['assets/shared.js', 'assets/vendor.js'],
    },
    'assets/shared.js': { imports: [] },
    'assets/vendor.js': { imports: [] },
  });
  const requests = [];
  const imports = [];
  const load = new Function(
    'fetch',
    '__testImport',
    result.code
      .replaceAll('import.meta.url', JSON.stringify('https://example.test/assets/boot.js'))
      .replace('import(url.href)', '__testImport(url.href)') + '\nreturn load;',
  )(
    async (url, { cache }) => {
      requests.push([url.pathname, cache]);
      const status = url.pathname.endsWith('/vendor.js') && cache === 'force-cache' ? 503 : 200;
      return new Response('export {}', {
        status,
        headers: { 'content-type': 'application/javascript' },
      });
    },
    async (url) => imports.push(url),
  );
  await assert.rejects(load(), /vendor\.js \(503\)/);
  assert.deepEqual(imports, []);
  await load();
  assert.deepEqual(imports, ['https://example.test/assets/editor.js']);
  assert.deepEqual(
    requests.filter(([path]) => path.endsWith('/vendor.js')),
    [
      ['/assets/vendor.js', 'force-cache'],
      ['/assets/vendor.js', 'reload'],
    ],
  );
  assert.ok(!requests.some(([path]) => path.endsWith('/shared.js')));
});
