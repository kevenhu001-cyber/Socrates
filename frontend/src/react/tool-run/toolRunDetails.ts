import {toolCategory} from '../../render/toolCategory.js';
import {
  basename,
  clip,
  commandOf,
  filePathOf,
  formatSeconds,
  queryOf,
  toolRunLabel,
  translate,
} from './labels.js';
import {durationOf, toolRunStateOf} from './toolRunState.ts';
import type {
  ApprovalView,
  SourceItem,
  ToolCallRecord,
  ToolRunState,
  ToolRunView,
} from './toolRunModel.types.ts';

/* ── per-row view ──────────────────────────────────────────────────────── */

const DETAIL_LIMIT = 12_000;
const DETAIL_HEAD_LINES = 5;
const DETAIL_TAIL_LINES = 5;
const MAX_SOURCES = 12;
const MAX_SOURCE_HOSTS = 8;

/**
 * Line-aware head/tail truncation. Mirrors ui/toolInline.ts's
 * truncateDetailLines (TOOL_CALL_MAX_LINES) without the WASM hop: the
 * mechanism library path is exercised in test/wasmParity.test.mjs against the
 * ui implementation, and this keeps the model importable in plain Node.
 */
export function truncateLines(
  text: string,
  head: number = DETAIL_HEAD_LINES,
  tail: number = DETAIL_TAIL_LINES,
): { lines: string[]; omittedLines: number } {
  if (!text) return { lines: [], omittedLines: 0 };
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines[lines.length - 1] === '') lines.pop();
  const headEnd = Math.min(lines.length, head);
  const tailLen = Math.min(lines.length - headEnd, tail);
  const omittedLines = lines.length - headEnd - tailLen;
  const kept = lines.slice(0, headEnd);
  if (tailLen > 0) kept.push(...lines.slice(lines.length - tailLen));
  return { lines: kept, omittedLines };
}

/** Flattened, UNBOUNDED text for a detail block (kept for expand/copy). */
export function rawDetailText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
}

/** Flattened, bounded text for a detail block. */
export function detailText(value: unknown): string {
  const text = rawDetailText(value);
  if (text.length <= DETAIL_LIMIT) return text;
  const { lines, omittedLines } = truncateLines(text);
  if (omittedLines <= 0) return text;
  return [...lines, `… +${omittedLines} lines`].join('\n');
}

/** Display text + the untruncated source when truncation actually fired. */
export function clippedText(value: unknown): { text: string; fullText?: string } {
  const full = rawDetailText(value);
  const shown = detailText(full);
  return shown.length < full.length
    ? { text: shown.trim(), fullText: full }
    : { text: shown.trim() };
}

export function normalizeSources(results: ReadonlyArray<unknown> | null | undefined): SourceItem[] {
  const list = Array.isArray(results) ? results : [];
  const out: SourceItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length && out.length < MAX_SOURCE_HOSTS; i++) {
    const item = list[i] as { title?: unknown; url?: unknown; date?: unknown; source?: unknown } | null;
    if (!item) continue;
    const url = String(item.url || '').trim();
    const title = String(item.title || url || '').trim();
    if (!title) continue;
    const key = url || title;
    if (seen.has(key)) continue;
    seen.add(key);
    let host = '';
    try {
      if (/^https?:\/\//i.test(url)) host = new URL(url).hostname.replace(/^www\./i, '');
    } catch (_) { /* unparseable url keeps an empty host */ }
    const date = typeof item.date === 'string' ? item.date.trim() : '';
    const source = typeof item.source === 'string' ? item.source.trim() : '';
    out.push({
      title: clip(title, 120), url: /^https?:\/\//i.test(url) ? url : '', host,
      ...(date ? { date: clip(date, 30) } : {}),
      ...(source ? { source: clip(source, 32) } : {}),
    });
  }
  return out;
}

/** Deduped cross-call source list for a group, capped at MAX_SOURCES. */
export function groupSources(members: ToolCallRecord[]): SourceItem[] {
  const out: SourceItem[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    for (const src of normalizeSources(member.results)) {
      const key = src.url || src.title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(src);
      if (out.length >= MAX_SOURCES) return out;
    }
  }
  return out;
}

/**
 * A tool result echo carries no information the row label does not already
 * have ("Result: 3 results"), and burying the real payload under it is what
 * made the old detail panel read as noise. Drop those.
 */
