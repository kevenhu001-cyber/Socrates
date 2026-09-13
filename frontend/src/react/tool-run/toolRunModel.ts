/**
 * react/tool-run/toolRunModel.ts — pure view model for one assistant turn.
 *
 * This is the single place that decides how a turn is laid out: the assistant's
 * rawText sliced at each persisted toolCalls[].textOffset, with consecutive
 * tool calls folded into collapsible runs. Previously the same rule existed
 * three times (imperative DOM insertion while streaming, an outerHTML bake into
 * message.html at finish, and an HTML-string re-splice on history/share
 * restore) — which is why the three views of one answer could disagree.
 *
 * No DOM, no window: everything here is unit-testable under
 * `node --experimental-strip-types --test`.
 */

import { toolCategory } from '../../render/toolCategory.js';
import { isParagraphStart, snapToolOffsetOutOfBlock, toolRowAnchorOffset } from '../../render/streaming.js';
import type { AgentPlanData, AgentStepData } from '../../ui/agentSteps.js';
import { isTerminalToolPhase, summarizeToolRuns, type ToolRun } from '../../chat/toolRunState.js';
import {
  basename,
  clip,
  commandOf,
  filePathOf,
  formatSeconds,
  queryOf,
  toolRunGroupLabel,
  toolRunLabel,
  translate,
  type ToolCallLike,
} from './labels.js';

export type ToolRunState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

export interface SourceItem {
  title: string;
  url: string;
  host: string;
}

/** A block shown when the row is expanded. */
export type DetailSection =
  | { kind: 'sources'; title: string; items: SourceItem[] }
  | { kind: 'output'; title: string; text: string }
  | { kind: 'error'; title: string; text: string }
  | { kind: 'files'; title: string; paths: string[] };

/** A block behind the secondary "Technical details" toggle. */
export type TechSection =
  | { kind: 'args'; title: string; text: string }
  | { kind: 'fact'; title: string; text: string; retryable?: '1' | '0' };

export interface ToolRunView {
  id: string;
  name: string;
  category: string;
  state: ToolRunState;
  label: string;
  mono: boolean;
  /** Trailing dim facts: result counts, test summary, duration. */
  meta: string[];
  sections: DetailSection[];
  tech: TechSection[];
  /** Present when the row is retryable — drives the Retry button. */
  retry?: { toolId: string; tool: string; query: string; errorCode: string | null };
  /** Streaming argument text shown inline while running (never in a <details>). */
  livePreview?: string;
  /**
   * Partial stdout/stderr while the call runs. The legacy card had this
   * (`.agent-tool-stream`) but the compact row never showed it, so a long
   * sandbox run looked frozen.
   */
  liveOutput?: string;
  /** Set when the call is blocked on a user decision (legacy approvals). */
  approval?: ApprovalView;
  /** Agent-run step log, rendered by ui/agentSteps into a host. */
  agentRun?: {
    runId: string | null;
    steps: AgentStepData[];
    plan: AgentPlanData | null;
    /** Final wall-clock, when the run reported one. */
    durationMs: number | null;
  };
  /** Distinct file paths touched, for the "Edited N files" summary card. */
  fileSummary?: { count: number; paths: string[] };
}

export type TurnSegment =
  | { kind: 'text'; start: number; end: number; text: string }
  | { kind: 'think'; start: number; end: number; text: string }
  | { kind: 'tool'; call: ToolCallRecord }
  | {
    kind: 'group';
    category: string;
    /** Settled members, rendered inside the collapsed header. */
    members: ToolCallRecord[];
    /** Still-in-flight members, rendered after the header — the live line
        never hides inside a collapsed aggregate. */
    running: ToolCallRecord[];
    state: ToolRunState;
  };

