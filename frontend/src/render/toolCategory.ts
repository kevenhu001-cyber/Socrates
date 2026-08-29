/**
 * render/toolCategory.ts — the tool-name → display-category mapping.
 *
 * Extracted from ui/toolInline.ts so the classification is available to the
 * declarative renderer (react/tool-run), the imperative rows, and the runtime
 * merge logic without importing a DOM-manipulating module. This file must
 * stay free of DOM access: it is imported by Node unit tests directly.
 *
 * The classification is deliberately pure TS rather than WASM-backed: the
 * Rust library's `categorize_tool_js` is kept as the parity reference for the
 * branch below (asserted in test/wasmParity.test.mjs), and unlike
 * truncateDetailLines this runs on every merge comparison in the runtime, so
 * it stays a table lookup.
 */

/* Tools whose result is a list of web sources — they get the source-card
   detail panel and the Retry affordance. */
export const SEARCH_TOOLS: ReadonlySet<string> = new Set([
  'web_search', 'arxiv_search', 'zotero_search', 'notion_search_pages',
  'github_list_repos', 'gitee_list_repos',
]);

export function isInlineSearchTool(name: string): boolean {
  return SEARCH_TOOLS.has(name);
}

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'Bash']);

export function toolCategory(name: string): string {
  if (SEARCH_TOOLS.has(name)) return 'search';
  if (name === 'code_interpreter' || name === 'Code') return 'code';
  if (name === 'web_fetch' || name === 'WebFetch') return 'fetch';
  if (name === 'render_visualization') return 'visual';
  if (name === 'create_plan') return 'plan';
  if (name === 'create_spec') return 'spec';
  if (name === 'workspace_agent') return 'agent';
  if (READ_TOOLS.has(name)) return 'read';
  if (WRITE_TOOLS.has(name)) return 'write';
  return 'other';
}
