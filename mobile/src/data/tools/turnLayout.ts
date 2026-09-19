import type { ToolCall } from '@socrates/contracts';
import type { MobileToolCall, ToolStatus } from './toolState';

/**
 * data/tools/turnLayout.ts — pure view model for one assistant turn, ported
 * from `frontend/src/react/tool-run/toolRunModel.ts` (buildTurnLayout) and
 * `frontend/src/render/streaming.ts` (offset snapping).
 *
 * The turn is `rawText` sliced at each tool call's persisted `textOffset`,
 * with consecutive calls folded into one collapsible `group` segment. The web
 * derives the same layout for live, history and shared turns; mobile renders
 * the segments from this module so a burst of tool calls reads as one row
 * group seated between the prose paragraphs it happened between.
 *
 * No React, no native APIs: everything here is unit-testable in plain Node.
 */

export type ToolRunState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

export type TurnSegment =
  | { kind: 'text'; start: number; end: number; text: string }
  | { kind: 'tool'; call: MobileToolCall }
  | {
    kind: 'group';
    /** Settled members, rendered inside the collapsed header. */
    members: MobileToolCall[];
    /** Still-in-flight members, rendered after the header — the live row
        never hides inside a collapsed aggregate. */
    running: MobileToolCall[];
    state: ToolRunState;
  };

/* ── offset snapping (port of render/streaming.ts) ─────────────────────── */

/**
 * P_tool-order-block — a tool row must never land in the middle of a fenced
 * code block or a Markdown table row. Offsets inside such a span snap FORWARD
 * to the end of the enclosing block (never backward — already-painted text
 * must not move).
 */
export function snapToolOffsetOutOfBlock(text: string, offset: number): number {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  if (off >= full.length) return off;

  const starts: number[] = [0];
  for (let i = 0; i < full.length; i += 1) {
    if (full.charCodeAt(i) === 10) starts.push(i + 1);
  }
  const ends: number[] = starts.map((s, i) => (i + 1 < starts.length ? starts[i + 1] - 1 : full.length));
  let li = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= off) li = i;
    else break;
  }
  const isFenceLine = (idx: number): boolean => {
    const t = full.slice(starts[idx], ends[idx]).trimStart();
    return t.startsWith('```') || t.startsWith('~~~');
  };

  /* Fenced code / math blocks: a fence line toggles membership. */
  let inFence = false;
  for (let i = 0; i < li; i += 1) {
    if (isFenceLine(i)) inFence = !inFence;
  }
  if (inFence && !isFenceLine(li)) {
    for (let i = li; i < starts.length; i += 1) {
      if (isFenceLine(i)) return Math.min(full.length, ends[i] + 1);
    }
    /* Fence never closed (yet): hold at the end of streamed text. */
    return full.length;
  }

  /* Table rows: a |…| line next to another table-ish line is atomic —
     hold the row until the line ends. */
  const lineText = full.slice(starts[li], ends[li]);
  if (lineText.trim().startsWith('|')) {
    const looksTable = (idx: number): boolean => {
      if (idx < 0 || idx >= starts.length) return false;
      const t = full.slice(starts[idx], ends[idx]).trim();
      return t.indexOf('|') !== -1 || /^[\s:|-]*[-:|][\s:|-]*$/.test(t);
    };
    if (looksTable(li - 1) || looksTable(li + 1)) {
      return Math.min(full.length, ends[li] + 1);
    }
  }
  return off;
}

/** Offset 0 or right after a blank line. */
export function isParagraphStart(text: string, offset: number): boolean {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  if (off <= 0) return true;
  return /(?:\r?\n){2}$/.test(full.slice(0, off));
}

export function paragraphEndAfter(text: string, offset: number): number {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  const rest = full.slice(off);
  const m = /(\r?\n){2,}/.exec(rest);
  if (m && typeof m.index === 'number') return off + m.index + m[0].length;
  return full.length;
}

/**
 * P_tool-order-paragraph — a tool row belongs to the paragraph during which
 * it fired, never in the middle of it and never before it: stay at a clean
 * paragraph start, otherwise advance to the paragraph end.
 */
export function toolRowAnchorOffset(text: string, offset: number): number {
  const full = String(text || '');
  const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
  if (isParagraphStart(full, off)) return off;
  return paragraphEndAfter(full, off);
}

/**
 * P_tool-order-strict — is the prose at `offset` a finished sentence? A tool
 * row may only mount behind a REAL ending (CJK/Latin terminator or newline);
 * colons/semicolons do not count.
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
    return /[。！？!?.]/.test(last);
  }
  const before = raw.slice(0, off).trimEnd();
  const next = raw[off] || '';
  if (/\n|\r/u.test(next)) return true;
  return /(?:[。！？!?]|\.)(?:["'”’」』）)\]}]*)$/u.test(before);
}

/** May a row mount at `offset` right now? Paragraph start or finished sentence. */
export function isRowMountableAt(rawText: string, offset: number): boolean {
  if (isParagraphStart(rawText, offset)) return true;
  return isSentenceCompleteAt(rawText, offset);
}

/* ── state ─────────────────────────────────────────────────────────────── */