function isEchoOutput(output: string): boolean {
  const text = output.trim();
  if (!text) return true;
  /* A bare count line is an echo whether or not results[] survived the save:
     the row label already carries the count when we have it, and the payload
     itself is never literally "3 results". Restricted to count-shaped lines
     so a real first line ("3 passed", "4 files changed") is never dropped. */
  if (/^\d[\d,.]*\s+(results?|hits?|matches|sources?|findings|records|items|rows|pages|files|docs?)\s*[.!]?$/i.test(text)) return true;
  if (/^(ok|done|success|completed|successf(ul|ully))\.?$/i.test(text)) return true;
  return false;
}

function appendFailedDetails(view: ToolRunView, call: ToolCallRecord, output: string): void {
  const errorMessage = [call.userMessage, call.error].filter(Boolean).join('\n');
  const errorText = errorMessage || output || clippedText(call.detail).text;
  if (errorText) {
    view.sections.push({ kind: 'error', title: translate('tool.errorDetails', 'Error details'), text: errorText });
  }
  if (call.stderr) {
    const stderr = clippedText(call.stderr);
    view.sections.push({ kind: 'error', title: 'stderr', text: stderr.text, fullText: stderr.fullText });
  }
  if (call.errorCode) {
    view.tech.push({ kind: 'fact', title: translate('tool.errorCode', 'Error code'), text: String(call.errorCode) });
  }
  if (typeof call.retryable === 'boolean') {
    view.tech.push({
      kind: 'fact',
      title: translate('tool.retryable', 'Retryable'),
      text: call.retryable
        ? translate('tool.retryableYes', 'Retryable — safe to run again')
        : translate('tool.retryableNo', 'Not retryable — change the arguments first'),
      retryable: call.retryable ? '1' : '0',
    });
  }
  if (call.retryable !== false && toolCategory(call.name) === 'search') {
    view.retry = {
      toolId: call.id,
      tool: call.name,
      query: queryOf(call.input),
      errorCode: call.errorCode ?? null,
    };
  }
}

function appendSettledDetails(
  view: ToolRunView,
  call: ToolCallRecord,
  sources: SourceItem[],
  output: ReturnType<typeof clippedText>,
): void {
  if (sources.length) {
    view.sections.push({ kind: 'sources', title: translate('tool.sources', 'Sources'), items: sources });
  }
  if (output.text && !isEchoOutput(output.text)) {
    view.sections.push({
      kind: 'output',
      title: translate('tool.result', 'Result'),
      text: output.text,
      fullText: output.fullText,
    });
  }
  if (call.stderr) {
    const stderr = clippedText(call.stderr);
    view.sections.push({ kind: 'error', title: 'stderr', text: stderr.text, fullText: stderr.fullText });
  }
}

function appendArgumentsAndLiveDetails(
  view: ToolRunView,
  call: ToolCallRecord,
  state: ToolRunState,
  failed: boolean,
): void {
  /* Arguments always live behind the toggle: for a single-file row they
     duplicate the label, and the label is what the collapsed row shows. */
  const args = detailText(call.input).trim();
  if (args && args !== '{}') {
    view.tech.push({ kind: 'args', title: translate('tool.arguments', 'Arguments'), text: args });
  }
  if (state !== 'running' && failed && call.detail != null) {
    const detail = detailText(call.detail).trim();
    if (detail) view.tech.push({ kind: 'fact', title: translate('tool.details', 'Details'), text: detail });
  }
  if (state === 'running') {
    const preview = livePreviewOf(call);
    if (preview) view.livePreview = preview;
    const output = typeof call._liveOutput === 'string' ? call._liveOutput.trim() : '';
    if (output) view.liveOutput = output;
  }
}

export function toolRunView(call: ToolCallRecord): ToolRunView {
  const state = toolRunStateOf(call);
  const label = toolRunLabel(call, state);
  const meta = label.meta ? label.meta.slice() : [];
  const seconds = state === 'running' ? '' : formatSeconds(durationOf(call));
  if (seconds) meta.push(seconds);

  const view: ToolRunView = {
    id: call.id,
    name: call.name,
    category: toolCategory(call.name),
    state,
    label: label.text,
    mono: !!label.mono,
    meta,
    sections: [],
    tech: [],
  };

  const sources = normalizeSources(call.results);
  const output = clippedText(call.output);
  const failed = state === 'error';
  if (failed) appendFailedDetails(view, call, output.text);
  else if (state !== 'running') appendSettledDetails(view, call, sources, output);

  appendArgumentsAndLiveDetails(view, call, state, failed);
  const approval = approvalViewOf(call);
  if (approval) view.approval = approval;
  if (Array.isArray(call.steps) && call.steps.length) {
    view.agentRun = {
      runId: call.runId ?? null,
      steps: call.steps,
      plan: call.plan ?? null,
      durationMs: (call._run && call._run.durationMs) || call.durationMs || null,
    };
  }
  const summary = fileSummaryOf([call]);
  if (summary) view.fileSummary = summary;
  return view;
}

