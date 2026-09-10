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

/* One shared document silhouette (folded top-right corner) so `read`
   and `spec` are recognisably the same object with different marks on
   it, instead of two unrelated drawings. */
const DOC = '<path d="M11.6 3.4H7a2.1 2.1 0 0 0-2.1 2.1v9a2.1 2.1 0 0 0 2.1 2.1h6a2.1 2.1 0 0 0 2.1-2.1V6.9Z"/><path d="M11.6 3.4v3.5h3.5"/>';

export const STROKE_ICONS: Record<string, string> = {
  /* Terminal: rounded frame, prompt caret, cursor rule. */
  command: icon('<rect x="2.9" y="3.7" width="14.2" height="12.6" rx="3.2"/><path d="m6.7 8.4 1.9 1.9-1.9 1.9"/><path d="M10.7 12.2h2.9"/>'),
  /* Pencil: one closed body, one collar line marking the ferrule. */
  fileChange: icon('<path d="M4.1 15.9l.8-3.2 8-8a1.85 1.85 0 0 1 2.6 2.6l-8 8z"/><path d="m11.7 5.5 2.6 2.6"/>'),
  /* Document with body copy. */
  read: icon(`${DOC}<path d="M7.9 10.9h4.2M7.9 13.3h2.8"/>`),
  /* Document with an approval mark. */
  spec: icon(`${DOC}<path d="m7.9 11.4 1.5 1.5 3-3.2"/>`),
  /* Magnifier. Handle leaves the circle exactly on the 45° diagonal. */
  search: icon('<circle cx="8.9" cy="8.9" r="5.4"/><path d="m12.7 12.7 3.8 3.8"/>'),
  /* Globe: equator plus one meridian, so "the web" reads at 14px. */
  fetch: icon('<circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13"/><path d="M10 3.5c1.75 1.85 2.7 4.05 2.7 6.5S11.75 14.65 10 16.5C8.25 14.65 7.3 12.45 7.3 10S8.25 5.35 10 3.5Z"/>'),
  /* `</>` — angle brackets plus the slash that makes it code, not a
     pair of chevrons. */
  code: icon('<path d="m7 6.2-3.5 3.8L7 13.8"/><path d="m13 6.2 3.5 3.8-3.5 3.8"/><path d="m11.2 4.9-2.4 10.2"/>'),
  /* Axis pair with three columns. */
  visual: icon('<path d="M3.6 3.4v11.7a1.3 1.3 0 0 0 1.3 1.3h11.5"/><path d="M7.7 13.4V9.5M11 13.4V6.3M14.3 13.4v-2.6"/>'),
  /* Checklist: two ticked rows. */
  plan: icon('<path d="m3.5 6 1.4 1.4L7.6 4.7"/><path d="m3.5 13.5 1.4 1.4 2.7-2.8"/><path d="M10.2 6.1h6.3M10.2 13.6h6.3"/>'),
  /* Twin spark — the agent/model mark. Large spark leads, small spark
     trails at the lower right. */
  agent: icon('<path d="M9.6 2.9c.55 3.15 1.95 4.55 5.1 5.1-3.15.55-4.55 1.95-5.1 5.1-.55-3.15-1.95-4.55-5.1-5.1 3.15-.55 4.55-1.95 5.1-5.1Z"/><path d="M14.5 12.4c.26 1.47.91 2.12 2.38 2.38-1.47.26-2.12.91-2.38 2.38-.26-1.47-.91-2.12-2.38-2.38 1.47-.26 2.12-.91 2.38-2.38Z"/>'),
  /* Open book / shelf. */
  library: icon('<path d="M15.4 3.3H7.1a2.2 2.2 0 0 0-2.2 2.2v9.1a2.2 2.2 0 0 1 2.2-2.2h8.3z"/><path d="M4.9 14.6a2.2 2.2 0 0 0 2.2 2.2h8.3v-4.4"/>'),
  /* Git branch: trunk with one fork. */
  repo: icon('<circle cx="6.4" cy="5.2" r="1.8"/><circle cx="6.4" cy="14.8" r="1.8"/><circle cx="13.6" cy="5.2" r="1.8"/><path d="M6.4 7v6"/><path d="M13.6 7v.7a5.2 5.2 0 0 1-5.2 5.2"/>'),
  /* Two interlocking link arcs. */
  mcp: icon('<path d="M8.6 11.4 7.2 12.8a2.7 2.7 0 0 1-3.8-3.8l2.4-2.4a2.7 2.7 0 0 1 3.8 0"/><path d="m11.4 8.6 1.4-1.4a2.7 2.7 0 0 1 3.8 3.8l-2.4 2.4a2.7 2.7 0 0 1-3.8 0"/>'),
  /* Sliders — the generic "some tool ran" mark. */
  tool: icon('<path d="M3.5 7.1h3M9.9 7.1h6.6"/><circle cx="8.2" cy="7.1" r="1.7"/><path d="M3.5 12.9h6.6M13.4 12.9h3.1"/><circle cx="11.8" cy="12.9" r="1.7"/>'),

  /* ── status glyphs ──────────────────────────────────────────────
     Shared with the inline rows so a settled row's mark carries the
     same stroke weight as the tool glyph it replaces. */
  check: icon('<path d="m4.8 10.3 3.4 3.4 7.2-7.6"/>'),
  stop: icon('<rect x="6.2" y="6.2" width="7.6" height="7.6" rx="2.1"/>'),
  alert: icon('<path d="M10 5.2v5.3"/><circle cx="10" cy="14" r=".95" fill="currentColor" stroke="none"/>'),

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
  arrowUp: icon('<path d="M10 16.2V4.4"/><path d="m5.6 8.8 4.4-4.4 4.4 4.4"/>'),
  arrowDown: icon('<path d="M10 3.8v11.8"/><path d="m5.6 11.2 4.4 4.4 4.4-4.4"/>'),
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
    case 'initialize_workspace':
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
