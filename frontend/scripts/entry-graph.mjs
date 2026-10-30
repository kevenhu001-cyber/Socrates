import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Follow only static edges. Retain the shortest path for explaining why a
// module is eager; cycles and dependencies shared by several roots count once.
export function staticPaths(roots, importsOf) {
  const paths = new Map(roots.map((id) => [id, [id]]));
  for (const [id, path] of paths) {
    for (const next of importsOf(id)) {
      if (!paths.has(next)) paths.set(next, [...path, next]);
    }
  }
  return paths;
}

export function createEntryGraphPlugin() {
  let root;
  return {
    name: 'socrates-entry-graph',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { root = config.root; },
    // Vite's build-import-analysis rewrites preload maps in generateBundle.
    // Measure after normal hooks, once those final bytes are present.
    generateBundle: { order: 'post', handler(_, bundle) {
      const displayId = (id) => relative(root, id).replaceAll('\\', '/');
      const sourcePaths = staticPaths([resolve(root, 'src/main.ts')],
        (id) => this.getModuleInfo(id)?.importedIds || []);
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
      const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const eager = staticPaths(chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName),
        (id) => byFile.get(id)?.imports || []);
      const modules = new Map();
      for (const chunk of chunks) {
        for (const [id, info] of Object.entries(chunk.modules)) {
          // Rollup's resolved graph also contains tree-shaken barrel exports.
          // Keep only modules that actually contributed rendered code.
          if (!info.renderedLength) continue;
          const meta = this.getModuleInfo(id);
          modules.set(displayId(id), {
            id: displayId(id),
            chunk: chunk.fileName,
            renderedBytes: info.renderedLength,
            imports: (meta?.importedIds || []).map(displayId),
            dynamicImports: (meta?.dynamicallyImportedIds || []).map(displayId),
            staticPath: sourcePaths.get(id)?.map(displayId) || null,
          });
        }
      }
      const htmlAsset = bundle['index.html'];
      if (!htmlAsset || htmlAsset.type !== 'asset') this.error('index.html missing from entry audit');
      const html = String(htmlAsset.source);
      const cssPaths = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.css)"/g)]
        .map((match) => match[1]))];
      const gzipBytes = (value) => gzipSync(value).length;
      const css = cssPaths.map((file) => {
        const asset = bundle[file];
        if (!asset || asset.type !== 'asset') this.error(`Entry CSS missing: ${file}`);
        return { file, gzipBytes: gzipBytes(asset.source) };
      });
      const chunkRows = chunks.map((chunk) => ({
        file: chunk.fileName,
        entry: chunk.isEntry,
        eager: eager.has(chunk.fileName),
        imports: chunk.imports,
        dynamicImports: chunk.dynamicImports,
        gzipBytes: gzipBytes(chunk.code),
      }));
      const report = {
        version: 1,
        // Independent gzip streams (default zlib settings), matching the
        // existing performance-loading spec; excludes fonts and runtime fetches.
        metrics: {
          htmlGzipBytes: gzipBytes(html),
          staticJsGzipBytes: chunkRows.filter((chunk) => chunk.eager).reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
          linkedCssGzipBytes: css.reduce((sum, asset) => sum + asset.gzipBytes, 0),
        },
        css,
        chunks: chunkRows,
        modules: [...modules.values()].sort((a, b) => a.id.localeCompare(b.id)),
        // Full resolved graph, including zero-byte modules, allows callers to
        // follow every main.js import through barrels to its retained leaves.
        graph: [...this.getModuleIds()].map((id) => {
          const info = this.getModuleInfo(id);
          return {
            id: displayId(id),
            imports: info.importedIds.map(displayId),
            dynamicImports: info.dynamicallyImportedIds.map(displayId),
          };
        }),
      };
      this.emitFile({ type: 'asset', fileName: '.vite/entry-graph.json', source: JSON.stringify(report, null, 2) });
    } },
  };
}

function printReport() {
  const report = JSON.parse(readFileSync(new URL('../dist/.vite/entry-graph.json', import.meta.url), 'utf8'));
  console.log('Build graph only; excludes fonts, API calls and runtime imports/prefetches.');
  console.log(JSON.stringify(report.metrics, null, 2));
  const requested = process.argv.find((arg) => arg.startsWith('--module='))?.slice('--module='.length);
  if (requested) {
    const module = report.modules.find((item) => item.id === requested);
    if (!module) throw new Error(`No retained module: ${requested}`);
    console.log(JSON.stringify(module, null, 2));
    return;
  }
  const eager = new Set(report.chunks.filter((chunk) => chunk.eager).map((chunk) => chunk.file));
  const retained = report.modules.filter((module) => eager.has(module.chunk));
  console.log(`Retained modules in static chunk closure: ${retained.length}`);
  const graph = new Map(report.graph.map((module) => [module.id, module]));
  for (const id of graph.get('src/main.ts').imports) {
    const branch = staticPaths([id], (next) => graph.get(next)?.imports || []);
    const leaves = retained.filter((module) => branch.has(module.id));
    console.log(`${id}: ${leaves.length} retained modules, ${leaves.reduce((sum, module) => sum + module.renderedBytes, 0)} rendered bytes (shared; not additive)`);
  }
  console.log('\nLargest eager first-party modules (rendered bytes BEFORE minification):');
  for (const module of retained.filter((item) => !item.id.includes('node_modules/'))
    .sort((a, b) => b.renderedBytes - a.renderedBytes).slice(0, 25)) {
    console.log(`${module.renderedBytes}\t${module.id}\n  ${module.staticPath?.join(' -> ') || 'eager chunk co-location; no static path from main.js'}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) printReport();
