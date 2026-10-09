import { esc } from '../../render/helpers.js';
import { formatToolOutput } from '../../render/toolOutput.js';
import { getSocratesWasm } from '../../lib/socratesWasm.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { isInlineSearchTool } from '../../render/toolCategory.js';
import { translate } from './labels.ts';
import type { InlineToolGroupMember, InlineToolResult } from './types.ts';

interface SourceItem {
  title: string;
  url: string;
  host: string;
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
/* TOOL_CALL_MAX_LINES: keep head+tail lines of oversized tool output,
   ellipsize the middle ("… +N lines"). */
const INLINE_DETAIL_HEAD_LINES = 5;
const INLINE_DETAIL_TAIL_LINES = 5;

/**
 * Line-aware head/tail truncation backed by the Rust mechanism library
 * (socrates-format::truncate_lines). The TS branch below mirrors the Rust
 * semantics exactly (CRLF normalized, trailing newline dropped, interior
 * empty lines kept) so WASM and fallback paths stay behavior-identical.
 */
export function truncateDetailLines(
  text: string,
  head: number = INLINE_DETAIL_HEAD_LINES,
  tail: number = INLINE_DETAIL_TAIL_LINES,
): { lines: string[]; omittedLines: number } {
  const w = getSocratesWasm();
  if (w) return w.truncate_tool_output(text, head, tail);
  if (!text) return { lines: [], omittedLines: 0 };
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines[lines.length - 1] === '') lines.pop();
  const headEnd = Math.min(lines.length, head);
  const tailLen = Math.min(lines.length - headEnd, tail);
  const omittedLines = lines.length - headEnd - tailLen;
  const kept = [...lines.slice(0, headEnd)];
  if (tailLen > 0) kept.push(...lines.slice(lines.length - tailLen));
  return { lines: kept, omittedLines };
}

function detailText(value: unknown): string {
  if (value == null || value === '') return '';
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try { text = JSON.stringify(value, null, 2) ?? String(value); } catch (_) { text = String(value); }
  }
  if (text.length <= INLINE_DETAIL_LIMIT) return text;
  const { lines, omittedLines } = truncateDetailLines(text);
  if (omittedLines <= 0) return text;
  return [...lines, `… +${omittedLines} lines`].join('\n');
}

function appendDetailSection(
  host: HTMLElement,
  title: string,
  value: unknown,
  kind: string,
  attrs?: Record<string, string>,
): boolean {
  const text = detailText(value).trim();
  if (!text) return false;
  const section = document.createElement('section');
  section.className = 'tool-inline-detail-section';
  section.dataset.kind = kind;
  /* P_tool_retryable — let callers stamp extra data-* attrs on the
     section so CSS can colour-code (e.g. retryable=yes/no). Existing
     call sites pass nothing and behave identically. */
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      try { section.dataset[key] = attrs[key]; } catch (e) { reportSwallow(e, 'toolInline.appendDetailSection.setDataset'); /* ignore */ }
    }
  }
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

function appendSourceSection(detail: HTMLElement, sources: SourceItem[]): boolean {
  const html = sourcesHtml(sources);
  if (!html) return false;
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
  return true;
}

function clearRowAttribute(row: HTMLElement, attribute: 'errorCode' | 'retryable', reason: string): void {
  try {
    delete row.dataset[attribute];
  } catch (error) {
    reportSwallow(error, reason);
  }
}

function appendErrorCode(detail: HTMLElement, row: HTMLElement, result: InlineToolResult, failed: boolean): boolean {
  if (!failed || !result.errorCode) {
    clearRowAttribute(row, 'errorCode', 'toolInline.renderInlineDetails.clearErrorCode');
    return false;
  }
  const errorCode = String(result.errorCode);
  row.dataset.errorCode = errorCode;
  return appendDetailSection(detail, translate('tool.errorCode', 'Error code'), errorCode, 'technical');
}

