/**
 * ui/toolInline.ts — minimal ChatGPT-style inline tool status rows.
 *
 * A row is mounted in the message flow at the exact point the tool
 * fired (text → row → text). It starts in a running state (spinner +
 * action label) and settles in place to done / error. Web-search rows
 * expand (native <details>) to reveal the source list. The markup is
 * self-contained and serializable: message.html persistence keeps the
 * row interactive after reload without any JS re-wiring.
 */

import { esc } from '../render/helpers.js';
import { formatToolOutput } from '../render/toolOutput.js';

export interface InlineToolEntry {
  id: string;
  name: string;
  input?: unknown;
}

export interface InlineToolResult {
  ok?: boolean;
  status?: string;
  durationMs?: number;
  results?: unknown[];
  output?: string;
  stderr?: string;
  error?: string;
  userMessage?: string;
  detail?: unknown;
}

interface SourceItem {
  title: string;
  url: string;
  host: string;
}

function translate(key: string, fallback: string): string {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.t === 'function') {
      const s = (w.t as (k: string) => string)(key);
      if (s && s !== key) return s;
    }
  } catch (_) { /* ignore */ }
  return fallback;
}

const SEARCH_TOOLS = new Set([
  'web_search', 'arxiv_search', 'zotero_search', 'notion_search_pages',
  'github_list_repos', 'gitee_list_repos',
]);

export function isInlineSearchTool(name: string): boolean {
  return SEARCH_TOOLS.has(name);
}

function runningLabel(name: string): string {
  if (SEARCH_TOOLS.has(name)) return translate('tool.actionSearch', 'Searching the web…');
  if (name === 'code_interpreter' || name === 'Code') return translate('tool.actionAnalyze', 'Analyzing data');
  if (name === 'render_visualization') return translate('tool.actionVisual', 'Creating a visual');
  if (name === 'web_fetch') return translate('tool.actionFetch', 'Reading the page…');
  if (name === 'create_plan') return translate('tool.actionPlan', 'Drafting a plan…');
  if (name === 'create_spec') return translate('tool.actionSpec', 'Drafting a spec…');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.actionRead', 'Reading files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.actionWrite', 'Updating files');
  return translate('tool.actionDefault', 'Using a tool');
}

function doneLabel(name: string, result: InlineToolResult | null): string {
  if (SEARCH_TOOLS.has(name)) {
    const n = result && Array.isArray(result.results) ? result.results.length : 0;
    if (n > 0) return translate('tool.searchDone', 'Found {n} web results').replace('{n}', String(n));
    return translate('tool.searchEmpty', 'No web results found');
  }
  if (name === 'code_interpreter' || name === 'Code') return translate('tool.doneAnalyze', 'Analyzed data');
  if (name === 'render_visualization') return translate('tool.doneVisual', 'Created a visual');
  if (name === 'web_fetch') return translate('tool.doneFetch', 'Read the page');
  if (name === 'create_plan') return translate('tool.donePlan', 'Drafted a plan');
  if (name === 'create_spec') return translate('tool.doneSpec', 'Drafted a spec');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.doneRead', 'Read files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.doneWrite', 'Updated files');
  return translate('tool.doneDefault', 'Finished using tool');
}

function errorLabel(name: string, result: InlineToolResult | null): string {
  if (result && result.status === 'timeout') return translate('tool.statusTimeout', 'Timeout');
  if (SEARCH_TOOLS.has(name)) return translate('tool.searchFailed', 'Web search failed');
  return translate('tool.actionFailed', 'Tool call failed');
}

