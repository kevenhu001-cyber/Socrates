/** Tool/activity glyphs shared by React and legacy renderers.
 * Common actions use the interface collection. Remaining paths derive from
 * lucide-react v1.52.0 under the license below.
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

import { interfaceIcon } from './interfaceIcons';

const OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

function icon(body: string): string {
  return OPEN + body + '</svg>';
}

export const STROKE_ICONS: Record<string, string> = {
  command: icon("<path d=\"M12 19h8\"/><path d=\"m4 17 6-6-6-6\"/>"),
  fileChange: interfaceIcon('edit'),
  read: interfaceIcon('read'),
  spec: icon("<path d=\"M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"m14 20 2 2 4-4\"/>"),
  search: interfaceIcon('search'),
  fetch: interfaceIcon('globe'),
  code: interfaceIcon('code'),
  visual: interfaceIcon('analyze'),
  plan: icon("<path d=\"M13 5h8\"/><path d=\"M13 12h8\"/><path d=\"M13 19h8\"/><path d=\"m3 17 2 2 4-4\"/><path d=\"m3 7 2 2 4-4\"/>"),
  agent: interfaceIcon('agent'),
  library: interfaceIcon('library'),
  repo: interfaceIcon('branch'),
  mcp: icon("<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>"),
  memory: interfaceIcon('bookmark'),
  site: interfaceIcon('site'),
  tool: icon("<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\"/>"),
  runGroup: icon("<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>"),
  image: interfaceIcon('image'),
  check: interfaceIcon('check'),
  stop: icon("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>"),
  alert: icon("<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>"),
  /* The process marker. Deliberately a dotted outline rather than a filled
     or spark glyph: the pill sits above the answer, so it has to read as
     "there was work here" without competing with the prose below it. */
  process: icon("<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v4\"/><path d=\"M12 16h.01\"/>"),
  chevronDown: interfaceIcon('chevronDown'),
  chevronUp: interfaceIcon('chevronUp'),
  chevronRight: interfaceIcon('chevronRight'),
  chevronLeft: interfaceIcon('chevronLeft'),
  arrowUp: interfaceIcon('arrowUp'),
  arrowDown: interfaceIcon('arrowDown'),
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

const TOOL_ICONS = new Map<string, string>([
  ['web_search', STROKE_ICONS.search], ['arxiv_search', STROKE_ICONS.search],
  ['zotero_search', STROKE_ICONS.search], ['notion_search_pages', STROKE_ICONS.search],
  ['web_fetch', STROKE_ICONS.fetch], ['WebFetch', STROKE_ICONS.fetch],
  ['code_interpreter', STROKE_ICONS.code], ['Code', STROKE_ICONS.code],
  ['render_visualization', STROKE_ICONS.visual], ['create_plan', STROKE_ICONS.plan],
  ['create_spec', STROKE_ICONS.spec], ['workspace_agent', STROKE_ICONS.agent],
  ['initialize_workspace', STROKE_ICONS.agent], ['github_list_repos', STROKE_ICONS.repo],
  ['gitee_list_repos', STROKE_ICONS.repo], ['Read', STROKE_ICONS.read],
  ['Glob', STROKE_ICONS.read], ['Grep', STROKE_ICONS.read],
  ['read_attachment', STROKE_ICONS.read], ['Write', STROKE_ICONS.fileChange],
  ['Edit', STROKE_ICONS.fileChange], ['Bash', STROKE_ICONS.command],
  ['save_memory', STROKE_ICONS.memory], ['create_site', STROKE_ICONS.site],
  ['image', STROKE_ICONS.image], ['read_image', STROKE_ICONS.image],
]);

export function toolIcon(name: string): string {
  const icon = TOOL_ICONS.get(name);
  if (icon) return icon;
  return CONNECTOR_NAMES.has(name) || name.startsWith('oc_')
    ? STROKE_ICONS.mcp
    : STROKE_ICONS.tool;
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
