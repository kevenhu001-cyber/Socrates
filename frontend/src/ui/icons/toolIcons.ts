/**
 * Tool / step icon set.
 *
 * One line language, applied without exception:
 *   • 20×20 viewBox, so every glyph shares one optical size.
 *   • a single 1.5px stroke, round caps and round joins.
 *   • drawn inside a 13.6px-wide safe area (x/y 3.2 → 16.8) so glyphs
 *     of different silhouettes still look the same weight next to each
 *     other in a row.
 *   • as few subpaths as the idea allows; no fills except the two
 *     deliberate dots, which set `stroke="none"` so they do not inherit
 *     the outline weight.
 *   • monochrome `currentColor` only — light/dark themes and the quiet
 *     grey of inline tool rows keep owning every color decision.
 *
 * The chevrons are the load-bearing detail: they are the expand /
 * collapse affordance on every tool row, source card and agent step, so
 * they are laid out on exact 45° arms that are centred on the 20×20 box
 * (span 6.4 → 13.6 on both axes, midpoint 10,10). That makes all four
 * rotations optically identical and keeps a CSS `rotate()` from
 * drifting the glyph off-centre — the previous arms were 43° and sat
 * ~0.15px low, which is what made the arrows look hand-drawn.
 */

const OPEN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function icon(body: string): string {
  return `${OPEN}${body}</svg>`;
}

/* Apple SF Symbols-inspired document silhouette:
   Continuous rounded squircle corners (rx=2.6) with a softly filleted folded top-right flap. */
const DOC = '<path d="M6.8 3.2h4.6l4.4 4.4v6.6a2.6 2.6 0 0 1-2.6 2.6H6.8A2.6 2.6 0 0 1 4.2 14.2V5.8A2.6 2.6 0 0 1 6.8 3.2Z"/><path d="M11.4 3.4v3a1.2 1.2 0 0 0 1.2 1.2h3"/>';

