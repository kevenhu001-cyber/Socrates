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
import { reportSwallow } from '../util/reportSwallow.ts';
import type { InlineToolEntry, InlineToolGroupMember, InlineToolMessageCall, InlineToolResult } from './toolInline/types.ts';
import { doneLabel, errorLabel, groupDoneLabel, groupErrorLabel, runningLabel, translate } from './toolInline/labels.ts';
import { renderInlineDetails, renderInlineGroupDetails, truncateDetailLines } from './toolInline/details.ts';
import { toolCardView } from './toolCardView.js';
import { STROKE_ICONS, toolIcon } from './icons/toolIcons.js';

export type { InlineToolEntry, InlineToolGroupMember, InlineToolMessageCall, InlineToolResult } from './toolInline/types.ts';
export { isInlineSearchTool, toolCategory } from '../render/toolCategory.js';
export { truncateDetailLines };

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

function groupDurationMs(members: InlineToolGroupMember[]): number {
  let total = 0;
  for (const member of members) {
    const duration = member.result && member.result.durationMs;
    if (typeof duration === 'number' && duration > 0) total += duration;
  }
  return total;
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
    try { delete row.dataset.errorCode; } catch (e) { reportSwallow(e, 'toolInline.settleInlineToolGroupRow.clearErrorCode'); /* ignore */ }
  }
  const allRetryable = failed && members.every((m) => {
    if (!(m.failed || (m.result && m.result.ok === false))) return true;
    return m.result && m.result.retryable !== false;
  });
  if (failed) {
    row.dataset.retryable = allRetryable ? '1' : '0';
  } else {
    try { delete row.dataset.retryable; } catch (e) { reportSwallow(e, 'toolInline.settleInlineToolGroupRow.clearRetryable'); /* ignore */ }
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
      setTimeout(() => { try { slot.classList.remove('is-settling'); } catch (e) { reportSwallow(e, 'toolInline.swap.clearSettling'); /* ignore */ } }, 260);
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
    try { row.getAnimations().forEach(function (a) { try { a.cancel(); } catch (e) { reportSwallow(e, 'toolInline.fadeOutInlineToolRow.cancelAnimation'); /* ignore */ } }); } catch (e) { reportSwallow(e, 'toolInline.fadeOutInlineToolRow.getAnimations'); /* ignore */ }
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
    } catch (e) { reportSwallow(e, 'toolInline.fadeOutInlineToolRow.remove'); /* ignore */ }
  };
  try {
    const handler = function () {
      row.removeEventListener('transitionend', handler);
      row.removeEventListener('animationend', handler);
      remove();
    };
    row.addEventListener('transitionend', handler);
    row.addEventListener('animationend', handler);
  } catch (e) { reportSwallow(e, 'toolInline.fadeOutInlineToolRow.listeners'); /* ignore */ }
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
    try { clearTimeout(Number(row.dataset._flashTimer)); } catch (e) { reportSwallow(e, 'toolInline.flashInlineToolRow.clearTimer'); /* ignore */ }
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
    try { fadeOutInlineToolRow(child); } catch (e) { reportSwallow(e, 'toolInline.replaceLiveInlineToolRow.fadeOut'); /* ignore */ }
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