function normalizeSources(results: unknown[]): SourceItem[] {
  const out: SourceItem[] = [];
  for (let i = 0; i < results.length && out.length < 8; i++) {
    const r = results[i] as { title?: unknown; url?: unknown } | null;
    if (!r) continue;
    const url = String(r.url || '').trim();
    const title = String(r.title || url || '').trim();
    if (!title) continue;
    let host = '';
    try { if (/^https?:\/\//i.test(url)) host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { /* ignore */ }
    out.push({ title, url: /^https?:\/\//i.test(url) ? url : '', host });
  }
  return out;
}

function sourcesHtml(sources: SourceItem[]): string {
  if (!sources.length) return '';
  let html = '<div class="tool-inline-sources">';
  for (const s of sources) {
    const inner = '<span class="tool-inline-src-title">' + esc(s.title) + '</span>'
      + (s.host ? '<span class="tool-inline-src-host">' + esc(s.host) + '</span>' : '');
    html += s.url
      ? '<a class="tool-inline-src" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>'
      : '<span class="tool-inline-src">' + inner + '</span>';
  }
  return html + '</div>';
}

const INLINE_DETAIL_LIMIT = 12_000;

function detailText(value: unknown): string {
  if (value == null || value === '') return '';
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try { text = JSON.stringify(value, null, 2); } catch (_) { text = String(value); }
  }
  if (text.length <= INLINE_DETAIL_LIMIT) return text;
  return text.slice(0, INLINE_DETAIL_LIMIT)
    + '\n\n'
    + translate('common.truncated', '(truncated)');
}

function appendDetailSection(
  host: HTMLElement,
  title: string,
  value: unknown,
  kind: string,
): boolean {
  const text = detailText(value).trim();
  if (!text) return false;
  const section = document.createElement('section');
  section.className = 'tool-inline-detail-section';
  section.dataset.kind = kind;
  const heading = document.createElement('div');
  heading.className = 'tool-inline-detail-title';
  heading.textContent = title;
  const pre = document.createElement('pre');
  pre.className = 'tool-inline-detail-value';
  /* P_tool-output-rich — tool results used to be written as raw plain
     text. That's safe but makes code blocks / JSON / tracebacks hard to
     read. Route the OUTPUT kind through the sanitized rich-text
     formatter (escapes everything first); keep input/technical sections
     as plain text so argument objects stay faithful to what was sent. */
  if (kind === 'output') {
    const formatted = formatToolOutput(text);
    if (formatted.rich) {
      pre.innerHTML = formatted.html;
      pre.classList.add('tool-inline-detail-rich');
    } else {
      pre.textContent = text;
    }
  } else {
    pre.textContent = text;
  }
  section.appendChild(heading);
  section.appendChild(pre);
  host.appendChild(section);
  return true;
}

function renderInlineDetails(
  row: HTMLElement,
  input: unknown,
  result: InlineToolResult | null,
  state: string,
): void {
  // Unit/runtime harnesses may provide a deliberately tiny element stub.
  // The browser path always has querySelector; skipping detail decoration
  // keeps the lifecycle logic testable without requiring a DOM emulator.
  if (typeof (row as HTMLElement & { querySelector?: unknown }).querySelector !== 'function') return;
  const detail = row.querySelector('.tool-inline-detail') as HTMLElement | null;
  if (!detail) return;
  detail.replaceChildren();
  let hasContent = false;
  const name = row.dataset.tool || '';

  if (state === 'done' && isInlineSearchTool(name) && result && Array.isArray(result.results)) {
    const html = sourcesHtml(normalizeSources(result.results));
    if (html) {
      const section = document.createElement('section');
      section.className = 'tool-inline-detail-section';
      section.dataset.kind = 'sources';
      const heading = document.createElement('div');
      heading.className = 'tool-inline-detail-title';
      heading.textContent = translate('tool.sources', 'Sources');
      const list = document.createElement('div');
      list.innerHTML = html;
      section.appendChild(heading);
      while (list.firstChild) section.appendChild(list.firstChild);
      detail.appendChild(section);
      hasContent = true;
    }
  }

  hasContent = appendDetailSection(
    detail,
    translate('tool.arguments', 'Arguments'),
    input,
    'input',
  ) || hasContent;

  const failed = state === 'error';
  if (result) {
    const errorMessage = failed
      ? [result.userMessage, result.error].filter(Boolean).join('\n')
      : '';
    hasContent = appendDetailSection(
      detail,
      failed ? translate('tool.errorDetails', 'Error details') : translate('tool.result', 'Result'),
      failed ? (result.output || errorMessage) : result.output,
      failed ? 'error' : 'output',
    ) || hasContent;
    if (failed && result.detail != null && detailText(result.detail) !== errorMessage) {
      hasContent = appendDetailSection(
        detail,
        translate('tool.details', 'Details'),
        result.detail,
        'technical',
      ) || hasContent;
    }
    if (result.stderr) {
      hasContent = appendDetailSection(detail, 'stderr', result.stderr, 'error') || hasContent;
    }
  }

  if (!hasContent) {
    const empty = document.createElement('p');
    empty.className = 'tool-inline-detail-empty';
    empty.textContent = translate('tool.noDetails', 'No additional details.');
    detail.appendChild(empty);
  }
  row.dataset.expandable = '1';
}

function iconHtml(state: string): string {
  if (state === 'running') return '';
  if (state === 'done') return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (state === 'stopped') return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';
  return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.2v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="12.2" r="1.1" fill="currentColor"/></svg>';
}

/* Per-tool-type icons. Mirrors the convention in toolCards.js (24-viewBox,
   stroke, currentColor) so a tool looks the same in both the inline row and
   the expandable card. Falls back to a generic tool glyph for unknown names. */
const TOOL_INLINE_ICONS: Record<string, string> = {
  render_visualization: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="0.5"/><rect x="12" y="6" width="3" height="11" rx="0.5"/><rect x="17" y="13" width="3" height="4" rx="0.5"/></svg>',
  web_search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  web_fetch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  create_plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  create_spec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4M9 9h1"/></svg>',
  arxiv_search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
  zotero_search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5z"/></svg>',
  notion_search_pages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 12h8M8 16h8M8 8h2"/></svg>',
  github_list_repos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  gitee_list_repos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  code_interpreter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  Code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  Read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>',
  Write: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  Edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  Glob: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 4a13 13 0 0 1 0 14M4 11h14"/></svg>',
  Grep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  Bash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  WebFetch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
};

const FALLBACK_TOOL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

function toolTypeIconHtml(name: string): string {
  return TOOL_INLINE_ICONS[name] || FALLBACK_TOOL_ICON;
}

function durationText(result: InlineToolResult | null): string {
  if (!result || result.durationMs == null || !(result.durationMs > 0)) return '';
  return (result.durationMs / 1000).toFixed(1) + 's';
}

/** Create a live running row. Returned element carries data-tcid. */
export function createInlineToolRow(entry: InlineToolEntry): HTMLElement {
  const row = document.createElement('details');
  row.className = 'tool-inline';
  row.dataset.tcid = entry.id;
  row.dataset.tool = entry.name;
  row.dataset.state = 'running';
  row.innerHTML =
    '<summary class="tool-inline-head">'
    + '<span class="tool-inline-tool-icon">' + toolTypeIconHtml(entry.name) + '</span>'
    + '<span class="tool-inline-icon">' + iconHtml('running') + '</span>'
    + '<span class="tool-inline-label">' + esc(runningLabel(entry.name)) + '</span>'
    + '<span class="tool-inline-meta"></span>'
    + '<span class="tool-inline-chev" aria-hidden="true"></span>'
    + '</summary>'
    + '<div class="tool-inline-detail"></div>';
  (row as HTMLElement & { _toolInput?: unknown })._toolInput = entry.input;
  renderInlineDetails(row, entry.input, null, 'running');
  return row;
}

/** Update meta text (elapsed / phase) while running. */
export function updateInlineToolMeta(row: HTMLElement, text: string): void {
  if (row.dataset.state !== 'running') return;
  const meta = row.querySelector('.tool-inline-meta');
  if (meta) meta.textContent = text || '';
}

/* P_tool-delta-stream — compact rows dropped tool_call_delta frames, so a
   code_interpreter call in live chat showed only "Analyzing data" with no
   in-progress code. The server forwards cumulative arguments per delta;
   stream them into a live <pre> preview inside the row's detail area.
   renderInlineDetails() clears the detail on settle, so the preview is
   removed automatically once the final result replaces it. */
export function updateInlineToolCodePreview(row: HTMLElement, argsJson: string, _language: string): void {
  if (row.dataset.state !== 'running') return;
  const detail = row.querySelector('.tool-inline-detail') as HTMLElement | null;
  if (!detail) return;
  let preview = detail.querySelector('.tool-inline-code-preview') as HTMLElement | null;
  if (!preview) {
    preview = document.createElement('pre');
    preview.className = 'tool-inline-code-preview';
    detail.appendChild(preview);
  }
  const text = String(argsJson || '');
  if (preview.textContent !== text) preview.textContent = text;
}

/* P_tool_live_card — when a newer tool replaces the live visible
   card, the old one fades out of the live slot before being detached.
   The caller still owns the row's final placement (the live slot is
   presentation-only; finish() in main.js re-uses outerHTML for the
   serialized layout). We mark the row as leaving, force any in-flight
   CSS animation to cancel, and remove the element on the next frame so
   a same-tick mount of the new row doesn't fight the layout. */
export function fadeOutInlineToolRow(row: HTMLElement, durationMs: number = 160): void {
  if (!row || !row.classList) return;
  if (typeof row.getAnimations === 'function') {
    try { row.getAnimations().forEach(function (a) { try { a.cancel(); } catch (_) { /* ignore */ } }); } catch (_) { /* ignore */ }
  }
  row.classList.add('tool-inline-leaving');
  /* The leaving keyframe (defined in styles.css) drives opacity/transform.
     When the user prefers reduced motion, the keyframe is suppressed to
     a 0.01ms duration, so the cleanup below still removes the node
     promptly. */
  if (row.dataset && row.dataset.tcid) row.dataset.leavingAt = String(Date.now());
  const remove = function () {
    if (!row.parentNode && typeof row.remove !== 'function') return;
    try {
      if (typeof row.remove === 'function') { row.remove(); return; }
      if (row.parentNode && typeof row.parentNode.removeChild === 'function') row.parentNode.removeChild(row);
    } catch (_) { /* ignore */ }
  };
  try {
    const handler = function () {
      row.removeEventListener('transitionend', handler);
      row.removeEventListener('animationend', handler);
      remove();
    };
    row.addEventListener('transitionend', handler);
    row.addEventListener('animationend', handler);
  } catch (_) { /* ignore */ }
  /* Hard fallback: if no animation/transition fires (reduced-motion cut
     the duration to 0.01ms and the browser skipped the event), tear the
     element down after the requested window. */
  setTimeout(remove, Math.max(0, durationMs) + 60);
}

/* P_tool_live_card — flash the row's status background briefly so a
   fresh tool is recognizable as new. The class is removed after the
   transition window so the existing `transition: background-color .2s`
   declaration on `.tool-inline` carries the fade. The function is
   idempotent: a same-id update that re-invokes it clears any pending
   timer before scheduling a new one. */
const FLASH_MS = 1200;
export function flashInlineToolRow(row: HTMLElement): void {
  if (!row || !row.classList) return;
  if (typeof row.dataset === 'undefined') return;
  if (row.dataset._flashTimer) {
    try { clearTimeout(Number(row.dataset._flashTimer)); } catch (_) { /* ignore */ }
  }
  row.classList.add('tool-inline-flash');
  const handle = setTimeout(function () {
    if (!row.classList) return;
    row.classList.remove('tool-inline-flash');
    if (row.dataset) delete row.dataset._flashTimer;
  }, FLASH_MS);
  row.dataset._flashTimer = String(handle);
}

/* P_tool_live_card — single live slot helper. Swaps the host's single
   child to the new row, fading out the old one. If the host is empty
   the new row is mounted directly with a flash. The host is treated as
   presentation-only; persisted history/share still serialize every
   row in inlineToolRows. */
export function replaceLiveInlineToolRow(host: HTMLElement | null, next: HTMLElement | null, opts?: { skipFlash?: boolean }): HTMLElement | null {
  if (!host || !next) return next;
  if (next.parentNode === host) {
    if (!opts || !opts.skipFlash) flashInlineToolRow(next);
    return next;
  }
  /* P_tool_live_card — fade every previous live child out before the
     new row lands. Multiple intermediate rows can pile up during rapid
     bursts when reduced-motion cuts the fade duration to near zero;
     sweeping the whole children list keeps the visible single-card
     contract under any animation budget. */
  const previous = Array.from(host.children || []) as HTMLElement[];
  for (let i = 0; i < previous.length; i++) {
    const child = previous[i];
    if (!child || child === next) continue;
    try { fadeOutInlineToolRow(child); } catch (_) { /* ignore */ }
  }
  if (next.parentNode !== host) host.appendChild(next);
  if (!opts || !opts.skipFlash) flashInlineToolRow(next);
  return next;
}

/** Settle the row in place: done / error / stopped. */
export function settleInlineToolRow(
  row: HTMLElement,
  result: InlineToolResult | null,
  opts?: { cancelled?: boolean },
): void {
  const name = row.dataset.tool || '';
  const cancelled = !!(opts && opts.cancelled);
  const failed = !cancelled && !!result && result.ok === false;
  const state = cancelled ? 'stopped' : failed ? 'error' : 'done';
  row.dataset.state = state;
  const icon = row.querySelector('.tool-inline-icon');
  if (icon) icon.innerHTML = iconHtml(state);
  const label = row.querySelector('.tool-inline-label');
  if (label) {
    label.textContent = cancelled
      ? translate('tool.statusStopped', 'Stopped')
      : failed ? errorLabel(name, result) : doneLabel(name, result);
  }
  const meta = row.querySelector('.tool-inline-meta');
  if (meta) meta.textContent = durationText(result);
  const input = (row as HTMLElement & { _toolInput?: unknown })._toolInput;
  renderInlineDetails(row, input, result, state);
}