/** The persisted + live shape of a message.toolCalls[] entry. */
export interface ToolCallRecord extends ToolCallLike {
  id: string;
  name: string;
  textOffset?: number;
  results?: unknown[];
  artifacts?: ReadonlyArray<{ id: string; name?: string; mimeType?: string }>;
  stderr?: string;
  error?: string | null;
  userMessage?: string;
  detail?: unknown;
  errorCode?: string | null;
  retryable?: boolean;
  visualization?: Record<string, unknown> | null;
  _run?: { phase?: string; durationMs?: number; startedAt?: number; endedAt?: number };
  _cancelled?: boolean;
  _liveOutput?: string;
  approval?: {
    runId?: string;
    approvalId?: string;
    kind?: string;
    command?: string;
    changes?: string;
    reason?: string;
    cwd?: string;
    status?: string;
    ui?: { text: string; state?: string; disabled?: boolean };
  };
  steps?: AgentStepData[];
  plan?: AgentPlanData | null;
  runId?: string;
}

/** The approval prompt as the row needs it: copy plus the decision list. */
export interface ApprovalView {
  approvalId: string;
  runId: string;
  title: string;
  facts: Array<{ label: string; value: string }>;
  status: string;
  /** 'pending' until a decision is sent; then 'accepted' / 'declined' / 'stopped'. */
  state: string;
  disabled: boolean;
}

/* ── state ─────────────────────────────────────────────────────────────── */

const APPROVAL_STATUSES = new Set(['awaiting', 'awaiting_approval', 'pending_approval']);
const CANCELLED_STATUSES = new Set(['stopped', 'cancelled', 'aborted']);
const FAILED_STATUSES = new Set(['failed', 'timed_out', 'timeout', 'error']);

/** True while a recorded approval is still asking (a decided one is history). */
function isAwaitingDecision(call: ToolCallRecord): boolean {
  const approval = call.approval;
  if (!approval || !approval.approvalId || !approval.runId) return false;
  const status = String(approval.status || 'pending');
  return status === 'pending';
}

/**
 * Collapse the two representations of a run's progress into one: the live
 * `_run.phase` written by chat/toolRuntime.ts while streaming, and the
 * persisted terminal flags (isError / status / output) present in history.
 *
 * A call with no terminal marker at all is still in flight. That is the whole
 * reason the declarative path can render a live stream from the same model as
 * a restored turn: toolRuntime only has to keep writing _run.
 */
export function toolRunStateOf(call: ToolCallRecord | null | undefined): ToolRunState {
  if (!call) return 'running';
  const phase = call._run && call._run.phase ? String(call._run.phase) : '';
  const status = String(call.status || '');
  if (phase === 'cancelled' || CANCELLED_STATUSES.has(status)) return 'stopped';
  if (APPROVAL_STATUSES.has(status) || status === 'awaiting_approval') return 'awaiting';
  /* The blocked-ness lives on `call.approval`, not on the run: the runtime
     records the prompt there and leaves the run in flight. A collapsed row that
     reads "Working…" while the run waits on the reader is the whole prompt
     going unnoticed, so a pending decision wins over the phase. */
  if (isAwaitingDecision(call)) return 'awaiting';
  if (phase === 'failed' || phase === 'timed_out' || call.isError === true || FAILED_STATUSES.has(status)) {
    return 'error';
  }
  if (phase === 'succeeded') return 'done';
  if (phase && !isTerminalToolPhase(phase)) return 'running';
  /* No live run record (history / share): a result landed if the backend
     wrote any terminal field. isError/status were checked above, so anything
     reaching here without them never resolved. */
  if (!phase) {
    if (status === 'completed' || status === 'done') return 'done';
    /* A persisted call that came back with a payload but no terminal flag —
       sessions saved before tool_status carried durations — is finished, not
       still running. Showing a spinner on a five-year-old turn is a lie. */
    if (call.output != null) return 'done';
    if (Array.isArray(call.results) && call.results.length) return 'done';
    if (typeof call.durationMs === 'number' && call.durationMs > 0) return 'done';
    return 'running';
  }
  return 'done';
}

