import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { createEntryGraphPlugin, staticPaths } from '../scripts/entry-graph.mjs';

test('static graph traversal deduplicates shared dependencies and terminates cycles', () => {
  const graph = { main: ['left', 'right'], left: ['shared'], right: ['shared'], shared: ['main'] };
  const paths = staticPaths(['main'], (id) => graph[id] || []);
  assert.equal(paths.size, 4);
  assert.deepEqual(paths.get('shared'), ['main', 'left', 'shared']);
});

test('audit follows emitted chunk imports, including accidentally eager lazy code', () => {
  /* Native paths, not POSIX literals: the plugin resolves the entry through
     path.resolve(), so on Windows a '/fixture/…' id never matches the
     resolved root and every static path came back null. */
  const root = resolve('fixture');
  const mainId = join(root, 'src/main.ts');
  const helperId = join(root, 'helper.js');
  const lazyId = join(root, 'lazy.js');
  const unusedId = join(root, 'unused.js');
  const info = {
    [mainId]: { importedIds: [helperId], dynamicallyImportedIds: [lazyId] },
    [helperId]: { importedIds: [], dynamicallyImportedIds: [] },
    [lazyId]: { importedIds: [], dynamicallyImportedIds: [] },
    [unusedId]: { importedIds: [], dynamicallyImportedIds: [] },
  };
  const chunk = (fileName, imports, modules, isEntry = false) => ({
    type: 'chunk', fileName, imports, modules, isEntry, dynamicImports: [], code: `/* ${fileName} */`,
  });
  const html = '<script src="/assets/main.js"></script><link href="/assets/style.css"><link href="/assets/style.css">';
  const bundle = {
    'assets/main.js': chunk('assets/main.js', ['assets/vendor.js'], { [mainId]: { renderedLength: 20 } }, true),
    // A manual chunk can contain both an eager helper and a lazy renderer.
    'assets/vendor.js': chunk('assets/vendor.js', [], {
      [helperId]: { renderedLength: 10 },
      [lazyId]: { renderedLength: 30 },
      [unusedId]: { renderedLength: 0 },
    }),
    'index.html': { type: 'asset', source: html },
    'assets/style.css': { type: 'asset', source: 'body{}' },
  };
  const plugin = createEntryGraphPlugin();
  plugin.configResolved({ root });
  let report;
  assert.equal(plugin.generateBundle.order, 'post');
  plugin.generateBundle.handler.call({
    getModuleInfo: (id) => info[id],
    getModuleIds: () => Object.keys(info),
    emitFile: (asset) => { report = JSON.parse(asset.source); },
    error: (message) => { throw new Error(message); },
  }, {}, bundle);
  assert.equal(report.chunks.find((item) => item.file === 'assets/vendor.js').eager, true);
  assert.equal(report.modules.find((item) => item.id === 'lazy.js').staticPath, null);
  assert.deepEqual(report.modules.find((item) => item.id === 'helper.js').staticPath, ['src/main.ts', 'helper.js']);
  assert.equal(report.modules.some((item) => item.id === 'unused.js'), false);
  assert.equal(report.graph.length, 4);
  assert.equal(report.metrics.staticJsGzipBytes,
    gzipSync(bundle['assets/main.js'].code).length + gzipSync(bundle['assets/vendor.js'].code).length);
  assert.equal(report.metrics.linkedCssGzipBytes, gzipSync('body{}').length);
  assert.equal(report.metrics.htmlGzipBytes, gzipSync(html).length);
});