/** Mobile status → the web's ToolRunState vocabulary. */
export function toolRunStateOf(call: ToolCall | MobileToolCall | null | undefined): ToolRunState {
  if (!call) return 'running';
  const status = (call as MobileToolCall).status as ToolStatus | undefined;
  if (status === 'awaiting') return 'awaiting';
  if (status === 'failed' || call.isError === true) return 'error';
  if (status === 'done') return 'done';
  if (status === 'running') return 'running';
  /* No live status (a persisted/history call): a result landed if any
     terminal field was written, mirroring web toolRunStateOf. */
  if (call.output != null) return 'done';
  if (Array.isArray(call.results) && call.results.length) return 'done';
  if (typeof call.durationMs === 'number' && call.durationMs > 0) return 'done';
  return 'running';
}

function durationOf(call: ToolCall | MobileToolCall): number {
  return typeof call.durationMs === 'number' && call.durationMs > 0 ? call.durationMs : 0;
}

/** Total wall-clock of a group, for the header's trailing meta. */
export function groupDurationMs(calls: ReadonlyArray<ToolCall | MobileToolCall>): number {
  return calls.reduce((sum, call) => sum + durationOf(call), 0);
}

/* ── turn layout ───────────────────────────────────────────────────────── */

/**
 * A tool call is only splicable when it carries an id, a name, and an offset
 * inside the text. Sessions written before textOffset existed legitimately
 * fail this filter, and the caller falls back to the legacy cards-on-top
 * rendering — the same graceful-degradation contract the web gives.
 */
export function sortableToolCalls(
  rawText: string,
  toolCalls: ReadonlyArray<ToolCall | MobileToolCall> | null | undefined,
): MobileToolCall[] {
  const raw = String(rawText || '');
  const list = Array.isArray(toolCalls) ? (toolCalls as MobileToolCall[]) : [];
  return list
    .filter((tc) => !!(tc && tc.id && tc.name
      && typeof tc.textOffset === 'number'
      && tc.textOffset >= 0
      && tc.textOffset <= raw.length))
    .slice()
    .sort((a, b) => (a.textOffset as number) - (b.textOffset as number));
}

/**
 * Build the ordered segment list for one assistant turn.
 *
 * Grouping is a *run* rule, not a category rule: consecutive tool calls with
 * nothing but whitespace between them collapse into one aggregate, and the
 * first piece of real prose breaks the run.
 *
 * `deferOpenParagraph` (live turns only) mirrors P_tool-order-defer: a tool
 * whose paragraph has not finished yet is left out of the layout entirely —
 * no row mounts until the paragraph completes, so it never visibly jumps.
 * Finalized turns pass no flag, so nothing can starve.
 */
export function buildTurnLayout(
  rawText: string,
  toolCalls: ReadonlyArray<ToolCall | MobileToolCall> | null | undefined,
  opts?: { deferOpenParagraph?: boolean },
): TurnSegment[] {
  const raw = String(rawText || '');
  const defer = opts?.deferOpenParagraph === true;
  const calls = sortableToolCalls(raw, toolCalls).filter((call) => {
    if (!defer) return true;
    /* Approvals need a human decision: never hide them behind prose. */
    if (call.approval && call.approval.approvalId) return true;
    const persistedOffset = Math.min(call.textOffset as number, raw.length);
    const visual = snapToolOffsetOutOfBlock(raw, toolRowAnchorOffset(raw, persistedOffset));
    return isRowMountableAt(raw, visual);
  });
  const segments: TurnSegment[] = [];

  const pushProse = (start: number, end: number): void => {
    const text = raw.slice(start, end);
    if (!text.trim()) return;
    segments.push({ kind: 'text', start, end, text });
  };

  let prev = 0;
  for (const call of calls) {
    const persistedOffset = Math.min(call.textOffset as number, raw.length);
    /* Paragraph-atomic placement: a mid-paragraph fire position advances past
       that paragraph's end; a clean paragraph start stays. `prev` keeps
       same-paragraph bursts in order. */
    const offset = Math.max(
      prev,
      snapToolOffsetOutOfBlock(raw, toolRowAnchorOffset(raw, persistedOffset)),
    );
    pushProse(prev, offset);
    segments.push({ kind: 'tool', call });
    prev = offset;
  }
  pushProse(prev, raw.length);

  return foldConsecutiveRuns(segments);
}

/** Merge adjacent `tool` segments into `group` segments. */
function foldConsecutiveRuns(segments: TurnSegment[]): TurnSegment[] {
  const out: TurnSegment[] = [];
  let run: MobileToolCall[] = [];

  const flush = (): void => {
    if (!run.length) return;
    const members: MobileToolCall[] = [];
    const running: MobileToolCall[] = [];
    for (const call of run) {
      if (toolRunStateOf(call) === 'running') running.push(call);
      else members.push(call);
    }
    out.push({ kind: 'group', members, running, state: groupState(members, running) });
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

function groupState(members: MobileToolCall[], running: MobileToolCall[]): ToolRunState {
  if (running.length) return 'running';
  if (members.some((m) => toolRunStateOf(m) === 'awaiting')) return 'awaiting';
  if (members.some((m) => toolRunStateOf(m) === 'error')) return 'error';
  if (members.length && members.every((m) => toolRunStateOf(m) === 'stopped')) return 'stopped';
  return 'done';
}

/** True when a group renders as a collapsed header rather than bare rows. */
export function groupShowsHeader(segment: Extract<TurnSegment, { kind: 'group' }>): boolean {
  return segment.members.length >= 2;
}