function durationOf(call: ToolCallRecord): number {
  if (call._run && typeof call._run.durationMs === 'number' && call._run.durationMs > 0) {
    return call._run.durationMs;
  }
  return typeof call.durationMs === 'number' && call.durationMs > 0 ? call.durationMs : 0;
}

/**
 * Wall-clock start of an in-flight run, or 0 when the call carries none
 * (history, shared turns, or a tool that never reported progress). The live
 * rows use this to tick an elapsed counter; settled rows show durationMs.
 */
export function runStartedAt(call: ToolCallRecord | null | undefined): number {
  const started = call && call._run && typeof call._run.startedAt === 'number'
    ? call._run.startedAt
    : 0;
  return started > 0 ? started : 0;
}

/* ── turn layout ───────────────────────────────────────────────────────── */

export interface ThinkRange {
  start: number;
  end: number;
  text: string;
}

/** All think-tag spans in rawText, in order. An unterminated opener runs to EOF. */
export function findThinkRanges(rawText: string): ThinkRange[] {
  const text = String(rawText || '');
  const out: ThinkRange[] = [];
  if (!text.includes('<')) return out;
  const OPEN = '<think>';
  const re = new RegExp(OPEN + '([\\s\\S]*?)(?:<\\/think>|$)', 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[1] || '' });
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

/**
 * A tool call is only splicable when it carries an id, a name, and an offset
 * inside the text. Sessions written before textOffset existed (and truncated
 * saves) legitimately fail this filter, and the caller then renders prose
 * only — the same graceful-degradation contract the stored-html path gives.
 */
export function sortableToolCalls(
  rawText: string,
  toolCalls: ReadonlyArray<ToolCallRecord> | null | undefined,
): ToolCallRecord[] {
  const raw = String(rawText || '');
  const list = Array.isArray(toolCalls) ? (toolCalls as ToolCallRecord[]) : [];
  return list
    .filter((tc) => !!(tc && tc.id && tc.name
      && typeof tc.textOffset === 'number'
      && tc.textOffset >= 0
      && tc.textOffset <= raw.length))
    .slice()
    .sort((a, b) => (a.textOffset as number) - (b.textOffset as number));
}

/**
 * P_tool-order-mount — may a row mount at `offset` right now? A paragraph
 * start is always safe (the block before it is finished — this also covers
 * headings and other unterminated blocks that no sentence test accepts).
 * Otherwise the row must sit behind a real sentence ending (CJK/Latin
 * terminators, or a newline); colons/semicolons do NOT count. The EOF
 * branch mirrors the same lookahead: a trailing '.' counts, "3.14" can't.
 */
export function isRowMountableAt(rawText: string, offset: number): boolean {
  if (isParagraphStart(rawText, offset)) return true;
  return isSentenceCompleteAt(rawText, offset);
}

/**
 * P_tool-order-strict — is the prose at `offset` a finished sentence?
 * A tool row may only mount behind a REAL ending (CJK/Latin terminator
 * or newline). Colons/semicolons do not count: "原因有三：" promises a
 * continuation, and a row parked there reads as an interruption.
 */