function appendRetryableHint(detail: HTMLElement, row: HTMLElement, result: InlineToolResult, failed: boolean): boolean {
  if (!failed || typeof result.retryable !== 'boolean') {
    clearRowAttribute(row, 'retryable', 'toolInline.renderInlineDetails.clearRetryable');
    return false;
  }
  const hint = result.retryable
    ? translate('tool.retryableYes', 'Retryable — safe to run again')
    : translate('tool.retryableNo', 'Not retryable — change the arguments first');
  row.dataset.retryable = result.retryable ? '1' : '0';
  return appendDetailSection(
    detail,
    translate('tool.retryable', 'Retryable'),
    hint,
    'technical',
    { retryable: result.retryable ? '1' : '0' },
  );
}

function appendRetryAction(detail: HTMLElement, row: HTMLElement, name: string, result: InlineToolResult): boolean {
  if (!isInlineSearchTool(name) || result.retryable === false) return false;
  const actions = document.createElement('div');
  actions.className = 'tool-inline-error-actions';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'tool-inline-retry';
  retry.textContent = translate('tool.retry', 'Retry search');
  retry.addEventListener('click', function (event) {
    event.preventDefault();
    event.stopPropagation();
    const stored = (row as HTMLElement & { _toolInput?: unknown })._toolInput;
    const query = stored && typeof stored === 'object' && (stored as { query?: unknown }).query;
    row.dispatchEvent(new CustomEvent('tool-retry', {
      bubbles: true,
      detail: {
        toolId: row.dataset.tcid || '',
        tool: name,
        query: typeof query === 'string' ? query : '',
        errorCode: result.errorCode || null,
      },
    }));
  });
  actions.appendChild(retry);
  detail.appendChild(actions);
  return true;
}

function appendResultSections(detail: HTMLElement, result: InlineToolResult, failed: boolean): boolean {
  const errorMessage = failed
    ? [result.userMessage, result.error].filter(Boolean).join('\n')
    : '';
  let hasContent = appendDetailSection(
    detail,
    failed ? translate('tool.errorDetails', 'Error details') : translate('tool.result', 'Result'),
    failed ? (result.output || errorMessage) : result.output,
    failed ? 'error' : 'output',
  );
  if (failed && result.detail != null && detailText(result.detail) !== errorMessage) {
    hasContent = appendDetailSection(detail, translate('tool.details', 'Details'), result.detail, 'technical') || hasContent;
  }
  if (result.stderr) hasContent = appendDetailSection(detail, 'stderr', result.stderr, 'error') || hasContent;
  return hasContent;
}

function appendResultDetails(row: HTMLElement, detail: HTMLElement, name: string, result: InlineToolResult, failed: boolean): boolean {
  let hasContent = appendErrorCode(detail, row, result, failed);
  hasContent = appendRetryableHint(detail, row, result, failed) || hasContent;
  if (failed && isInlineSearchTool(name)) {
    hasContent = appendRetryAction(detail, row, name, result) || hasContent;
  }
  return appendResultSections(detail, result, failed) || hasContent;
}

function appendEmptyDetail(detail: HTMLElement): void {
  const empty = document.createElement('p');
  empty.className = 'tool-inline-detail-empty';
  empty.textContent = translate('tool.noDetails', 'No additional details.');
  detail.appendChild(empty);
}

export function renderInlineDetails(
  row: HTMLElement,
  input: unknown,
  result: InlineToolResult | null,
  state: string,
): void {
  // Unit/runtime harnesses may provide a deliberately tiny element stub.
  if (typeof (row as HTMLElement & { querySelector?: unknown }).querySelector !== 'function') return;
  const detail = row.querySelector('.tool-inline-detail') as HTMLElement | null;
  if (!detail) return;
  detail.replaceChildren();
  const name = row.dataset.tool || '';
  let hasContent = false;
  if (state === 'done' && isInlineSearchTool(name) && result && Array.isArray(result.results)) {
    hasContent = appendSourceSection(detail, normalizeSources(result.results));
  }
  hasContent = appendDetailSection(detail, translate('tool.arguments', 'Arguments'), input, 'input') || hasContent;
  if (result) hasContent = appendResultDetails(row, detail, name, result, state === 'error') || hasContent;
  if (!hasContent) appendEmptyDetail(detail);
  row.dataset.expandable = '1';
}

