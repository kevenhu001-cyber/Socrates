/**
 * ui/icons/toolIcons.ts — the single monochrome stroke icon set.
 *
 * Tool and agent-step rows previously mixed single-letter glyphs ("C", "{}")
 * with a handful of ad-hoc SVGs, so a message with several tool calls read as
 * visual noise. Every icon here shares the same grammar:
 *
 *   - 24x24 viewBox, no fill, `currentColor` stroke so the row's text colour
 *     drives the icon,
 *   - 1.5 stroke width with round caps and joins,
 *   - one idea per icon, drawn at a weight that stays legible at 15px.
 *
 * Consumers pass the icon HTML straight into a span; they never set colours,
 * which is what keeps the set monochrome across both themes.
 */

const OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function icon(body: string): string {
  return `${OPEN}${body}</svg>`;
}

/** Agent step and tool icons, keyed by semantic name. */
export const STROKE_ICONS: Record<string, string> = {
  /* A terminal frame with a prompt caret — "ran a command". */
  command: icon('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 10 2.5 2.5L7 15"/><path d="M12.5 15h4"/>'),
  /* Pencil over a page corner — "edited files". */
  fileChange: icon('<path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L14 13l-3 .8.8-3z"/>'),
  /* Open document with text lines — "read files". */
  read: icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>'),
  /* Magnifier — "searched the web". */
  search: icon('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  /* Two linked plugs — an MCP tool call. */
  mcp: icon('<path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.6"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5L4.5 12.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.6"/>'),
  /* Checklist — plan and todo updates. */
  plan: icon('<path d="m4 7 2 2 3.5-3.5"/><path d="m4 16 2 2 3.5-3.5"/><path d="M13 7.5h7M13 16.5h7"/>'),
  /* Chart bars — visualization. */
  visual: icon('<path d="M4 4v16h16"/><rect x="7.5" y="11" width="2.8" height="6" rx="0.8"/><rect x="12" y="7.5" width="2.8" height="9.5" rx="0.8"/><rect x="16.5" y="13.5" width="2.8" height="3.5" rx="0.8"/>'),
  /* Chevrons — code execution. */
  code: icon('<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>'),
  /* Link — page fetch. */
  fetch: icon('<path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.6"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5L4.5 12.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.6"/>'),
  /* Document with a spec seal. */
  spec: icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 12.5h6M9 16h3.5"/>'),
  /* Sparkle-free agent mark: a square workspace with an inner node. */
  agent: icon('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>'),
  /* Books — reference libraries and connectors. */
  library: icon('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3.5H6.5A1.5 1.5 0 0 1 5 19.5z"/>'),
  /* Repository graph — code hosting connectors. */
  repo: icon('<path d="M6.5 4v11"/><circle cx="17.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M17.5 9a8.5 8.5 0 0 1-8.5 8.5"/>'),
  /* Generic fallback: a dotted square, deliberately quiet. */
  tool: icon('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6"/>'),
};

/** Icon for an agent step kind (see services/agentStepProjection.ts). */
export function agentStepIcon(kind: string): string {
  if (kind === 'file_change') return STROKE_ICONS.fileChange;
  if (kind === 'read') return STROKE_ICONS.read;
  if (kind === 'search') return STROKE_ICONS.search;
  if (kind === 'mcp') return STROKE_ICONS.mcp;
  if (kind === 'plan') return STROKE_ICONS.plan;
  return STROKE_ICONS.command;
}

/** Icon for a native tool name, falling back to the quiet generic mark. */
export function toolIcon(name: string): string {
  switch (name) {
    case 'web_search':
    case 'arxiv_search':
    case 'zotero_search':
    case 'notion_search_pages':
      return STROKE_ICONS.search;
    case 'web_fetch':
    case 'WebFetch':
      return STROKE_ICONS.fetch;
    case 'code_interpreter':
    case 'Code':
      return STROKE_ICONS.code;
    case 'render_visualization':
      return STROKE_ICONS.visual;
    case 'create_plan':
      return STROKE_ICONS.plan;
    case 'create_spec':
      return STROKE_ICONS.spec;
    case 'workspace_agent':
      return STROKE_ICONS.agent;
    case 'github_list_repos':
    case 'gitee_list_repos':
      return STROKE_ICONS.repo;
    case 'Read':
    case 'Glob':
    case 'Grep':
      return STROKE_ICONS.read;
    case 'Write':
    case 'Edit':
      return STROKE_ICONS.fileChange;
    case 'Bash':
      return STROKE_ICONS.command;
    default:
      return STROKE_ICONS.tool;
  }
}