export const STROKE_ICONS: Record<string, string> = {
  /* Terminal: Apple terminal squircle screen, rounded prompt chevron, pill cursor. */
  command: icon('<rect x="2.6" y="3.6" width="14.8" height="12.8" rx="3.8"/><path d="m6.4 8.2 2.2 1.8-2.2 1.8"/><path d="M10.8 12.2h2.8"/>'),
  /* Pencil: Apple SF Symbols pencil with rounded eraser cap, soft collar and tapered tip. */
  fileChange: icon('<path d="M13.8 3.6a1.9 1.9 0 0 1 2.6 2.6L7.6 15l-3.8 1.2 1.2-3.8z"/><path d="m11.8 5.6 2.6 2.6"/>'),
  /* Document with body copy: smooth rounded document with two soft pill lines. */
  read: icon(`${DOC}<path d="M7.4 11.2h5.2M7.4 13.8h3.4"/>`),
  /* Document with an approval mark: smooth rounded document with curved Apple checkmark. */
  spec: icon(`${DOC}<path d="m7.2 12.2 1.8 1.8 4.2-4.4"/>`),
  /* Magnifier: concentric circular lens, smooth 45° handle with rounded pill end. */
  search: icon('<circle cx="8.8" cy="8.8" r="5.2"/><path d="m12.6 12.6 3.9 3.9"/>'),
  /* Globe: Apple SF Symbols globe with spherical equator and smooth meridian ellipse. */
  fetch: icon('<circle cx="10" cy="10" r="6.6"/><path d="M3.4 10h13.2"/><path d="M10 3.4c2.4 2 3.8 4.1 3.8 6.6s-1.4 4.6-3.8 6.6c-2.4-2-3.8-4.1-3.8-6.6s1.4-4.6 3.8-6.6Z"/>'),
  /* Code: Apple < / > with rounded chevrons and elegant forward slash. */
  code: icon('<path d="m6.8 6.5-3.3 3.5 3.3 3.5"/><path d="m13.2 6.5 3.3 3.5-3.3 3.5"/><path d="m11.4 4.8-2.8 10.4"/>'),
  /* Visual: Apple Health/Stocks-inspired bar chart with full pill/capsule columns on baseline. */
  visual: icon('<path d="M3.2 16.6h13.6"/><rect x="4.6" y="9.8" width="2.8" height="6.8" rx="1.4"/><rect x="8.6" y="5.2" width="2.8" height="11.4" rx="1.4"/><rect x="12.6" y="7.8" width="2.8" height="8.8" rx="1.4"/>'),
  /* Plan: Apple checklist with soft rounded checkmarks and pill task lines. */
  plan: icon('<path d="m3.6 6.8 1.8 1.8 3.2-3.4"/><path d="m3.6 13.6 1.8 1.8 3.2-3.4"/><path d="M11.2 6.8h5.4M11.2 13.6h5.4"/>'),
  /* Agent: Apple Intelligence signature 4-point sparkles with continuous cubic bezier curvature. */
  agent: icon('<path d="M8.6 3.4C8.6 6.6 11.1 9.2 14.4 9.2 11.1 9.2 8.6 11.8 8.6 15 8.6 11.8 6.1 9.2 2.8 9.2 6.1 9.2 8.6 6.6 8.6 3.4Z"/><path d="M15.2 12c0 1.4 1.1 2.6 2.4 2.6-1.3 0-2.4 1.2-2.4 2.6 0-1.4-1.1-2.6-2.4-2.6 1.3 0 2.4-1.2 2.4-2.6Z"/>'),
  /* Library: Apple book.closed with rounded cover and spine crease. */
  library: icon('<path d="M5.8 3.5h8.4a2.4 2.4 0 0 1 2.4 2.4v10.3H6.8A2.6 2.6 0 0 1 4.2 13.6V5.1a1.6 1.6 0 0 1 1.6-1.6Z"/><path d="M7.2 3.5v12.7"/>'),
  /* Repo: Apple git branch with circular nodes and smooth bezier branch curve. */
  repo: icon('<circle cx="6.2" cy="5.2" r="1.8"/><circle cx="6.2" cy="14.8" r="1.8"/><circle cx="13.8" cy="6.2" r="1.8"/><path d="M6.2 7v6"/><path d="M13.8 8c-3 0-5.2 1.6-7.6 4.2"/>'),
  /* MCP: Apple link with interlocking rounded capsule links and 45° orientation. */
  mcp: icon('<path d="m8.8 11.2-1.6 1.6a2.8 2.8 0 0 1-4-4l1.6-1.6a2.8 2.8 0 0 1 4 0"/><path d="m11.2 8.8 1.6-1.6a2.8 2.8 0 0 1 4 4l-1.6 1.6a2.8 2.8 0 0 1-4 0"/><path d="m7.8 12.2 4.4-4.4"/>'),
  /* Memory: Apple bookmark with rounded squircle top and filleted ribbon tail. */
  memory: icon('<path d="M5.8 3.4h8.4a2.4 2.4 0 0 1 2.4 2.4v10.6a.8.8 0 0 1-1.3.6L10 13.6l-5.3 3.4a.8.8 0 0 1-1.3-.6V5.8A2.4 2.4 0 0 1 5.8 3.4Z"/>'),
  /* Site: Apple macwindow with rounded frame, titlebar divider and 3 macOS traffic light dots. */
  site: icon('<rect x="2.6" y="3.8" width="14.8" height="12.4" rx="3.6"/><path d="M2.6 7.6h14.8"/><circle cx="5.2" cy="5.7" r=".75" fill="currentColor" stroke="none"/><circle cx="7.4" cy="5.7" r=".75" fill="currentColor" stroke="none"/><circle cx="9.6" cy="5.7" r=".75" fill="currentColor" stroke="none"/>'),
  /* Tool: Apple slider.horizontal.2 with rounded rails and circular thumb knobs. */
  tool: icon('<path d="M3.4 7h2.8m3.6 0h6.8"/><circle cx="8" cy="7" r="1.8"/><path d="M3.4 13h6.8m3.6 0h2.8"/><circle cx="12" cy="13" r="1.8"/>'),
  /* RunGroup: Apple-style step sequence with rounded track nodes and task pills. */
  runGroup: icon('<circle cx="5.6" cy="6.2" r="1.8"/><circle cx="5.6" cy="13.8" r="1.8"/><path d="M5.6 8v4"/><path d="M9.6 6.2h7M9.6 13.8h4.8"/>'),
  /* Photo / Image: Apple photo with rounded squircle frame, sun and mountain crests. */
  image: icon('<rect x="2.8" y="3.8" width="14.4" height="12.4" rx="3.4"/><circle cx="7" cy="7.8" r="1.3"/><path d="m3.4 14.6 4.8-4.8a1.2 1.2 0 0 1 1.7 0l6.7 6.4"/><path d="m12.6 12.4 1.5-1.5a1.2 1.2 0 0 1 1.7 0l.8.8"/>'),

  /* ── status glyphs ──────────────────────────────────────────────
     Shared with the inline rows so a settled row's mark carries the
     same stroke weight as the tool glyph it replaces. */
  check: icon('<path d="m4.8 10.4 3.4 3.4 7-7.2"/>'),
  stop: icon('<rect x="5.8" y="5.8" width="8.4" height="8.4" rx="2.8"/>'),
  alert: icon('<circle cx="10" cy="10" r="6.8"/><path d="M10 6.4v4"/><circle cx="10" cy="13.2" r=".85" fill="currentColor" stroke="none"/>'),

  /* ── chevrons ───────────────────────────────────────────────────
     Exact 45° arms, span 6.4 → 13.6 on both axes, midpoint (10,10).
     All four are the same drawing rotated, so a CSS `rotate()` on the
     down glyph produces pixel-identical results to using the
     dedicated one. */
  chevronDown: icon('<path d="m6.4 8.2 3.6 3.6 3.6-3.6"/>'),
  chevronUp: icon('<path d="m6.4 11.8 3.6-3.6 3.6 3.6"/>'),
  chevronRight: icon('<path d="m8.2 6.4 3.6 3.6-3.6 3.6"/>'),
  chevronLeft: icon('<path d="m11.8 6.4-3.6 3.6 3.6 3.6"/>'),

  /* ── arrows ─────────────────────────────────────────────────────
     Shaft on the centre axis, head arms on the same 45° as the
     chevrons so an arrow and a chevron never look like two different
     line weights when they sit in the same row. */
  arrowUp: icon('<path d="M10 16.2V4.2M5.8 8.4 10 4.2l4.2 4.2"/>'),
  arrowDown: icon('<path d="M10 3.8v12M5.8 11.6 10 15.8l4.2-4.2"/>'),
};

