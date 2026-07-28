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

export interface InlineToolEntry {
  id: string;
  name: string;
}

export interface InlineToolResult {
  ok?: boolean;
  status?: string;
  durationMs?: number;
  results?: unknown[];
  error?: string;
  userMessage?: string;
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

function iconHtml(state: string): string {
  if (state === 'running') return '';
  if (state === 'done') return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (state === 'stopped') return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';
  return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.2v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="12.2" r="1.1" fill="currentColor"/></svg>';
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
    + '<span class="tool-inline-icon">' + iconHtml('running') + '</span>'
    + '<span class="tool-inline-label">' + esc(runningLabel(entry.name)) + '</span>'
    + '<span class="tool-inline-meta"></span>'
    + '<span class="tool-inline-chev" aria-hidden="true"></span>'
    + '</summary>'
    + '<div class="tool-inline-detail"></div>';
  return row;
}

/** Update meta text (elapsed / phase) while running. */
export function updateInlineToolMeta(row: HTMLElement, text: string): void {
  if (row.dataset.state !== 'running') return;
  const meta = row.querySelector('.tool-inline-meta');
  if (meta) meta.textContent = text || '';
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
  const detail = row.querySelector('.tool-inline-detail');
  if (detail && state === 'done' && isInlineSearchTool(name) && result && Array.isArray(result.results)) {
    const html = sourcesHtml(normalizeSources(result.results));
    if (html) {
      detail.innerHTML = html;
      row.dataset.expandable = '1';
    }
  }
}