/**
 * The approval prompt, projected from the data `chat/toolRuntime.ts` records on
 * `call.approval`. Previously this was built only as DOM by `renderApproval`,
 * which meant a decision card vanished whenever the row it hung from was
 * re-rendered. `approval.ui` is the runtime's own status line ("Saving your
 * decision…") written while the POST is in flight.
 */
export function approvalViewOf(call: ToolCallRecord): ApprovalView | null {
  const approval = call.approval;
  if (!approval || !approval.approvalId || !approval.runId) return null;
  const kind = String(approval.kind || '');
  const title = kind === 'commandExecution'
    ? translate('tool.codexCommandApproval', 'The agent wants to run a command')
    : kind === 'fileChange'
      ? translate('tool.codexFileApproval', 'The agent wants to change files')
      : translate('tool.codexApproval', 'The agent needs your approval');
  const facts: Array<{ label: string; value: string }> = [];
  const action = approval.command || approval.changes || kind;
  if (action) facts.push({ label: translate('tool.action', 'Action'), value: String(action) });
  if (approval.reason) facts.push({ label: translate('tool.reason', 'Reason'), value: String(approval.reason) });
  facts.push({
    label: translate('tool.path', 'Workspace'),
    value: String(approval.cwd || '[workspace]'),
  });
  const status = String(approval.status || 'pending');
  const decided = status !== 'pending';
  return {
    approvalId: String(approval.approvalId),
    runId: String(approval.runId),
    title,
    facts,
    status: approval.ui && approval.ui.text
      ? approval.ui.text
      : decided
        ? status === 'decline'
          ? translate('tool.approvalDeclined', 'Declined')
          : translate('tool.approvalAccepted', 'Approved')
        : translate('tool.awaitingApproval', 'Waiting for your decision'),
    state: (approval.ui && approval.ui.state) || status,
    disabled: approval.ui && typeof approval.ui.disabled === 'boolean'
      ? approval.ui.disabled
      : decided,
  };
}

/** Commands and code are the two things worth watching while they stream in. */
function livePreviewOf(call: ToolCallRecord): string {
  const streamed = typeof call.argumentsText === 'string' ? call.argumentsText : '';
  const category = toolCategory(call.name);
  if (call.name === 'Bash') {
    const cmd = commandOf(call.input);
    if (cmd) return cmd;
  }
  if (category === 'code' || call.name === 'Bash') {
    if (!streamed.trim()) return '';
    return extractCodePreview(streamed);
  }
  return '';
}

/**
 * Arguments arrive as a cumulative JSON fragment (`{"code":"import os\npri`),
 * so parse what we can and fall back to the raw tail. Never show a lone brace.
 */
export function extractCodePreview(argsJson: string): string {
  const raw = String(argsJson || '');
  if (!raw.trim()) return '';
  for (const candidate of [raw, raw + '"}', raw + '}', raw + '"}']) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const code = parsed && (parsed.code ?? parsed.script ?? parsed.source);
      if (typeof code === 'string' && code.trim()) return code;
    } catch (_) { /* keep trying */ }
  }
  const stripped = raw.replace(/^\s*\{?\s*"[a-z_]+?"\s*:\s*"?/i, '');
  return stripped.length >= 3 ? stripped : '';
}

export function filePathSummaries(calls: ToolCallRecord[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    if (toolCategory(call.name) !== 'write' && call.name !== 'Read') continue;
    const path = filePathOf(call.input);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/** The "Edited N files" card: only for a genuine multi-file write run. */
export function fileSummaryOf(calls: ToolCallRecord[]): { count: number; paths: string[] } | null {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    if (call.name !== 'Write' && call.name !== 'Edit') continue;
    const path = filePathOf(call.input);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(basename(path) || path);
  }
  if (paths.length < 2) return null;
  return { count: paths.length, paths };
}
