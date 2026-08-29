/**
 * ui/toolInline.ts — imperative inline tool rows.
 *
 * A row is mounted in the message flow at the exact point the tool fired
 * (text → row → text). It starts in a running state (spinner + action
 * label) and settles in place to done / error; web-search rows expand
 * (native <details>) to reveal the source list.
 *
 * This is the DEGRADED surface. When React owns #msgList the rows are
 * drawn from `message.toolCalls[]` by react/tool-run instead, and neither
 * this module nor `message.html` carries them — so a reload renders from
 * data rather than from row markup persisted into the answer. What stays
 * here is what the degraded path and `chat/toolRuntime.ts` still need: the
 * row lifecycle (create / settle / replace) and the shared pure helpers
 * (`toolCategory`, `isInlineSearchTool`, `truncateDetailLines`).
 *
 * Where the two surfaces must agree on wording, they read the same
 * fallbacks below; labels with an object ("读取 moe.py", not "已读取文件")
 * are derived in react/tool-run/toolRunModel.ts.
 */

import { esc } from '../render/helpers.js';
import { formatToolOutput } from '../render/toolOutput.js';
import { toolCategory as categoryOf } from '../render/toolCategory.js';
import { getSocratesWasm } from '../lib/socratesWasm.js';
import { toolCardView } from './toolCardView.js';
import { STROKE_ICONS, toolIcon } from './icons/toolIcons.js';

/* ============================================================
   RUNNING-ROW ELAPSED TIMER (task 6.3, Req 3.2 / 3.3)
   Inline rows share a single ~250ms interval that recomputes the
   elapsed time via toolCardView(run, Date.now()) and writes it into
   the row's .tool-inline-meta while data-state === "running". The
   interval stops once no running rows remain. settleInlineToolRow /
   settleInlineToolGroupRow flip data-state to a terminal value and
   write the final duration, so the timer simply unregisters the row
   on its next observation. */
const RUNNING_INLINE_ROWS = new Set<HTMLElement>();
let INLINE_ROW_TIMER: ReturnType<typeof setInterval> | null = null;
const INLINE_ROW_TICK_MS = 250;

function inlineRowIsRunning(row: HTMLElement): boolean {
  return row.dataset.state === 'running';
}

function stopInlineRowTimer(row?: HTMLElement | null): void {
  if (row) RUNNING_INLINE_ROWS.delete(row);
  if (RUNNING_INLINE_ROWS.size === 0 && INLINE_ROW_TIMER != null) {
    clearInterval(INLINE_ROW_TIMER);
    INLINE_ROW_TIMER = null;
  }
}

/** Stop timing a row when its owning runtime is disposed before a result
 * arrives (for example, a cancelled test or an interrupted stream). */
export function stopInlineToolRowTimer(row: HTMLElement | null | undefined): void {
  stopInlineRowTimer(row);
}

function tickInlineRows(): void {
  const now = Date.now();
  RUNNING_INLINE_ROWS.forEach((row) => {
    const connected = (row as HTMLElement & { isConnected?: boolean }).isConnected;
    if (connected === false) { stopInlineRowTimer(row); return; }
    if (!inlineRowIsRunning(row)) { stopInlineRowTimer(row); return; }
    const startedAt = Number(row.dataset.startedAt) || now;
    const view = toolCardView({ id: '', tool: '', phase: 'running', startedAt }, now);
    const meta = row.querySelector('.tool-inline-meta');
    // Only own the meta text while running; the settle path writes the
    // authoritative final duration from result.durationMs.
    if (meta) {
      meta.textContent = view.timeLabel;
      // Quiet "still alive" cue: the collapsed chip expands + fades in
      // once a run passes five seconds (styles.css .is-visible).
      if (now - startedAt >= 5000 && !meta.classList.contains('is-visible')) meta.classList.add('is-visible');
    }
  });
}

function startInlineRowTimer(row: HTMLElement): void {
  if (!row || RUNNING_INLINE_ROWS.has(row)) return;
  if (!row.dataset.startedAt) row.dataset.startedAt = String(Date.now());
  RUNNING_INLINE_ROWS.add(row);
  if (INLINE_ROW_TIMER == null && typeof setInterval === 'function') {
    INLINE_ROW_TIMER = setInterval(tickInlineRows, INLINE_ROW_TICK_MS);
  }
}

