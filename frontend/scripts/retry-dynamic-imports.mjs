/* Preserve Vite/Rolldown's namespace adapters and preload graph, but give a
   failed native import a fresh URL on its next attempt. Chromium retains a
   rejected module-map entry even after connectivity returns. */
export function createRetryDynamicImportsPlugin() {
  return {
    name: 'retry-dynamic-imports',
    apply: 'build',
    enforce: 'post',
    renderChunk(code) {
      const edits = [];
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'ImportExpression' && node.source?.type === 'Literal'
          && typeof node.source.value === 'string' && /^\.\.?\//.test(node.source.value)) {
          edits.push([node.start, node.start + 6]);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value);
        }
      };
      visit(this.parse(code));
      if (!edits.length) return null;
      for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) {
        code = code.slice(0, start) + '__socratesImport' + code.slice(end);
      }
      return { code: code + `
const __socratesFailedImports = new Map();
function __socratesImport(path) {
  const attempt = __socratesFailedImports.get(path) || 0;
  const url = new URL(path, import.meta.url);
  if (attempt) url.searchParams.set('__load_retry', String(attempt));
  return import(url.href).catch(error => {
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String(error))) {
      __socratesFailedImports.set(path, attempt + 1);
    }
    throw error;
  });
}
`, map: null };
    },
  };
}