function collectGroupSources(members: InlineToolGroupMember[]): SourceItem[] {
  const sources: SourceItem[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    const results = member.result && Array.isArray(member.result.results) ? member.result.results : [];
    for (const source of normalizeSources(results)) {
      const key = source.url || source.title;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
      if (sources.length >= 12) return sources;
    }
  }
  return sources;
}

function appendGroupFailureHints(sub: HTMLElement, result: InlineToolResult, failed: boolean): boolean {
  if (!failed) return false;
  let hasContent = false;
  if (result.errorCode) {
    hasContent = appendDetailSection(sub, translate('tool.errorCode', 'Error code'), String(result.errorCode), 'technical') || hasContent;
  }
  if (typeof result.retryable === 'boolean') {
    const hint = result.retryable
      ? translate('tool.retryableYes', 'Retryable — safe to run again')
      : translate('tool.retryableNo', 'Not retryable — change the arguments first');
    hasContent = appendDetailSection(
      sub,
      translate('tool.retryable', 'Retryable'),
      hint,
      'technical',
      { retryable: result.retryable ? '1' : '0' },
    ) || hasContent;
  }
  return hasContent;
}

function appendGroupMemberResult(sub: HTMLElement, result: InlineToolResult | null, failed: boolean): boolean {
  if (!result) return false;
  const hasFailureHints = appendGroupFailureHints(sub, result, failed);
  const hasResult = appendResultSections(sub, result, failed);
  return hasFailureHints || hasResult;
}

function appendStoppedMember(sub: HTMLElement): boolean {
  const stopped = document.createElement('p');
  stopped.className = 'tool-inline-detail-empty';
  stopped.textContent = translate('tool.statusStopped', 'Stopped');
  sub.appendChild(stopped);
  return true;
}

function appendRunningMemberDetails(sub: HTMLElement, member: InlineToolGroupMember, result: InlineToolResult | null, failed: boolean): boolean {
  const hasArguments = appendDetailSection(sub, translate('tool.arguments', 'Arguments'), member.input, 'input');
  return appendGroupMemberResult(sub, result, failed) || hasArguments;
}

function renderGroupMemberSection(member: InlineToolGroupMember, index: number, count: number): { section: HTMLElement; hasContent: boolean } {
  const result = member.result || null;
  const failed = !!(member.failed || (result && result.ok === false));
  const section = document.createElement('section');
  section.className = 'tool-inline-detail-section';
  section.dataset.kind = 'member';
  section.dataset.memberId = member.id;
  const heading = document.createElement('div');
  heading.className = 'tool-inline-detail-title tool-inline-detail-member-title';
  heading.textContent = count > 1 ? '#' + (index + 1) + ' ' + (member.name || 'tool') : (member.name || 'tool');
  section.appendChild(heading);

  const sub = document.createElement('div');
  sub.className = 'tool-inline-detail-member';
  const hasContent = member.cancelled
    ? appendStoppedMember(sub)
    : appendRunningMemberDetails(sub, member, result, failed);
  section.appendChild(sub);
  return { section, hasContent };
}

export function renderInlineGroupDetails(
  row: HTMLElement,
  members: InlineToolGroupMember[],
  state: string,
): void {
  const detail = row.querySelector('.tool-inline-detail') as HTMLElement | null;
  if (!detail) return;
  detail.replaceChildren();
  const name = row.dataset.tool || '';
  let hasContent = false;
  if (state !== 'error' && isInlineSearchTool(name)) {
    hasContent = appendSourceSection(detail, collectGroupSources(members));
  }
  members.forEach((member, index) => {
    const rendered = renderGroupMemberSection(member, index, members.length);
    detail.appendChild(rendered.section);
    hasContent = rendered.hasContent || hasContent;
  });
  if (!hasContent) appendEmptyDetail(detail);
  row.dataset.expandable = '1';
}