export function agentStepIcon(kind: string): string {
  if (kind === 'file_change') return STROKE_ICONS.fileChange;
  if (kind === 'read') return STROKE_ICONS.read;
  if (kind === 'search') return STROKE_ICONS.search;
  if (kind === 'mcp') return STROKE_ICONS.mcp;
  if (kind === 'plan') return STROKE_ICONS.plan;
  return STROKE_ICONS.command;
}

const CONNECTOR_NAMES = new Set([
  'oc_github', 'oc_gmail', 'oc_googlecalendar', 'oc_todoist', 'oc_gitlab', 'oc_qq_mail',
  'github_identity', 'gmail_search', 'google_calendar_list_events', 'todoist_list_tasks',
  'gitlab_identity', 'qq_mail_search',
]);

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
    case 'initialize_workspace':
      return STROKE_ICONS.agent;
    case 'github_list_repos':
    case 'gitee_list_repos':
      return STROKE_ICONS.repo;
    case 'Read':
    case 'Glob':
    case 'Grep':
    case 'read_attachment':
      return STROKE_ICONS.read;
    case 'Write':
    case 'Edit':
      return STROKE_ICONS.fileChange;
    case 'Bash':
      return STROKE_ICONS.command;
    case 'save_memory':
      return STROKE_ICONS.memory;
    case 'create_site':
      return STROKE_ICONS.site;
    case 'image':
    case 'read_image':
      return STROKE_ICONS.image;
    default:
      if (CONNECTOR_NAMES.has(name) || /^oc_/.test(name)) return STROKE_ICONS.mcp;
      return STROKE_ICONS.tool;
  }
}

/**
 * The glyph for a *run* of tool calls, keyed off the group's category.
 *
 * The aggregate header used to carry an 18×18 rounded-square outline, which at
 * that size is an unchecked checkbox: it invited a click that does nothing and
 * said nothing about what the run did. A run is already named by its label
 * ("找到 3 个来源 · 共 3 次搜索"), so the mark's job is to let the eye classify the
 * row before reading it — the same job `toolIcon` does for a single call. A
 * uniform run therefore reuses its member glyph, and only a genuinely mixed run
 * falls back to the neutral step-chain.
 */
export function categoryIcon(category: string): string {
  switch (category) {
    case 'search': return STROKE_ICONS.search;
    case 'fetch': return STROKE_ICONS.fetch;
    case 'code': return STROKE_ICONS.code;
    case 'visual': return STROKE_ICONS.visual;
    case 'plan': return STROKE_ICONS.plan;
    case 'spec': return STROKE_ICONS.spec;
    case 'agent': return STROKE_ICONS.agent;
    case 'read': return STROKE_ICONS.read;
    case 'write': return STROKE_ICONS.fileChange;
    case 'memory': return STROKE_ICONS.memory;
    case 'site': return STROKE_ICONS.site;
    case 'connector': return STROKE_ICONS.mcp;
    case 'image': return STROKE_ICONS.image;
    default: return STROKE_ICONS.runGroup;
  }
}
