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

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'read_attachment']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'Bash']);
const CONNECTOR_TOOLS = new Set([
  'oc_github', 'oc_gmail', 'oc_googlecalendar', 'oc_todoist', 'oc_gitlab', 'oc_qq_mail',
  'github_identity', 'gmail_search', 'google_calendar_list_events', 'todoist_list_tasks',
  'gitlab_identity', 'qq_mail_search',
]);

const TOOL_CATEGORIES = new Map<string, string>([
  ...Array.from(SEARCH_TOOLS, (name) => [name, 'search'] as const),
  ['code_interpreter', 'code'], ['Code', 'code'],
  ['web_fetch', 'fetch'], ['WebFetch', 'fetch'],
  ['render_visualization', 'visual'], ['create_plan', 'plan'], ['create_spec', 'spec'],
  ['workspace_agent', 'agent'], ['initialize_workspace', 'agent'],
  ...Array.from(READ_TOOLS, (name) => [name, 'read'] as const),
  ...Array.from(WRITE_TOOLS, (name) => [name, 'write'] as const),
  ['save_memory', 'memory'], ['create_site', 'site'],
  ...Array.from(CONNECTOR_TOOLS, (name) => [name, 'connector'] as const),
]);

export function toolCategory(name: string): string {
  return TOOL_CATEGORIES.get(name) || (name.startsWith('oc_') ? 'connector' : 'other');
}
