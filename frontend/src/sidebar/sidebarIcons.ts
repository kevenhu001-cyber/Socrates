/* sidebar/sidebarIcons.ts — single source of truth for sidebar glyphs.
 *
 * Design language (aligned with chatgpt.com reference): crisp geometric
 * shapes on a 24×24 grid, 2px stroke, round caps/joins, moderate corner
 * radii (rx 1.5–4.5 — structured, not capsule-like), ink spanning the
 * 3–21 box so 20px glyphs keep full presence. See
 * docs/ref/chatgpt-parity.md. Solid round fills only where a detail must
 * read at small sizes (clock hub, assistant eyes, image sun, sites tile,
 * overflow dots). No hex colors, no !important — currentColor throughout.
 *
 * The static fallback markup in index.html mirrors these strings by hand
 * (it cannot import TS). When an icon changes here, update the matching
 * inline SVG in index.html as well.
 */

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const OPEN = `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true">`;
const FILLED_OPEN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">';

/* ── Primary nav ─────────────────────────────────────────────── */

/* New chat — ChatGPT-style square-pen: rounded square + diagonal pencil. */
export const NEW_CHAT_ICON =
  `${OPEN}<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M14.8 7.2a1.9 1.9 0 0 1 2.7 2.7l-6.4 6.4-3.6.9.9-3.6Z"/></svg>`;

/* Library — crisp book with spine + text lines. */
export const LIBRARY_ICON =
  `${OPEN}<path d="M6 3.5h11.5a1.8 1.8 0 0 1 1.8 1.8v13.4a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V5.3A1.8 1.8 0 0 1 6 3.5Z"/><path d="M9 3.5v17"/><path d="M12 8h4.2M12 11.5h4.2M12 15h2.5"/></svg>`;

/* Projects — structured folder, tight corners. */
export const PROJECTS_ICON =
  `${OPEN}<path d="M3.5 7A2 2 0 0 1 5.5 5h4a2 2 0 0 1 1.6.8l.9 1.2a2 2 0 0 0 1.6.8h4.9a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/></svg>`;

/* Scheduled — clock with a solid round hub. */
export const SCHEDULED_ICON =
  `${OPEN}<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>`;

/* Plugins — square puzzle piece, tight corners, one round knob. */
export const PLUGINS_ICON =
  `${OPEN}<path d="M7.5 10h1.7V8.6a2.4 2.4 0 0 0 4.8 0V10h2.5a1.2 1.2 0 0 1 1.2 1.2V17a1.2 1.2 0 0 1-1.2 1.2h-9A1.2 1.2 0 0 1 6 17v-5.8a1.2 1.2 0 0 1 1.2-1.2Z"/></svg>`;

/* Images — frame with moderate corners, solid sun, rolling hills. */
export const IMAGES_ICON =
  `${OPEN}<rect x="3" y="3" width="18" height="18" rx="3.5"/><circle cx="8.8" cy="8.8" r="2" fill="currentColor" stroke="none"/><path d="M4 17.6c1.5-2.1 3-3.6 4.5-3.6 1.2 0 2.1 1 3.1 2 .9-1 1.9-1.8 3-1.8 1.3 0 2.6 1.4 4.2 3.4"/></svg>`;

/* Assistants — face with moderate corners, dot eyes, smile. */
export const ASSISTANTS_ICON =
  `${OPEN}<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none"/><path d="M8.7 14.2c.9.9 2 1.4 3.3 1.4s2.4-.5 3.3-1.4"/></svg>`;

/* Sites — four crisp tiles; bottom-right is a solid accent. */
export const SITES_ICON =
  `${OPEN}<rect x="3" y="3" width="7.6" height="7.6" rx="2"/><rect x="13.4" y="3" width="7.6" height="7.6" rx="2"/><rect x="3" y="13.4" width="7.6" height="7.6" rx="2"/><rect x="13.4" y="13.4" width="7.6" height="7.6" rx="2" fill="currentColor" stroke="none"/></svg>`;

/* Exam — badge with moderate corners + check. */
export const EXAM_ICON =
  `${OPEN}<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8.2 12.4 2.7 2.7 5.1-5.6"/></svg>`;

/* Skills — three crisp tiles + plus. */
export const SKILLS_ICON =
  `${OPEN}<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.5v7M13.5 17h7"/></svg>`;

/* More / overflow — three solid dots. */
export const MORE_ICON =
  `${FILLED_OPEN}<circle cx="5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="12" r="2.1"/></svg>`;

/* ── Sidebar chrome ──────────────────────────────────────────── */

/* Search — ring magnifier with a straight tail. */
export const SEARCH_ICON =
  `${OPEN}<circle cx="11" cy="11" r="7"/><path d="m15.8 15.8 4.5 4.5"/></svg>`;