export function isSentenceCompleteAt(rawText: string, offset: number): boolean {
  const raw = String(rawText || '');
  const off = Math.max(0, Math.min(raw.length, Math.floor(Number(offset) || 0)));
  if (off <= 0) return true;
  if (off >= raw.length) {
    const tail = raw.trimEnd();
    if (!tail) return true;
    const last = tail.charAt(tail.length - 1);
    if (last === '\n' || last === '\r') return true;
    /* Trailing '.' counts (mirrors the write path's (?=\s|$) lookahead);
       a decimal like "3.14" never ends with '.', so this cannot misfire. */
    return /[。！？!?.]/.test(last);
  }
  const before = raw.slice(0, off).trimEnd();
  const next = raw[off] || '';
  if (/\n|\r/u.test(next)) return true;
  return /(?:[。！？!?]|\.)(?:["'”’」』）)\]}]*)$/u.test(before);
}

/**
 * Build the ordered segment list for one assistant turn.
 *
 * Grouping is a *run* rule, not a category rule: consecutive tool calls with
 * nothing but whitespace between them collapse into one aggregate, and the
 * first piece of real prose breaks the run. That matches how the model
 * actually works — a burst of reads/writes before it has anything to say —
 * while keeping a tool row behind the paragraph that introduced it.
 *
 * `inlineThink` keeps `<think>…</think>` inside the text segments instead of
 * cutting them out. A live turn wants that: the streaming renderer turns an
 * open think tag into the same collapsible "思考中" block the legacy pipeline
 * painted, and only the finalized pass strips scratch work for good.
 *
 * P_tool-order-defer — with `deferOpenParagraph` (live turns only), a tool
 * whose paragraph has not finished yet is LEFT OUT of the layout entirely:
 * its data stays in toolCalls[] and the turn status line keeps showing
 * "running", but no row mounts until the paragraph completes. The row then
 * mounts exactly once, at its final position — it never visibly jumps and
 * never lands before the paragraph that triggered it.
 * Finalized turns pass no defer flag, so nothing can starve.
 */
export function buildTurnLayout(
  rawText: string,
  toolCalls: ReadonlyArray<ToolCallRecord> | null | undefined,
  opts?: { inlineThink?: boolean; deferOpenParagraph?: boolean },
): TurnSegment[] {
  const raw = String(rawText || '');
  const think = opts?.inlineThink ? [] : findThinkRanges(raw);
  const defer = opts?.deferOpenParagraph === true;
  const calls = sortableToolCalls(raw, toolCalls).filter((call) => {
    if (!defer) return true;
    /* Approvals need a human decision: never hide them behind prose. */
    if (call.approval && call.approval.approvalId) return true;
    /* P_tool-order-defer — mount only behind a finished paragraph. */
    const persistedOffset = Math.min(call.textOffset as number, raw.length);
    const visual = snapToolOffsetOutOfBlock(
      raw,
      toolRowAnchorOffset(raw, persistedOffset),
    );
    return isRowMountableAt(raw, visual);
  });
  const segments: TurnSegment[] = [];

  const pushProse = (start: number, end: number): void => {
    let cursor = start;
    for (const range of think) {
      if (range.end <= cursor || range.start >= end) continue;
      if (range.start > cursor) {
        appendText(segments, raw.slice(cursor, range.start), cursor, range.start);
      }
      if (range.text.trim()) {
        segments.push({ kind: 'think', start: range.start, end: range.end, text: range.text });
      }
      cursor = range.end;
    }
    if (cursor < end) appendText(segments, raw.slice(cursor, end), cursor, end);
  };

  let prev = 0;
  for (const call of calls) {
    const persistedOffset = Math.min(call.textOffset as number, raw.length);
    /* Paragraph-atomic placement (P_tool-order-paragraph): a mid-paragraph
       fire position advances past that paragraph's end; a clean paragraph
       start stays. snapToolOffsetOutOfBlock then keeps code/table spans
       atomic. `prev` keeps same-paragraph bursts in order. */
    const offset = Math.max(
      prev,
      snapToolOffsetOutOfBlock(
        raw,
        toolRowAnchorOffset(raw, persistedOffset),
      ),
    );
    pushProse(prev, offset);
    segments.push({ kind: 'tool', call });
    prev = offset;
  }
  pushProse(prev, raw.length);

  return foldConsecutiveRuns(segments);
}

function appendText(out: TurnSegment[], text: string, start: number, end: number): void {
  if (!text.trim()) return;
  out.push({ kind: 'text', start, end, text });
}

/** Merge adjacent `tool` segments into `group` segments. */
function foldConsecutiveRuns(segments: TurnSegment[]): TurnSegment[] {
  const out: TurnSegment[] = [];
  let run: ToolCallRecord[] = [];

  const flush = (): void => {
    if (!run.length) return;
    const members: ToolCallRecord[] = [];
    const running: ToolCallRecord[] = [];
    for (const call of run) {
      if (toolRunStateOf(call) === 'running') running.push(call);
      else members.push(call);
    }
    const settled = new Set(members.map((m) => toolCategory(m.name)));
    out.push({
      kind: 'group',
      category: settled.size === 1 ? Array.from(settled)[0] : 'mixed',
      members,
      running,
      state: groupState(members, running),
    });
    run = [];
  };

  for (const segment of segments) {
    if (segment.kind === 'tool') run.push(segment.call);
    else {
      flush();
      out.push(segment);
    }
  }
  flush();
  return out;
}

/** True when a group renders as a collapsed header rather than bare rows. */
export function groupShowsHeader(segment: Extract<TurnSegment, { kind: 'group' }>): boolean {
  return segment.members.length >= 2;
}

/**
 * Every call in a group whose non-text outputs (charts, saved files) must stay
 * visible even when the group is collapsed. Tool STATUS may hide behind the
 * aggregate toggle; tool OUTPUT never does. Row order and output order come
 * from this one list so the two can never disagree.
 */
export function groupOutputCalls(
  segment: Extract<TurnSegment, { kind: 'group' }>,
): ToolCallRecord[] {
  return segment.members.concat(segment.running);
}

/* Sorted-key serialization: the same spec can arrive as two distinct objects
 * (the streamed arguments and the normalized result), and key order is not
 * guaranteed to match, so JSON.stringify alone would report a change. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort()
      .map((key) => JSON.stringify(key) + ':' + stableStringify(record[key]))
      .join(',') + '}';
  }
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

/**
 * A content-stable identity for a visualization spec.
 *
 * `ToolRunAttachments` keys its mount effect on this instead of the spec
 * object: the live runtime replaces `call.input` with the normalized result
 * spec when the tool finishes, so an identity-based dependency remounted a
 * byte-identical chart on every settle. Content equality keeps one mount per
 * output while still remounting when the spec really changes.
 */
export function visualizationSpecKey(spec: unknown): string {
  if (!spec || typeof spec !== 'object') return '';
  try {
    return stableStringify(spec);
  } catch (_) {
    return '';
  }
}

function groupState(
  members: ToolCallRecord[],
  running: ToolCallRecord[],
): ToolRunState {
  if (running.length) return 'running';
  const runs: ToolRun[] = members.map((m) => ({
    id: m.id,
    tool: m.name,
    phase: memberPhase(m),
    startedAt: 0,
  }));
  const summary = summarizeToolRuns(runs);
  if (summary.failed > 0 || summary.timed_out > 0) return 'error';
  if (summary.cancelled > 0 && summary.succeeded === 0) return 'stopped';
  return 'done';
}

function memberPhase(call: ToolCallRecord): string {
  const state = toolRunStateOf(call);
  if (state === 'error') return 'failed';
  if (state === 'stopped') return 'cancelled';
  if (state === 'running') return 'running';
  return 'succeeded';
}

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

/** Flattened, bounded text for a detail block. */
export function detailText(value: unknown): string {
  if (value == null || value === '') return '';
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try { text = JSON.stringify(value, null, 2); } catch (_) { text = String(value); }
  }
  if (text.length <= DETAIL_LIMIT) return text;
  const { lines, omittedLines } = truncateLines(text);
  if (omittedLines <= 0) return text;
  return [...lines, `… +${omittedLines} lines`].join('\n');
}

export function normalizeSources(results: ReadonlyArray<unknown> | null | undefined): SourceItem[] {
  const list = Array.isArray(results) ? results : [];
  const out: SourceItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < list.length && out.length < MAX_SOURCE_HOSTS; i++) {
    const item = list[i] as { title?: unknown; url?: unknown } | null;
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
    out.push({ title: clip(title, 120), url: /^https?:\/\//i.test(url) ? url : '', host });
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

export function toolRunView(call: ToolCallRecord): ToolRunView {
  const state = toolRunStateOf(call);
  const label = toolRunLabel(call, state);
  const category = toolCategory(call.name);
  const meta = label.meta ? label.meta.slice() : [];
  const seconds = state === 'running' ? '' : formatSeconds(durationOf(call));
  if (seconds) meta.push(seconds);

  const view: ToolRunView = {
    id: call.id,
    name: call.name,
    category,
    state,
    label: label.text,
    mono: !!label.mono,
    meta,
    sections: [],
    tech: [],
  };

  const sources = normalizeSources(call.results);
  const output = detailText(call.output).trim();
  const failed = state === 'error';

  if (failed) {
    const errorMessage = [call.userMessage, call.error].filter(Boolean).join('\n');
    const errorText = errorMessage || output || detailText(call.detail).trim();
    if (errorText) {
      view.sections.push({ kind: 'error', title: translate('tool.errorDetails', 'Error details'), text: errorText });
    }
    if (call.stderr) {
      view.sections.push({ kind: 'error', title: 'stderr', text: detailText(call.stderr) });
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
  } else if (state !== 'running') {
    if (sources.length) {
      view.sections.push({ kind: 'sources', title: translate('tool.sources', 'Sources'), items: sources });
    }
    if (output && !isEchoOutput(output)) {
      view.sections.push({ kind: 'output', title: translate('tool.result', 'Result'), text: output });
    }
    if (call.stderr) {
      view.sections.push({ kind: 'error', title: 'stderr', text: detailText(call.stderr) });
    }
  }

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

function filePathSummaries(calls: ToolCallRecord[]): string[] {
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
function fileSummaryOf(calls: ToolCallRecord[]): { count: number; paths: string[] } | null {
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

/* ── group view ────────────────────────────────────────────────────────── */

export interface ToolRunGroupView extends ToolRunView {
  headerLabel: string;
  members: ToolRunView[];
  running: ToolRunView[];
  showsHeader: boolean;
}

export function toolRunGroupView(
  members: ToolCallRecord[],
  running: ToolCallRecord[],
  state: ToolRunState,
): ToolRunGroupView {
  const memberViews = members.map(toolRunView);
  const runningViews = running.map(toolRunView);
  const all = members.concat(running);
  const label = toolRunGroupLabel(all, state === 'awaiting' ? 'done' : state);
  const meta = label.meta ? label.meta.slice() : [];
  const totalMs = all.reduce((sum, call) => sum + durationOf(call), 0);
  const seconds = state === 'running' ? '' : formatSeconds(totalMs);
  if (seconds) meta.push(seconds);

  const sections: DetailSection[] = [];
  const sources = groupSources(members);
  /* Merging is the aggregate's job: with only one member that has sources, the
     panel would repeat that member's own expanded row verbatim one level up. */
  const contributing = members.filter((m) => normalizeSources(m.results).length > 0).length;
  if (sources.length && contributing > 1) {
    sections.push({ kind: 'sources', title: translate('tool.sources', 'Sources'), items: sources });
  }
  const paths = filePathSummaries(members);
  if (paths.length > 1) {
    sections.push({ kind: 'files', title: translate('tool.files', 'Files'), paths });
  }
  /* A collapsed group must not hide a failure. Lift every member's error
     text into the group panel, prefixed with the tool name so the reader
     can tell which of the N calls broke. */
  for (const member of memberViews) {
    for (const section of member.sections) {
      if (section.kind !== 'error') continue;
      sections.push({ kind: 'error', title: `${member.name}: ${section.title}`, text: section.text });
    }
  }

  const tech: TechSection[] = [];
  const failedMembers = members.filter((m) => toolRunStateOf(m) === 'error');
  const firstFailed = failedMembers.length ? failedMembers[0] : null;
  if (firstFailed && firstFailed.errorCode) {
    tech.push({ kind: 'fact', title: translate('tool.errorCode', 'Error code'), text: String(firstFailed.errorCode) });
  }
  if (failedMembers.length) {
    /* Aggregate hint: retryable only when every failed member is. */
    const allRetryable = failedMembers.every((m) => m.retryable !== false);
    tech.push({
      kind: 'fact',
      title: translate('tool.retryable', 'Retryable'),
      text: allRetryable
        ? translate('tool.retryableYes', 'Retryable — safe to run again')
        : translate('tool.retryableNo', 'Not retryable — change the arguments first'),
      retryable: allRetryable ? '1' : '0',
    });
  }

  const fileSummary = fileSummaryOf(all);
  const retry = memberViews.find((m) => m.retry)?.retry;

  return {
    id: members.length ? members[0].id : (running.length ? running[0].id : ''),
    name: members.length ? members[0].name : '',
    category: toolCategory(members.length ? members[0].name : ''),
    state,
    label: label.text,
    mono: !!label.mono,
    meta,
    sections,
    tech,
    headerLabel: label.text,
    members: memberViews,
    running: runningViews,
    showsHeader: members.length >= 2,
    retry,
    fileSummary: fileSummary || undefined,
  };
}

/** Convenience: full group view for a layout segment. */
export function groupViewOf(segment: Extract<TurnSegment, { kind: 'group' }>): ToolRunGroupView {
  return toolRunGroupView(segment.members, segment.running, segment.state);
}

/* ── back-compat for HTML baked before this renderer existed ────────────── */

const LEGACY_TOOL_SELECTORS = [
  'details.tool-inline',
  'section.tool-run-group',
  '.tool-run-group',
  '.agent-tool-card',
  '.tool-inline-attachments',
  '.tool-inline-live-slot',
  '.think-tools',
];

/**
 * Remove tool-row markup from a stored message.html.
 *
 * Sessions saved before the declarative renderer baked the settled rows'
 * outerHTML straight into html. The new renderer draws those rows from
 * toolCalls[], so the baked copies have to go or every old turn shows its
 * tools twice. Content written after this change carries no tool markup at
 * all, so the pass is a no-op on it — that is why it is safe to run on every
 * render rather than gating on a migration flag.
 *
 * Returns the input untouched when no DOM parser is available: a silently
 * mangled transcript is worse than a duplicated row, and only the browser
 * renders this path.
 */
export function stripLegacyToolHtml(html: string): string {
  const source = String(html || '');
  if (!source || !/tool-inline|tool-run-group|agent-tool-card|think-tools/.test(source)) return source;
  const parser = (globalThis as unknown as { DOMParser?: typeof DOMParser }).DOMParser;
  if (typeof parser !== 'function') return source;
  try {
    const doc = new parser().parseFromString(
      `<body>${source}</body>`,
      'text/html',
    );
    const body = doc.body;
    if (!body) return source;
    for (const selector of LEGACY_TOOL_SELECTORS) {
      const nodes = body.querySelectorAll(selector);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    }
    return body.innerHTML;
  } catch (_) {
    return source;
  }
}

/**
 * True when a message needs the declarative turn renderer at all.
 *
 * Only tool rows route: a turn whose sole structure is thinking keeps the
 * legacy `message.html` path, because provider scratch work is never rendered
 * in the finalized answer (renderAssistantHTML strips it) and the live
 * thinking pill owns that surface. Anything else would mean re-rendering prose
 * through a second code path for no visible gain.
 */
export function hasTurnStructure(
  rawText: string,
  toolCalls: ReadonlyArray<ToolCallRecord> | null | undefined,
): boolean {
  return sortableToolCalls(rawText, toolCalls).length > 0;
}
