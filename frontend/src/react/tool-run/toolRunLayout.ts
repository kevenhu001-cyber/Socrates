import {toolCategory} from '../../render/toolCategory.js';
import {isParagraphStart, snapToolOffsetOutOfBlock, toolRowAnchorOffset} from '../../render/streaming.js';
import {summarizeToolRuns, type ToolRun} from '../../chat/toolRunState.js';
import {toolRunStateOf} from './toolRunState.ts';
import type {ToolCallRecord, ToolRunState, ThinkRange, TurnSegment} from './toolRunModel.types.ts';

/* ── turn layout ───────────────────────────────────────────────────────── */

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
