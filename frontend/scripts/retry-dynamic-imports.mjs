import { posix } from 'node:path';
import { staticPaths } from './entry-graph.mjs';

/* A lazy chunk that owns CSS must keep Vite's __vitePreload wrapper: that
   wrapper is what appends the chunk's stylesheet <link>. Replacing its inner
   import() with the retry helper drops the deps argument, so the module runs
   unstyled (OpenUiBlock and the tldraw editor are the two current cases).
   Leave those imports native; the retry path is only for CSS-free chunks.
   The composer-editor preflight is the one exception: its chunk owns no lazy
   CSS today, and its retry path must stay. */
function carriesCss(path, importer, chunks) {
  if (!chunks) return false;
  const directory = posix.dirname(importer.fileName);
  const target = posix.normalize(posix.join(directory, path));
  return Boolean(
    chunks[target]?.moduleIds?.some((id) => /\.css(?:\?|$)/.test(id.replaceAll('\\', '/'))),
  );
}

function editorPreflight(path, importer, chunks) {
  if (!chunks) return [];
  const directory = posix.dirname(importer.fileName);
  const target = posix.normalize(posix.join(directory, path));
  const targetChunk = chunks[target];
  if (
    !targetChunk?.moduleIds.some((id) =>
      id.replaceAll('\\', '/').endsWith('/src/react/composer-input/index.ts'),
    )
  )
    return [];

  // The importing module's static graph is already available. Preflight the
  // remaining graph, including the editor itself, before the browser can cache
  // a rejected import of any of these URLs in its module map.
  const deps = (file) => (chunks[file]?.imports || []).filter((dep) => chunks[dep]);
  const available = staticPaths([importer.fileName], deps);
  return [...staticPaths([target], deps).keys()]
    .filter((file) => !available.has(file))
    .map((file) => posix.relative(directory, file));
}

/* Preserve Vite/Rolldown's namespace adapters and preload graph, but give a
   failed native import a fresh URL on its next attempt. Chromium retains a
   rejected module-map entry even after connectivity returns. */
export function createRetryDynamicImportsPlugin() {
  return {
    name: 'retry-dynamic-imports',
    apply: 'build',
    enforce: 'post',
    renderChunk(code, chunk, _options, meta) {
      const edits = [];
      const chunks = meta?.chunks;
      let needsPreflight = false;
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (
          node.type === 'ImportExpression' &&
          !node.options &&
          node.source?.type === 'Literal' &&
          typeof node.source.value === 'string' &&
          /^\.\.?\//.test(node.source.value)
        ) {
          const assets = editorPreflight(node.source.value, chunk, chunks);
          if (!assets.length && carriesCss(node.source.value, chunk, chunks)) return;
          if (assets.length) {
            needsPreflight = true;
            edits.push([node.end - 1, node.end - 1, ', ' + JSON.stringify(assets)]);
          }
          edits.push([node.start, node.start + 6, '__socratesImport']);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object' && typeof value.type === 'string')
            visit(value);
        }
      };
      visit(this.parse(code));
      if (!edits.length) return null;
      for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
        code = code.slice(0, start) + replacement + code.slice(end);
      }
      return {
        code:
          code +
          `
const __socratesFailedImports = new Map();
function __socratesImport(path${needsPreflight ? ', assets' : ''}) {
  const attempt = __socratesFailedImports.get(path) || 0;
  const url = new URL(path, import.meta.url);
  if (attempt) url.searchParams.set('__load_retry', String(attempt));
  const load = () => import(url.href).catch(error => {
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String(error))) {
      __socratesFailedImports.set(path, attempt + 1);
    }
    throw error;
  });
  return ${needsPreflight ? 'assets ? __socratesPreflight(assets).then(load) : load()' : 'load()'};
}
` +
          (needsPreflight
            ? `
const __socratesRejectedAssets = new Set();
async function __socratesPreflight(assets) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    await Promise.all(assets.map(async path => {
      const url = new URL(path, import.meta.url);
      const response = await fetch(url, {
        signal: controller.signal,
        cache: __socratesRejectedAssets.has(path) ? 'reload' : 'force-cache',
      });
      if (!response.ok || !/(?:java|ecma)script/i.test(response.headers.get('content-type') || '')) {
        __socratesRejectedAssets.add(path);
        throw new Error(url.pathname + ' (' + response.status + ')');
      }
      await response.arrayBuffer();
      __socratesRejectedAssets.delete(path);
    }));
  } catch (error) {
    throw new TypeError('Failed to fetch dynamically imported module: ' + String(error));
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
`
            : ''),
        map: null,
      };
    },
  };
}