export interface InlineToolEntry {
  id: string;
  name: string;
  input?: unknown;
}

export interface InlineToolResult {
  ok?: boolean;
  status?: string;
  errorCode?: string | null;
  retryable?: boolean;
  durationMs?: number;
  results?: unknown[];
  output?: string;
  stderr?: string;
  error?: string;
  userMessage?: string;
  detail?: unknown;
}

export interface InlineToolGroupMember {
  id: string;
  name: string;
  input?: unknown;
  result?: InlineToolResult | null;
  cancelled?: boolean;
  failed?: boolean;
}

export interface InlineToolMessageCall {
  id?: string;
  name?: string;
  input?: unknown;
  output?: string | null;
  isError?: boolean;
  results?: unknown[];
  stderr?: string;
  error?: string;
  errorCode?: string | null;
  retryable?: boolean;
  userMessage?: string;
  detail?: unknown;
  durationMs?: number;
  _run?: { phase?: string; durationMs?: number };
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

/**
 * Display category for a tool name. Lives in render/toolCategory.ts so the
 * declarative renderer and the runtime merge logic share one table; re-exported
 * here because existing importers (and test/wasmParity.test.mjs) reach for it
 * on this module.
 */
export function toolCategory(name: string): string {
  return categoryOf(name);
}

/**
 * Marks a live row as the collapsed head of a same-category group and
 * updates its label to a count form ("Searching the web (2)…"). The count
 * is recorded on `data-group-count` so the presentation stays
 * serialization-safe.
 */
export function updateInlineToolGroupLabel(row: HTMLElement, count: number): void {
  const name = row.dataset.tool || '';
  const base = runningLabel(name).replace(/…+$/, '');
  const label = row.querySelector('.tool-inline-label');
  if (label) label.textContent = base + ' (' + count + ')…';
  row.dataset.groupCount = String(count);
}

/** Update the live action copy without changing the row's running state. */
export function updateInlineToolLabel(row: HTMLElement, text: string): void {
  if (!row || row.dataset.state !== 'running') return;
  const label = row.querySelector('.tool-inline-label') as HTMLElement | null;
  if (!label) return;
  label.textContent = text;
  label.classList.add('shimmer-text');
}

function runningLabel(name: string): string {
  if (name === 'workspace_agent') return translate('tool.actionCodex', 'Working in the Codex workspace…');
  if (SEARCH_TOOLS.has(name)) return translate('tool.actionSearch', 'Searching the web…');
  if (name === 'code_interpreter' || name === 'Code') return translate('tool.actionCode', 'Executing code…');
  if (name === 'render_visualization') return translate('tool.actionVisual', 'Creating a visual');
  if (name === 'web_fetch') return translate('tool.actionFetch', 'Reading the page…');
  if (name === 'create_plan') return translate('tool.actionPlan', 'Drafting a plan…');
  if (name === 'create_spec') return translate('tool.actionSpec', 'Drafting a spec…');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.actionRead', 'Reading files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.actionWrite', 'Updating files');
  return translate('tool.actionDefault', 'Using a tool');
}

function doneLabel(name: string, result: InlineToolResult | null): string {
  if (result && result.status === 'awaiting_approval') return translate('tool.awaitingApproval', 'Waiting for your decision');
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
  if (name === 'workspace_agent') return translate('tool.doneCodex', 'Completed the Codex workspace task');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.doneRead', 'Read files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.doneWrite', 'Updated files');
  return translate('tool.doneDefault', 'Finished using tool');
}

function errorLabel(name: string, result: InlineToolResult | null): string {
  if (result && result.status === 'timeout') return translate('tool.statusTimeout', 'Timeout');
  if (SEARCH_TOOLS.has(name)) return translate('tool.searchFailed', 'Web search failed');
  if (name === 'workspace_agent') return translate('tool.codexFailed', 'Codex workspace task failed');
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
/* Codex TOOL_CALL_MAX_LINES: keep head+tail lines of oversized tool output,
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
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try { text = JSON.stringify(value, null, 2); } catch (_) { text = String(value); }
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
      try { section.dataset[key] = attrs[key]; } catch (_) { /* ignore */ }
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
    if (failed && result.errorCode) {
      /* P_tool_error_code — surface the structured errorCode the
         backend already emits (e.g. "web_fetch_failed", "not_connected",
         "search_timeout"). Without it the model re-tries with the same
         arguments on the next turn; with it the system prompt can teach
         the model to switch strategy per code. Rendered as its own
         technical section so the code stays copy-pasteable for
         debugging. */
      hasContent = appendDetailSection(
        detail,
        translate('tool.errorCode', 'Error code'),
        String(result.errorCode),
        'technical',
      ) || hasContent;
      row.dataset.errorCode = String(result.errorCode);
    } else {
      try { delete row.dataset.errorCode; } catch (_) { /* ignore */ }
    }
    if (failed && typeof result.retryable === 'boolean') {
      /* P_tool_retryable — surface the backend's retryable hint so the
         user knows whether to retry, edit their query, or stop. A row
         that the backend flagged as non-retryable (e.g. "invalid_query",
         "missing_url") should never be re-issued unchanged. */
      const hint = result.retryable
        ? translate('tool.retryableYes', 'Retryable — safe to run again')
        : translate('tool.retryableNo', 'Not retryable — change the arguments first');
      hasContent = appendDetailSection(detail, translate('tool.retryable', 'Retryable'), hint, 'technical', { retryable: result.retryable ? '1' : '0' }) || hasContent;
      row.dataset.retryable = result.retryable ? '1' : '0';
    } else {
      try { delete row.dataset.retryable; } catch (_) { /* ignore */ }
    }
    /* P_tool_retry_button — for failed search rows, append a Retry
       button that dispatches a `tool-retry` CustomEvent. The runtime
       (main.js / toolRuntime) listens for it and routes to its
       onSearchRetry handler. Avoids tight coupling between the inline
       view module and the chat runtime; share/history replay gets the
       same affordance without any extra wiring. */
    if (failed && isInlineSearchTool(name) && result.retryable !== false) {
      const actions = document.createElement('div');
      actions.className = 'tool-inline-error-actions';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'tool-inline-retry';
      retry.textContent = translate('tool.retry', 'Retry search');
      retry.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
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
      hasContent = true;
    }
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

function groupDurationMs(members: InlineToolGroupMember[]): number {
  let total = 0;
  for (const member of members) {
    const duration = member.result && member.result.durationMs;
    if (typeof duration === 'number' && duration > 0) total += duration;
  }
  return total;
}

function groupErrorLabel(members: InlineToolGroupMember[]): string {
  const failed = members.filter((m) => m.failed || (m.result && m.result.ok === false)).length;
  const base = translate('tool.groupNeedsAttention', 'Tool needs attention');
  if (!failed) return base;
  return base + ' · ' + translate('tool.failedCount', '{n} failed').replace('{n}', String(failed));
}

function groupDoneLabel(name: string, members: InlineToolGroupMember[]): string {
  const count = members.length;
  const failed = members.filter((m) => m.failed || (m.result && m.result.ok === false)).length;
  if (failed > 0) return groupErrorLabel(members);
  if (isInlineSearchTool(name)) {
    let total = 0;
    for (const member of members) {
      const results = member.result && Array.isArray(member.result.results)
        ? member.result.results
        : [];
      total += results.length;
    }
    if (total > 0) {
      return translate('tool.groupSearchDone', 'Found {n} sources · {m} searches')
        .replace('{n}', String(total))
        .replace('{m}', String(count));
    }
    return translate('tool.groupSearchEmpty', 'No results · {m} searches')
      .replace('{m}', String(count));
  }
  if (name === 'code_interpreter' || name === 'Code') {
    return translate('tool.groupCodeDone', 'Executed {m} runs').replace('{m}', String(count));
  }
  if (name === 'render_visualization') {
    return translate('tool.groupVisualDone', 'Created {m} visuals').replace('{m}', String(count));
  }
  return translate('tool.groupDone', 'Used {m} tools').replace('{m}', String(count));
}

function renderInlineGroupDetails(
  row: HTMLElement,
  members: InlineToolGroupMember[],
  state: string,
): void {
  const detail = row.querySelector('.tool-inline-detail') as HTMLElement | null;
  if (!detail) return;
  detail.replaceChildren();
  let hasContent = false;
  const name = row.dataset.tool || '';

  /* Combined source list for grouped search rows (deduped across calls). */
  if (state !== 'error' && isInlineSearchTool(name)) {
    const all: SourceItem[] = [];
    const seen = new Set<string>();
    for (const member of members) {
      const results = member.result && Array.isArray(member.result.results)
        ? member.result.results
        : [];
      for (const src of normalizeSources(results)) {
        const key = src.url || src.title;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(src);
        if (all.length >= 12) break;
      }
      if (all.length >= 12) break;
    }
    if (all.length) {
      const section = document.createElement('section');
      section.className = 'tool-inline-detail-section';
      section.dataset.kind = 'sources';
      const heading = document.createElement('div');
      heading.className = 'tool-inline-detail-title';
      heading.textContent = translate('tool.sources', 'Sources');
      const list = document.createElement('div');
      list.innerHTML = sourcesHtml(all);
      section.appendChild(heading);
      while (list.firstChild) section.appendChild(list.firstChild);
      detail.appendChild(section);
      hasContent = true;
    }
  }

  for (let index = 0; index < members.length; index++) {
    const member = members[index];
    const result = member.result || null;
    const failed = !!(member.failed || (result && result.ok === false));
    const cancelled = !!member.cancelled;
    const section = document.createElement('section');
    section.className = 'tool-inline-detail-section';
    section.dataset.kind = 'member';
    section.dataset.memberId = member.id;
    const heading = document.createElement('div');
    heading.className = 'tool-inline-detail-title tool-inline-detail-member-title';
    heading.textContent = members.length > 1
      ? '#' + (index + 1) + ' ' + (member.name || 'tool')
      : (member.name || 'tool');
    section.appendChild(heading);
    const sub = document.createElement('div');
    sub.className = 'tool-inline-detail-member';
    if (cancelled) {
      const empty = document.createElement('p');
      empty.className = 'tool-inline-detail-empty';
      empty.textContent = translate('tool.statusStopped', 'Stopped');
      sub.appendChild(empty);
      hasContent = true;
    } else {
      hasContent = appendDetailSection(
        sub,
        translate('tool.arguments', 'Arguments'),
        member.input,
        'input',
      ) || hasContent;
      const errorMessage = failed
        ? [result && result.userMessage, result && result.error].filter(Boolean).join('\n')
        : '';
      if (failed && result && result.errorCode) {
        /* P_tool_error_code — per-member errorCode inside grouped rows
           (mirrors renderInlineDetails). Lets the user see which
           member of a multi-call failed and with which code. */
        hasContent = appendDetailSection(sub, translate('tool.errorCode', 'Error code'), String(result.errorCode), 'technical') || hasContent;
      }
      if (failed && result && typeof result.retryable === 'boolean') {
        /* P_tool_retryable — per-member retryable hint. */
        const hint = result.retryable
          ? translate('tool.retryableYes', 'Retryable — safe to run again')
          : translate('tool.retryableNo', 'Not retryable — change the arguments first');
        hasContent = appendDetailSection(sub, translate('tool.retryable', 'Retryable'), hint, 'technical', { retryable: result.retryable ? '1' : '0' }) || hasContent;
      }
      hasContent = appendDetailSection(
        sub,
        failed ? translate('tool.errorDetails', 'Error details') : translate('tool.result', 'Result'),
        failed ? (result && result.output) || errorMessage : result && result.output,
        failed ? 'error' : 'output',
      ) || hasContent;
      if (failed && result && result.detail != null && detailText(result.detail) !== errorMessage) {
        hasContent = appendDetailSection(
          sub,
          translate('tool.details', 'Details'),
          result.detail,
          'technical',
        ) || hasContent;
      }
      if (result && result.stderr) {
        hasContent = appendDetailSection(sub, 'stderr', result.stderr, 'error') || hasContent;
      }
    }
    section.appendChild(sub);
    detail.appendChild(section);
  }

  if (!hasContent) {
    const empty = document.createElement('p');
    empty.className = 'tool-inline-detail-empty';
    empty.textContent = translate('tool.noDetails', 'No additional details.');
    detail.appendChild(empty);
  }
  row.dataset.expandable = '1';
}

/** Settle a grouped row with per-member aggregate status + details. */
export function settleInlineToolGroupRow(
  row: HTMLElement,
  members: InlineToolGroupMember[],
  opts?: { cancelled?: boolean },
): void {
  const name = row.dataset.tool || '';
  const cancelledAll = !!(opts && opts.cancelled);
  const failed = members.some((m) => m.failed || (m.result && m.result.ok === false));
  const cancelled = cancelledAll || members.every((m) => m.cancelled);
  const state = cancelled ? 'stopped' : failed ? 'error' : 'done';
  row.dataset.state = state;
  row.dataset.groupSettled = '1';
  // Group head reached a terminal aggregate — leave the shared timer.
  stopInlineRowTimer(row);
  const toolIcon = row.querySelector('.tool-inline-tool-icon');
  if (toolIcon) settleIconCrossfade(toolIcon, toolTypeIconHtml(name));
  const label = row.querySelector('.tool-inline-label');
  if (label) {
    label.classList.remove('shimmer-text');
    label.textContent = cancelled
      ? translate('tool.statusStopped', 'Stopped')
      : failed
        ? groupErrorLabel(members)
        : groupDoneLabel(name, members);
  }
  const meta = row.querySelector('.tool-inline-meta');
  const duration = groupDurationMs(members);
  if (meta) {
    meta.textContent = duration > 0 ? (duration / 1000).toFixed(1) + 's' : '';
    if (meta.textContent) meta.classList.add('is-visible');
  }
  /* P_tool_error_code — stamp the first failed member's errorCode on
     the row so the head chip area can show it without expansion, and
     compute an aggregate retryable flag (true only when every failed
     member is retryable). Mirrors the writeback in renderInlineDetails
     for non-grouped rows. */
  const firstFailed = members.find((m) => m.failed || (m.result && m.result.ok === false));
  if (firstFailed && firstFailed.result && firstFailed.result.errorCode) {
    row.dataset.errorCode = String(firstFailed.result.errorCode);
  } else {
    try { delete row.dataset.errorCode; } catch (_) { /* ignore */ }
  }
  const allRetryable = failed && members.every((m) => {
    if (!(m.failed || (m.result && m.result.ok === false))) return true;
    return m.result && m.result.retryable !== false;
  });
  if (failed) {
    row.dataset.retryable = allRetryable ? '1' : '0';
  } else {
    try { delete row.dataset.retryable; } catch (_) { /* ignore */ }
  }
  renderInlineGroupDetails(row, members, state);
}

/**
 * Finish-time fallback: settle a row from the message's persisted toolCalls.
 * Grouped rows (data-group-ids) settle as one aggregate row; plain rows keep
 * the existing "stopped" behaviour for anything still running at finish.
 */
export function settleInlineToolRowFromMessage(
  row: HTMLElement,
  message: { toolCalls?: InlineToolMessageCall[] } | null,
): void {
  const groupIds = row.dataset.groupIds;
  const calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
  if (groupIds && calls.length) {
    const ids = groupIds.split(',');
    const members = ids
      .map((id) => calls.find((call) => String(call.id) === id))
      .filter(Boolean) as InlineToolMessageCall[];
    if (members.length >= 1) {
      settleInlineToolGroupRow(row, members.map((member) => ({
        id: String(member.id || ''),
        name: member.name || row.dataset.tool || 'tool',
        input: member.input,
        result: {
          ok: !member.isError,
          output: member.output || undefined,
          results: member.results,
          error: member.isError ? (member.error || member.output || undefined) : undefined,
          errorCode: member.errorCode || (member.isError ? 'tool_execution_failed' : undefined),
          retryable: typeof member.retryable === 'boolean' ? member.retryable : undefined,
          stderr: member.stderr,
          userMessage: member.userMessage,
          detail: member.detail,
          durationMs: member._run && member._run.durationMs ? member._run.durationMs : member.durationMs || 0,
        },
        cancelled: !!(member._run && member._run.phase === 'cancelled'),
        failed: !!member.isError,
      })), { cancelled: true });
      return;
    }
  }
  settleInlineToolRow(row, null, { cancelled: true });
}

/* P_tool-inline-spinner — while a tool is in flight the tool-type icon
   is swapped for a quiet spinner inside the same slot. The slot itself
   keeps its 16×16 footprint so the label never reflows when the tool
   settles. */
function runningIconHtml(): string {
  return '<span class="tool-inline-spinner" aria-hidden="true"></span>';
}

/* Per-tool-type icons come from the shared monochrome set
   (ui/icons/toolIcons.ts) so a tool looks identical in the inline row, the
   expandable card, and an agent step. */
function toolTypeIconHtml(name: string): string {
  return toolIcon(name);
}

/* P_tool-inline-settle — crossfade the spinner into the tool glyph:
   .is-settling fades the spinner out (styles.css), the glyph lands
   ~110ms later with the inline-icon-enter animation on the same slot.
   Environments without requestAnimationFrame (JSDOM) swap in a plain
   timeout so tests stay deterministic. */
function settleIconCrossfade(slot: Element, html: string): void {
  slot.classList.add('is-settling');
  const swap = (): void => {
    setTimeout(() => {
      slot.innerHTML = html;
      setTimeout(() => { try { slot.classList.remove('is-settling'); } catch (_) { /* ignore */ } }, 260);
    }, 110);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(swap);
  else swap();
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
  /* P_tool-inline-spinner — while in flight the tool-type glyph is
     swapped for a spinner inside the SAME .tool-inline-tool-icon slot,
     so the row's width doesn't reflow when the tool settles. */
  row.innerHTML =
    '<summary class="tool-inline-head">'
    + '<span class="tool-inline-tool-icon">' + runningIconHtml() + '</span>'
    + '<span class="tool-inline-label shimmer-text">' + esc(runningLabel(entry.name)) + '</span>'
    + '<span class="tool-inline-meta"></span>'
    + '<span class="tool-inline-chev" aria-hidden="true">' + STROKE_ICONS.chevronRight + '</span>'
    + '</summary>'
    + '<div class="tool-inline-detail"></div>';
  (row as HTMLElement & { _toolInput?: unknown })._toolInput = entry.input;
  row.dataset.startedAt = String(Date.now());
  renderInlineDetails(row, entry.input, null, 'running');
  // Join the shared elapsed timer (Req 3.2): the live meta shows the
  // running duration until the row settles to its final total (Req 3.3).
  startInlineRowTimer(row);
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
  const awaitingApproval = !!result && result.status === 'awaiting_approval';
  const failed = !cancelled && !!result && result.ok === false;
  const state = cancelled ? 'stopped' : awaitingApproval ? 'awaiting' : failed ? 'error' : 'done';
  row.dataset.state = state;
  // Terminal reached — drop out of the shared elapsed timer so it can
  // stop once no running rows remain (Req 3.3). The final duration is
  // written below from result.durationMs.
  stopInlineRowTimer(row);
  /* Replace the running spinner with the tool-type icon when the tool
     settles so the glyph stabilises alongside the new label. */
  const toolIcon = row.querySelector('.tool-inline-tool-icon');
  if (toolIcon) settleIconCrossfade(toolIcon, toolTypeIconHtml(name));
  const label = row.querySelector('.tool-inline-label');
  if (label) {
    label.classList.remove('shimmer-text');
    label.textContent = cancelled
      ? translate('tool.statusStopped', 'Stopped')
      : awaitingApproval ? translate('tool.awaitingApproval', 'Waiting for your decision')
      : failed ? errorLabel(name, result) : doneLabel(name, result);
  }
  // Write the final total duration into the meta (Req 3.3): prefer the
  // backend's authoritative durationMs; fall back to the wall-clock span
  // the live timer was tracking so a settled row never shows a stale
  // mid-run value.
  const meta = row.querySelector('.tool-inline-meta');
  if (meta) {
    const backend = durationText(result);
    if (backend) {
      meta.textContent = backend;
    } else if (cancelled || !awaitingApproval) {
      const startedAt = Number(row.dataset.startedAt) || Date.now();
      meta.textContent = toolCardView(
        { id: '', tool: '', phase: 'succeeded', startedAt, endedAt: Date.now() },
        Date.now(),
      ).timeLabel;
    }
    if (meta.textContent) meta.classList.add('is-visible');
  }
  const input = (row as HTMLElement & { _toolInput?: unknown })._toolInput;
  renderInlineDetails(row, input, result, state);
}
