/** Tool/activity SVGs from lucide-react v1.52.0.
 * Official icon paths shared by React and legacy renderers.
 *
 * ISC License
 *
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * ---
 *
 * The following Lucide icons are derived from the Feather project:
 *
 * airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out
 *
 * The MIT License (MIT) (for the icons listed above)
 *
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

const OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function icon(body: string): string {
  return OPEN + body + '</svg>';
}

export const STROKE_ICONS: Record<string, string> = {
  command: icon("<path d=\"M12 19h8\"/><path d=\"m4 17 6-6-6-6\"/>"),
  fileChange: icon("<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>"),
  read: icon("<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>"),
  spec: icon("<path d=\"M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"m14 20 2 2 4-4\"/>"),
  search: icon("<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>"),
  fetch: icon("<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>"),
  code: icon("<path d=\"m18 16 4-4-4-4\"/><path d=\"m6 8-4 4 4 4\"/><path d=\"m14.5 4-5 16\"/>"),
  visual: icon("<path d=\"M5 21v-6\"/><path d=\"M12 21V3\"/><path d=\"M19 21V9\"/>"),
  plan: icon("<path d=\"M13 5h8\"/><path d=\"M13 12h8\"/><path d=\"M13 19h8\"/><path d=\"m3 17 2 2 4-4\"/><path d=\"m3 7 2 2 4-4\"/>"),
  agent: icon("<path d=\"M12 8V4H8\"/><rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\"/><path d=\"M2 14h2\"/><path d=\"M20 14h2\"/><path d=\"M15 13v2\"/><path d=\"M9 13v2\"/>"),
  library: icon("<path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20\"/>"),
  repo: icon("<path d=\"M15 6a9 9 0 0 0-9 9V3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/>"),
  mcp: icon("<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>"),
  memory: icon("<path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\"/>"),
  site: icon("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M9 21V9\"/>"),
  tool: icon("<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\"/>"),
  runGroup: icon("<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>"),
  image: icon("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>"),
  check: icon("<path d=\"M20 6 9 17l-5-5\"/>"),
  stop: icon("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>"),
  alert: icon("<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>"),
  /* The process marker. Deliberately a dotted outline rather than a filled
     or spark glyph: the pill sits above the answer, so it has to read as
     "there was work here" without competing with the prose below it. */
  process: icon("<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v4\"/><path d=\"M12 16h.01\"/>"),
  chevronDown: icon("<path d=\"m6 9 6 6 6-6\"/>"),
  chevronUp: icon("<path d=\"m18 15-6-6-6 6\"/>"),
  chevronRight: icon("<path d=\"m9 18 6-6-6-6\"/>"),
  chevronLeft: icon("<path d=\"m15 18-6-6 6-6\"/>"),
  arrowUp: icon("<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>"),
  arrowDown: icon("<path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/>"),
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