/* Panel toggle (desktop) — panel with a straight divider. */
export const PANEL_ICON =
  `${OPEN}<rect x="2.5" y="4" width="15" height="13" rx="3"/><path d="M7.5 4v13"/></svg>`;

/* Close — full-span X. */
export const CLOSE_ICON =
  `${OPEN}<path d="M6 6l12 12M18 6 6 18"/></svg>`;

/* Knowledge — constellation nodes with straight connectors. */
export const KNOWLEDGE_ICON =
  `${OPEN}<circle cx="5.5" cy="6" r="2.2"/><circle cx="18.2" cy="7.4" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7.5 6.4l8.6.6M6.6 8l4.2 8M17.1 9.2l-4 6.8"/></svg>`;

/* Mistakes — bookmark with a crisp shell and joined notch. */
export const MISTAKES_ICON =
  `${OPEN}<path d="M6.5 3.5h11a1.8 1.8 0 0 1 1.8 1.8v14a.8.8 0 0 1-1.3.6L12 15.9l-6.2 4.8a.8.8 0 0 1-1.3-.6v-14a1.8 1.8 0 0 1 1.8-1.8Z"/></svg>`;

/* Chevron — straight right chevron. */
export const CHEVRON_RIGHT_ICON =
  `${OPEN}<path d="m9.5 6 6 6-6 6"/></svg>`;

/* ── Recents row menu ────────────────────────────────────────── */

/* Share — tray with tight corners + straight arrow. */
export const SHARE_ICON =
  `${OPEN}<path d="M4.5 12.5V18a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5.5"/><path d="M15.5 6.5 12 3 8.5 6.5"/><path d="M12 3.5V15"/></svg>`;

/* Rename — structured pencil. */
export const RENAME_ICON =
  `${OPEN}<path d="M14.2 5.2a2.2 2.2 0 0 1 3.1 3.1l-7.9 7.9-4.2 1.1 1.1-4.2Z"/><path d="m12.8 6.6 3.1 3.1"/></svg>`;

/* Archive — box with a crisp lid. */
export const ARCHIVE_ICON =
  `${OPEN}<rect x="3" y="4" width="18" height="5" rx="1.8"/><path d="M5 9v9.5a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5V9"/><path d="M10 13.5h4"/></svg>`;

/* Delete — trash with tight body and straight bars. */
export const DELETE_ICON =
  `${OPEN}<path d="M3.5 6.5h17"/><path d="M18.8 6.5v12a2.7 2.7 0 0 1-2.7 2.7H7.9a2.7 2.7 0 0 1-2.7-2.7v-12"/><path d="M9.3 6.5V4.7a1.2 1.2 0 0 1 1.2-1.2h3a1.2 1.2 0 0 1 1.2 1.2v1.8"/><path d="M10 11v6M14 11v6"/></svg>`;

/* ── Footer placeholders (index.html pre-paint) ───────────────── */

/* Theme sun — disc + straight rays. */
export const SUN_ICON =
  `${OPEN}<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

/* Theme moon — crescent. */
export const MOON_ICON =
  `${OPEN}<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a7 7 0 0 0 10 10Z"/></svg>`;

/* Display sliders — straight tracks with knob rings. */
export const SLIDERS_ICON =
  `${OPEN}<path d="M20.5 6h-6M9.8 6H3.5M20.5 12H12.4M7.6 12H3.5M20.5 18h-4M12 18H3.5"/><circle cx="12.2" cy="6" r="2.4"/><circle cx="10" cy="12" r="2.4"/><circle cx="14.2" cy="18" r="2.4"/></svg>`;

/* API gear — full-size cog. */
export const GEAR_ICON =
  `${OPEN}<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

export const sidebarIcons = {
  newChat: NEW_CHAT_ICON,
  library: LIBRARY_ICON,
  projects: PROJECTS_ICON,
  scheduled: SCHEDULED_ICON,
  plugins: PLUGINS_ICON,
  images: IMAGES_ICON,
  assistants: ASSISTANTS_ICON,
  sites: SITES_ICON,
  exam: EXAM_ICON,
  skills: SKILLS_ICON,
  more: MORE_ICON,
  search: SEARCH_ICON,
  panel: PANEL_ICON,
  close: CLOSE_ICON,
  knowledge: KNOWLEDGE_ICON,
  mistakes: MISTAKES_ICON,
  chevronRight: CHEVRON_RIGHT_ICON,
  share: SHARE_ICON,
  rename: RENAME_ICON,
  archive: ARCHIVE_ICON,
  delete: DELETE_ICON,
  project: PROJECTS_ICON,
  overflow: MORE_ICON,
  sun: SUN_ICON,
  moon: MOON_ICON,
  sliders: SLIDERS_ICON,
  gear: GEAR_ICON,
} as const;

export type SidebarIconKey = keyof typeof sidebarIcons;
