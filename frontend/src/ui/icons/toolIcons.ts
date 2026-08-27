/**
 * Tool / step icon set in the Claude-style line language: one light
 * 1.4px stroke on a 20px grid, rounded caps and joins everywhere,
 * generous negative space, and as few subpaths as an idea allows.
 * Frames get large corner radii; documents share one soft silhouette;
 * the workspace agent carries Claude's spark. The set stays monochrome
 * (currentColor) so light/dark themes and the quiet grey of inline
 * rows keep owning the color decisions.
 */

const OPEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function icon(body: string): string {
  return `${OPEN}${body}</svg>`;
}

export const STROKE_ICONS: Record<string, string> = {
  command: icon('<rect x="3" y="3.75" width="14" height="12.5" rx="3"/><path d="m6.4 8.2 2.1 2.1-2.1 2.1"/><path d="M11 12.4h2.8"/>'),
  fileChange: icon('<path d="M4.5 15.5l1.1-3.9 8-8a2 2 0 0 1 2.8 2.8l-8 8z"/><path d="m5.6 11.6 2.8 2.8"/>'),
  read: icon('<path d="M11.9 3.5H6.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7.1z"/><path d="M11.9 3.5v3.6h3.6"/><path d="M7.3 11h5.4M7.3 13.5h3.4"/>'),
  search: icon('<circle cx="9.2" cy="9.2" r="5.5"/><path d="m13.2 13.2 3.3 3.3"/>'),
  mcp: icon('<path d="M8.5 11.5 7 13a2.65 2.65 0 0 1-3.75-3.75l2.4-2.4a2.65 2.65 0 0 1 3.75 0"/><path d="m11.5 8.5 1.5-1.5a2.65 2.65 0 1 1 3.75 3.75l-2.4 2.4a2.65 2.65 0 0 1-3.75 0"/><path d="m8 12 4-4"/>'),
  plan: icon('<path d="m3.9 5.9 1.25 1.25L7.3 4.8"/><path d="m3.9 13.4 1.25 1.25 2.15-2.35"/><path d="M10.1 6.1h6M10.1 13.6h6"/>'),
  visual: icon('<path d="M3.5 3.5v11.6a1.4 1.4 0 0 0 1.4 1.4h11.6"/><path d="M7.6 12.9v-2.7M11 12.9V6.9M14.4 12.9v-4"/>'),
  code: icon('<path d="m7.4 6.4-3.6 3.6 3.6 3.6"/><path d="m12.6 6.4 3.6 3.6-3.6 3.6"/>'),
  fetch: icon('<circle cx="10" cy="10" r="6.6"/><path d="M3.4 10h13.2"/><ellipse cx="10" cy="10" rx="3" ry="6.6"/>'),
  spec: icon('<path d="M11.9 3.5H6.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7.1z"/><path d="M11.9 3.5v3.6h3.6"/><path d="m7.4 11.6 1.6 1.6 3.4-3.5"/>'),
  agent: icon('<path d="M10 2.9v14.2M2.9 10h14.2"/><path d="m6.1 6.1 7.8 7.8M13.9 6.1l-7.8 7.8"/>'),
  library: icon('<path d="M6.3 3h9.2v12.6H6.3A2.1 2.1 0 0 0 4.2 17.7V5.1A2.1 2.1 0 0 1 6.3 3Z"/><path d="M4.2 15.6a2.1 2.1 0 0 1 2.1-2.1h9.2"/>'),
  repo: icon('<circle cx="5.6" cy="14.6" r="1.9"/><circle cx="14.4" cy="5.4" r="1.9"/><path d="M5.6 12.7V3.6"/><path d="M14.4 7.3c0 4.3-3.9 5.4-8.8 5.4"/>'),
  tool: icon('<path d="M3.5 6.3h2.6M9.9 6.3h6.6"/><circle cx="8" cy="6.3" r="1.9"/><path d="M3.5 13.7h6.6M13.9 13.7h2.6"/><circle cx="12" cy="13.7" r="1.9"/>'),
  chevronDown: icon('<path d="m6.4 8.3 3.6 3.4 3.6-3.4"/>'),
  chevronRight: icon('<path d="m8.3 6.4 3.4 3.6-3.4 3.6"/>'),
};

export function agentStepIcon(kind: string): string {
  if (kind === 'file_change') return STROKE_ICONS.fileChange;
  if (kind === 'read') return STROKE_ICONS.read;
  if (kind === 'search') return STROKE_ICONS.search;
  if (kind === 'mcp') return STROKE_ICONS.mcp;
  if (kind === 'plan') return STROKE_ICONS.plan;
  return STROKE_ICONS.command;
}

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
