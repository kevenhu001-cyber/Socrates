/**
 * Compact monochrome icons shared by live tool rows, detailed cards and
 * agent steps. The 20px canvas and rounded 1.55px strokes stay crisp when
 * rendered at 13–15px without competing with the assistant's answer.
 */

const OPEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function icon(body: string): string {
  return `${OPEN}${body}</svg>`;
}

export const STROKE_ICONS: Record<string, string> = {
  command: icon('<rect x="2.75" y="3.25" width="14.5" height="13.5" rx="3"/><path d="m6 8 2 2-2 2M10.5 12h3.5"/>'),
  fileChange: icon('<path d="M11 3.25H6a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10"/><path d="m10 12.8.5-2.6 4.8-4.8a1.7 1.7 0 0 1 2.4 2.4l-4.8 4.8z"/>'),
  read: icon('<path d="M11.5 3.25H6a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7z"/><path d="M11.5 3.25v4H16M7 11h6M7 13.75h4"/>'),
  search: icon('<circle cx="8.7" cy="8.7" r="5.2"/><path d="m12.7 12.7 3.8 3.8"/>'),
  mcp: icon('<path d="m8.2 12.1-1.1 1.1a3.1 3.1 0 1 1-4.3-4.4l2.3-2.3a3.1 3.1 0 0 1 4.4 0"/><path d="m11.8 7.9 1.1-1.1a3.1 3.1 0 1 1 4.3 4.4l-2.3 2.3a3.1 3.1 0 0 1-4.4 0M7.5 12.5l5-5"/>'),
  plan: icon('<path d="m3.5 5.5 1.4 1.4 2.4-2.5M3.5 13.1l1.4 1.4 2.4-2.5M9.7 5.8h6.8M9.7 13.4h6.8"/>'),
  visual: icon('<path d="M3.25 3.5v13.25H17"/><rect x="6" y="10.5" width="2.4" height="3.5" rx=".7"/><rect x="10" y="7" width="2.4" height="7" rx=".7"/><rect x="14" y="9" width="2.4" height="5" rx=".7"/>'),
  code: icon('<path d="m7.5 6-4 4 4 4M12.5 6l4 4-4 4"/>'),
  fetch: icon('<path d="m8.2 12.1-1.1 1.1a3.1 3.1 0 1 1-4.3-4.4l2.3-2.3a3.1 3.1 0 0 1 4.4 0"/><path d="m11.8 7.9 1.1-1.1a3.1 3.1 0 1 1 4.3 4.4l-2.3 2.3a3.1 3.1 0 0 1-4.4 0M7.5 12.5l5-5"/>'),
  spec: icon('<path d="M11.5 3.25H6a2 2 0 0 0-2 2v9.5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7z"/><path d="M11.5 3.25v4H16M7 11h6M7 13.75h3.5"/>'),
  agent: icon('<rect x="3" y="3" width="14" height="14" rx="3.5"/><circle cx="10" cy="10" r="2"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2"/>'),
  library: icon('<path d="M4.5 4.5A1.5 1.5 0 0 1 6 3h10v12.5H6A1.5 1.5 0 0 0 4.5 17z"/><path d="M4.5 17A1.5 1.5 0 0 1 6 15.5h10V18H6A1.5 1.5 0 0 1 4.5 16.5z"/>'),
  repo: icon('<path d="M5.5 3.5v9.2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="5.5" cy="14.7" r="2"/><path d="M14.5 7.5a7.2 7.2 0 0 1-7 7.2"/>'),
  tool: icon('<rect x="3.5" y="3.5" width="13" height="13" rx="3.5"/><path d="M7.5 10h5"/>'),
  chevronDown: icon('<path d="m6.75 8.25 3.25 3.5 3.25-3.5"/>'),
  chevronRight: icon('<path d="m8.25 6.75 3.5 3.25-3.5 3.25"/>'),
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
