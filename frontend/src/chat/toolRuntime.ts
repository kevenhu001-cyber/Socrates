/**
 * chat/toolRuntime.ts — per-message tool-call orchestration.
 *
 * Owns the stateful part of the tool lifecycle:
 *   tool_call_delta -> tool_use -> tool_progress -> tool_result
 * plus the independent code-execution EventSource. The chat message
 * controller supplies ownership and DOM callbacks; this module never
 * reaches into global chat state directly.
 */

import {
  appendInlineArtifact,
  appendToolModule,
  renderToolTextOutput,
  renderWebSearchResults,
  stopToolCardTimerForCard,
  updateToolCardCode,
} from '../ui/toolCards.js';
import {
  createInlineToolRow,
  replaceLiveInlineToolRow,
  settleInlineToolGroupRow,
  settleInlineToolRow,
  stopInlineToolRowTimer,
  toolCategory,
  updateInlineToolCodePreview,
  updateInlineToolGroupLabel,
  updateInlineToolLabel,
  updateInlineToolMeta,
} from '../ui/toolInline.js';
import {
  settleAgentRun,
  stopAgentRunTimer,
  upsertAgentPlan,
  upsertAgentStep,
} from '../ui/agentSteps.js';
import type { AgentPlanData, AgentStepData } from '../ui/agentSteps.js';
import type { InlineToolGroupMember } from '../ui/toolInline.js';
import { mountVisualization } from '../render/visualization.js';
import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  phaseFromProgress,
  summarizeToolRuns,
  transitionToolRun,
} from './toolRunState.js';
import type { ToolRun } from './toolRunState.js';
import { createLiveOutputBuffer, renderLivePreview } from './liveOutput.js';
import type { LiveOutputBufferHandle } from './liveOutput.js';
import { getSocratesWasm } from '../lib/socratesWasm.js';
import { apiFetch } from '../util/api.js';
/* Type-only: the event shape is owned by the React store, but this module is
   loaded straight from Node by test/toolRuntime.test.mjs, so the runtime
   linkage stays the `window.__socratesReactChatBridge` global (same hand-off
   `publishReactChatRuntime` in main.js and ui/thinkingPill.js use). */
import type { ChatRuntimeEvent } from '../react/types/domain';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToolCallEntry {
  id: string;
  name: string;
  input: unknown | null;
  output: string | null;
  isError: boolean;
  artifacts: Array<{ id: string; mimeType: string | null; name: string | null }>;
  executionId?: string;
  visualization?: unknown;
  results?: unknown[];
  /** Codex run id, when this call is a workspace-agent run. */
  runId?: string;
  /** Projected Codex steps, persisted so history replay can rebuild them. */
  steps?: AgentStepData[];
  /** Latest Codex plan snapshot for this run. */
  plan?: AgentPlanData | null;
  /** Character offset into the message's rawText where the inline row
      was spliced. Persisted with the message so history replay can
      rebuild the inline layout (mirrors main.js's textOffset). */
  textOffset?: number;
  /** Cumulative streamed `arguments` JSON while the call is in flight.
      The declarative row shows this as a live code/command preview —
      reading it from data is what replaces updateInlineToolCodePreview's
      write into a `<details>` nobody could open. */
  argumentsText?: string;
  /** Client-only runtime metadata — not persisted. */
  _run?: ToolRun;
  /** Id of the grouped inline row this call was merged into (live UI). */
  _groupHeadId?: string;
  _pendingDeltas?: ToolCallDelta[];
  _pendingProgress?: ToolProgress[];
  _toolResultApplied?: boolean;
  _progressPhase?: string;
  /** Bounded live-output buffer for the running stream (client-only). */
  _liveBuffer?: LiveOutputBufferHandle;
  /**
   * Flattened stdout/stderr tail while the call runs, so a declarative row can
   * show output as it arrives instead of waiting for the result. Derived from
   * `_liveBuffer` — same string, on the data instead of in a DOM node.
   */
  _liveOutput?: string;
  approval?: ToolApproval;
}

interface ToolMessage {
  toolCalls?: ToolCallEntry[];
  /** Identity the React message list keys this entry by. */
  clientId?: string;
  id?: string | number;
  /** Bumped on every tool-lifecycle mutation (see notifyToolRun). */
  _toolRunRev?: number;
  _orphanDeltas?: Record<string, ToolCallDelta[]>;
  _orphanProgress?: Record<string, ToolProgress[]>;
  _orphanApprovals?: Record<string, ToolApproval[]>;
  _orphanAgentFrames?: Record<string, Array<AgentStepFrame | AgentPlanFrame>>;
}

/** `event: agent_step` — one projected Codex step (see server projection). */
export interface AgentStepFrame extends AgentStepData {
  type: 'step';
  /** Tool call id of the workspace_agent call this step belongs to. */
  id: string;
  runId?: string;
}

/** `event: agent_plan` — the Codex todo list for the run. */
export interface AgentPlanFrame extends AgentPlanData {
  type: 'plan';
  id: string;
  runId?: string;
}

interface ToolProgress {
  id: string;
  phase: string;
  elapsedMs?: number;
  chunk?: string;
}

interface ToolApproval {
  id?: string;
  runId: string;
  approvalId: string;
  requestId?: string;
  kind?: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  changes?: unknown;
  availableDecisions?: string[];
  status?: string;
  /**
   * Feedback for the decision the reader just took, kept on the data so a
   * declarative panel can show "Saving your decision…" / "Approved" / an error
   * without owning a DOM node. The imperative panel wrote the same strings
   * straight into `.tool-inline-approval-status`.
   */
  ui?: { text: string; state?: string; disabled?: boolean };
}

interface ToolCallDelta {
  id: string;
  index: number;
  arguments?: string;
  final?: boolean;
  name?: string;
}

interface ExecutionEvent {
  id: string;
  executionId: string;
}

interface ToolResult {
  id: string;
  ok?: boolean;
  status?: string;
  output?: string;
  stderr?: string;
  error?: string;
  errorCode?: string | null;
  userMessage?: string;
  artifacts?: Array<unknown>;
  durationMs?: number;
  executionId?: string;
  name?: string;
  query?: string;
  results?: unknown[];
  visualization?: { version: number; [key: string]: unknown } | null;
  detail?: unknown;
}

interface ToolRuntimeOptions {
  body: HTMLElement;
  stillOwnsSlot?: () => boolean;
  getMessage?: () => ToolMessage | null;
  ensureToolContainer?: () => HTMLElement;
  onToolActivity?: () => void;
  onSearchRetry?: (query: string) => void;
  requestAnimationFrame?: (callback: () => void) => number;
  cancelAnimationFrame?: (id: number) => void;
  EventSource?: typeof EventSource | null;
  /**
   * Opt in to the separate /api/executions/:id/stream channel. Live chat
   * already receives execution_start, tool_progress, and tool_result on the
   * main SSE connection, so opening a second channel by default duplicates
   * progress/results and introduces a race between two terminal events.
   */
  useExecutionEventSource?: boolean;
  /**
   * 'compact' (default) — live chat path. Each tool call renders as a
   * minimal inline status row (.tool-inline) mounted in the message
   * flow at the point the tool fired; onInlineTool (supplied by the
   * stream controller) inserts the row and handles text segmentation.
   * 'detailed' — share / history replay path. Tool calls render as
   * the legacy collapsible cards so saved sessions remain inspectable.
   */
  mode?: 'compact' | 'detailed';
  /**
   * Compact mode only: mount an inline tool row into the message flow.
   * The controller freezes the current text segment, appends the row,
   * and starts a new segment for post-tool text. Falls back to
   * appending directly to `body` when absent.
   * Returns the textOffset split point (or null when unavailable) so
   * synthetic rows created from a late tool_result can persist the
   * offset directly instead of relying on finish()'s write-back loop.
   * `row` is null when the host does not create DOM for this call — a
   * declarative turn records only the split point, which is the one piece
   * of layout information React cannot derive.
   */
  onInlineTool?: (entry: { id: string; name: string }, row: HTMLElement | null) => number | null;
  /**
   * P_tool_live_card — when set, the live chat shows a single visible
   * tool card. A new tool id fades the previous card out and replaces
   * it in the same slot; same-id events update the existing row in
   * place. Persisted history and share views still serialize every
   * tool call — this is a presentation-only option.
   */
  liveSingleCardSlot?: HTMLElement | null;
  /**
   * P_tool-live-turn — true while the React message list owns this turn's
   * bubble. Rows, groups, approval panels and Codex steps are then drawn from
   * `message.toolCalls[]` by react/tool-run, so this runtime stops creating
   * DOM for them and only keeps the data current: run phase, split point
   * (`textOffset`), streamed arguments, live output tail, steps, plan,
   * approval state. Everything that finds a row through `findCard` already
   * degrades to "no row" when the answer is yes.
   */
  ownsLiveTurn?: () => boolean;
}

interface ExecutionConnection {
  key: string;
  source: EventSource;
  timer: ReturnType<typeof setTimeout>;
}

export interface ToolRuntime {
  hasActiveTools: () => boolean;
  recordToolUse: (call: {
    id?: string;
    name?: string;
    input?: unknown;
    executionId?: string;
  }) => HTMLElement | null;
  recordToolProgress: (progress: ToolProgress) => void;
  recordToolCallDelta: (delta: ToolCallDelta) => void;
  recordExecutionStart: (event: ExecutionEvent) => void;
  recordToolResult: (result: ToolResult) => void;
  recordToolApproval: (approval: ToolApproval) => void;
  /** Answer a pending approval from a declarative row. */
  decideApproval: (toolCallId: string, decision: string) => Promise<void>;
  /** `event: agent_step` — render and persist one Codex step. */
  recordAgentStep: (step: AgentStepFrame) => void;
  /** `event: agent_plan` — update the run's checklist in place. */
  recordAgentPlan: (plan: AgentPlanFrame) => void;
  /** Called when text streams after a tool row so live grouping breaks. */
  noteTextDelta: () => void;
  cancel: () => void;
  dispose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, function (char) {
    return '\\' + char.charCodeAt(0).toString(16) + ' ';
  });
}

function translate(key: string, fallback: string): string {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.t === 'function') {
      const translated = (w.t as (key: string) => string)(key);
      // The lightweight test dictionary returns the key for unknown
      // strings. Treat that as a miss so new runtime copy stays human.
      return translated && translated !== key ? translated : fallback;
    }
  } catch (_) { /* ignore */ }
  return fallback;
}

function activeToolLabel(entry: ToolCallEntry | null): string {
  const name = entry && entry.name;
  if (name === 'workspace_agent') return translate('tool.actionCodex', 'Working in the Codex workspace');
  if (name === 'web_search' || name === 'arxiv_search' || name === 'zotero_search' || name === 'notion_search_pages') {
    return translate('tool.actionSearch', 'Searching the web');
  }
  if (name === 'code_interpreter' || name === 'Code') {
    const phase = entry && entry._progressPhase;
    return phase === 'stdout' || phase === 'stderr'
      ? translate('tool.actionAnalyze', 'Analyzing data…')
      : translate('tool.actionCode', 'Executing code…');
  }
  if (name === 'render_visualization') return translate('tool.actionVisual', 'Creating a visual');
  if (name === 'Read' || name === 'Glob' || name === 'Grep' || name === 'WebFetch') return translate('tool.actionRead', 'Reading files');
  if (name === 'Write' || name === 'Edit' || name === 'Bash') return translate('tool.actionWrite', 'Updating files');
  return translate('tool.actionDefault', 'Using a tool');
}

function findEntry(message: ToolMessage | null, id: string): ToolCallEntry | null {
  if (!message || !Array.isArray(message.toolCalls)) return null;
  for (let i = 0; i < message.toolCalls.length; i++) {
    if (message.toolCalls[i].id === id) return message.toolCalls[i];
  }
  return null;
}

function normalizeArtifacts(
  artifacts: unknown,
): Array<{ id: string; mimeType: string | null; name: string | null }> {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.slice(0, 20).map(function (artifact: unknown) {
    if (typeof artifact === 'string') return { id: artifact, mimeType: null, name: null };
    const a = artifact as { id?: string; mimeType?: string; name?: string } | null;
    return {
      id: String((a && a.id) || ''),
      mimeType: (a && a.mimeType) || null,
      name: (a && a.name) || null,
    };
  }).filter(function (artifact) { return !!artifact.id; });
}

function getRun(entry: ToolCallEntry | null): ToolRun | null {
  return entry && entry._run ? entry._run : null;
}

function toolCountText(total: number): string {
  return total === 1
    ? translate('tool.metaToolCountOne', '1 tool')
    : translate('tool.metaToolCount', '{n} tools').replace('{n}', String(total));
}

function setRun(
  entry: ToolCallEntry | null,
  phase: string,
  patch?: Partial<ToolRun>,
): ToolRun | null {
  if (!entry) return null;
  const next = transitionToolRun(getRun(entry) || {
    id: entry.id,
    tool: entry.name,
    phase: TOOL_RUN_PHASES.preparing,
    startedAt: Date.now(),
  }, phase, patch);
  // Runtime metadata must not leak into the persisted `toolCalls` schema.
  if (!Object.prototype.hasOwnProperty.call(entry, '_run')) {
    Object.defineProperty(entry, '_run', { value: next, writable: true, configurable: true, enumerable: false });
  } else {
    entry._run = next;
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  createToolRuntime                                                  */
/* ------------------------------------------------------------------ */

export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  const body = options.body;
  const stillOwnsSlot = options.stillOwnsSlot || (() => true);
  const getMessage = options.getMessage || ((): ToolMessage | null => null);
  const ensureToolContainer = options.ensureToolContainer || (() => body);
  const onToolActivity = options.onToolActivity || (() => { /* no-op */ });
  const requestFrame = options.requestAnimationFrame || function (callback: () => void) {
    return requestAnimationFrame(callback);
  };
  const cancelFrame = options.cancelAnimationFrame || function (id: number) {
    cancelAnimationFrame(id);
  };
  const EventSourceImpl = options.EventSource || (typeof EventSource !== 'undefined' ? EventSource : null);
  const useExecutionEventSource = options.useExecutionEventSource === true;
  const mode = options.mode || 'compact';
  /* Default host: no segmentation control, so the row lands at the end of the
     body. A null row means the caller only wanted the split point recorded. */
  const onInlineTool = options.onInlineTool || function (_entry: { id: string; name: string }, row: HTMLElement | null): number | null {
    if (row) body.appendChild(row);
    return null;
  };
  const liveSingleCardSlot = options.liveSingleCardSlot || null;
  const ownsLiveTurn = options.ownsLiveTurn || function (): boolean { return false; };

  /* P_tool-live-group — consecutive same-category tools while no text has
     streamed in between collapse into one visible inline row. The state
     lives here (per message runtime) so merged members can route progress
     and results back to the head row without touching persisted data. */
  interface LiveGroupState {
    headId: string;
    headRow: HTMLElement;
    offset: number | null;
    textSinceHead: boolean;
    memberIds: string[];
    settled: boolean;
  }
  let liveGroup: LiveGroupState | null = null;
  let postFinishApprovalMessage: ToolMessage | null = null;
  const ownedInlineRows = new Set<HTMLElement>();
  const ownedToolCards = new Set<HTMLElement>();

  /**
   * P_tool-live-turn — declarative mount: choose the split point and put it on
   * the entry. No row is created, so grouping (which the React renderer derives
   * from adjacency in rawText) has nothing to track here either.
   */
  function recordRowOffset(entry: ToolCallEntry): number | null {
    let offset: number | null = null;
    try { offset = onInlineTool({ id: entry.id, name: entry.name }, null); } catch (_) { /* no host */ }
    if (typeof offset === 'number') entry.textOffset = offset;
    notifyToolRun(getMessage());
    return offset;
  }

  function mountInlineRow(entry: ToolCallEntry): number | null {
    if (findCard(entry.id)) return null;
    if (ownsLiveTurn()) return recordRowOffset(entry);
    const row = createInlineToolRow({
      id: entry.id,
      name: entry.name,
      input: entry.input,
    });
    ownedInlineRows.add(row);
    let offset: number | null = null;
    try { offset = onInlineTool({ id: entry.id, name: entry.name }, row); } catch (_) { body.appendChild(row); }
    const resolved = typeof offset === 'number' ? offset : null;
    /* P_tool-declarative-refresh — record the split point on the data the
       moment it is chosen. Waiting for finish()'s write-back loop meant a
       turn that never reached finish() (abort, navigation, a dropped SSE)
       persisted calls with no offset, and any renderer working from
       toolCalls[] mid-stream would not know where the row belongs. */
    if (resolved != null) entry.textOffset = resolved;
    liveGroup = {
      headId: entry.id,
      headRow: row,
      offset: resolved,
      textSinceHead: false,
      memberIds: [entry.id],
      settled: false,
    };
    notifyToolRun(getMessage());
    return resolved;
  }

  /* P_tool_live_card — when a live single-card slot is configured, mount
     only the latest row into it. Same-id events keep the existing row
     in place (in-place update path). Different ids fade the previous row
     out of the slot and swap in the new one. The row's textOffset /
     inlineToolRows entries are still accumulated normally; the slot is
     purely a presentation layer over the existing pipeline.

     P_tool-live-group — consecutive same-category tools while the slot
     row is still running collapse into one visible row: the new row is
     mounted hidden inside the slot (data-merged) and the visible row's
     label becomes a count ("Searching the web (2)…"), mirroring Codex's
     "Exploring (2)…" grouping. Each merged row still goes through
     onInlineTool, so textOffset / inlineToolRows persistence is
     unchanged; when a merged row settles it is unhidden and replaces the
     collapsed head. */
  function mountLiveSingleCardRow(entry: ToolCallEntry): number | null {
    if (findCard(entry.id)) return null;
    if (ownsLiveTurn()) return recordRowOffset(entry);
    const children = liveSingleCardSlot
      ? Array.from(liveSingleCardSlot.children || []) as HTMLElement[]
      : [];
    const existing = children.length ? children[children.length - 1] : null;
    const existingId = existing ? existing.getAttribute('data-tcid') : null;
    const existingEntry = existingId ? findEntry(activeMessage(), existingId) : null;
    const merged = !!(existing && existing.dataset.state === 'running'
      && existingEntry && sameToolCategory(existingEntry.name, entry.name));
    const row = createInlineToolRow({
      id: entry.id,
      name: entry.name,
      input: entry.input,
    });
    ownedInlineRows.add(row);
    if (merged && liveSingleCardSlot) {
      /* Merge: hidden sibling inside the slot; the visible row keeps the
         running label and gains the group count. */
      row.dataset.merged = '1';
      const count = (Number(existing.dataset.groupCount) || 1) + 1;
      try { updateInlineToolGroupLabel(existing, count); } catch (_) { /* ignore */ }
      try { liveSingleCardSlot.appendChild(row); } catch (_) { /* ignore */ }
    } else if (liveSingleCardSlot) {
      try { replaceLiveInlineToolRow(liveSingleCardSlot, row, { skipFlash: !!existing }); } catch (_) { /* ignore */ }
    }
    let offset: number | null = null;
    try { offset = onInlineTool({ id: entry.id, name: entry.name }, row); } catch (_) { body.appendChild(row); }
    if (typeof offset === 'number') entry.textOffset = offset;
    notifyToolRun(getMessage());
    return typeof offset === 'number' ? offset : null;
  }

  /* Same display category (Rust categorize_tool via WASM when loaded,
     TS fallback otherwise) — the grouping predicate for live rows. */
  function sameToolCategory(a: string, b: string): boolean {
    const w = getSocratesWasm();
    if (w) return w.categorize_tool_js(String(a || '')) === w.categorize_tool_js(String(b || ''));
    return toolCategory(String(a || '')) === toolCategory(String(b || ''));
  }

  /* P_tool-live-group — merge predicate: the previous row is still the
     live head, still running, same display category, and no text has
     streamed since the head mounted. */
  function findMergeGroup(entry: ToolCallEntry): LiveGroupState | null {
    if (!liveGroup || liveGroup.settled || liveGroup.textSinceHead) return null;
    const headRow = liveGroup.headRow;
    if (!headRow || !headRow.isConnected || headRow.dataset.state !== 'running') return null;
    const message = activeMessage();
    const headEntry = message ? findEntry(message, liveGroup.headId) : null;
    if (!headEntry || !sameToolCategory(headEntry.name, entry.name)) return null;
    return liveGroup;
  }

  function mergeIntoGroup(entry: ToolCallEntry, group: LiveGroupState): void {
    group.memberIds.push(entry.id);
    group.headRow.dataset.groupIds = group.memberIds.join(',');
    entry._groupHeadId = group.headId;
    if (group.offset != null) entry.textOffset = group.offset;
    try { updateInlineToolGroupLabel(group.headRow, group.memberIds.length); } catch (_) { /* ignore */ }
    notifyToolRun(activeMessage());
  }

  function groupMemberSummaries(headRow: HTMLElement, opts?: { forceCancel?: boolean }): InlineToolGroupMember[] | null {
    const message = activeMessage();
    if (!message) return null;
    const ids = (headRow.dataset.groupIds || '').split(',').filter(Boolean);
    if (ids.length < 2) return null;
    const entries = ids
      .map((id) => findEntry(message, id))
      .filter((entry): entry is ToolCallEntry => !!entry);
    if (entries.length < 2) return null;
    const allTerminal = entries.every((entry) => {
      if (opts && opts.forceCancel) return true;
      const run = getRun(entry);
      if (run) return isTerminalToolPhase(run.phase);
      return !!entry._toolResultApplied || entry.isError || entry.output != null;
    });
    if (!allTerminal) return null;
    return entries.map((entry) => {
      const run = getRun(entry);
      const cancelled = !!(opts && opts.forceCancel) || (!!run && run.phase === TOOL_RUN_PHASES.cancelled);
      return {
        id: entry.id,
        name: entry.name,
        input: entry.input,
        result: {
          ok: !entry.isError,
          output: entry.output || undefined,
          results: entry.results,
          error: entry.isError ? (entry.output || undefined) : undefined,
          durationMs: (run && run.durationMs) || 0,
        },
        cancelled,
        failed: entry.isError,
      };
    });
  }

  function maybeSettleGroup(headRow: HTMLElement, opts?: { forceCancel?: boolean }): void {
    if (!headRow || headRow.dataset.groupSettled === '1') return;
    const members = groupMemberSummaries(headRow, opts);
    if (!members) return;
    try {
      settleInlineToolGroupRow(headRow, members, { cancelled: !!(opts && opts.forceCancel) });
    } catch (_) { /* ignore */ }
    if (liveGroup && headRow.getAttribute('data-tcid') === liveGroup.headId) {
      liveGroup = null;
    }
    notifyToolRun(activeMessage());
  }

  function findInlineRow(id: string): HTMLElement | null {
    const el = findCard(id);
    return el && (el as HTMLElement).classList.contains('tool-inline') ? el as HTMLElement : null;
  }

  /* Anchored attachment host: a container that sits immediately after an
     inline tool row and receives the run's visual output (charts, image
     artifacts). `data-tool-anchor` lets the finish() re-assembly in
     main.js re-seat the live nodes next to the serialized row instead of
     dumping them at the bottom of the bubble. */
  function ensureRowAttachmentHost(row: HTMLElement, toolCallId: string): HTMLElement {
    const next = row.nextElementSibling as HTMLElement | null;
    if (next && next.classList.contains('tool-inline-attachments')) return next;
    const host = document.createElement('div');
    host.className = 'tool-inline-attachments';
    host.dataset.toolAnchor = toolCallId;
    row.insertAdjacentElement('afterend', host);
    return host;
  }

  let disposed = false;
  const pendingDeltas: ToolCallDelta[] = [];
  let deltaFrame: number | null = null;
  const executionConnections = new Map<string, ExecutionConnection>();

  function updateRunSummary(message: ToolMessage): void {
    if (!body || !message) return;
    const group = body.querySelector('.tool-run-group');
    if (!group) return;
    const runs: ToolRun[] = (message.toolCalls || []).map(function (entry: ToolCallEntry) {
      return getRun(entry) || { phase: entry && entry.isError ? TOOL_RUN_PHASES.failed : TOOL_RUN_PHASES.succeeded, id: entry.id, tool: entry.name, startedAt: 0 };
    });
    const summary = summarizeToolRuns(runs);
    const label = group.querySelector('.tool-run-summary-label') as HTMLElement | null;
    const meta = group.querySelector('.tool-run-summary-meta') as HTMLElement | null;
    if (!label || !meta) return;
    if (summary.active) {
      (group as HTMLElement).dataset.state = 'running';
      let activeEntry: ToolCallEntry | null = null;
      const toolCalls = message.toolCalls || [];
      for (let i = toolCalls.length - 1; i >= 0; i--) {
        const candidate = toolCalls[i];
        const run = getRun(candidate);
        if (candidate && (!run || !isTerminalToolPhase(run.phase))) { activeEntry = candidate; break; }
      }
      label.textContent = summary.active === 1
        ? activeToolLabel(activeEntry)
        : translate('tool.groupExploring', 'Exploring');
      meta.textContent = summary.total > 1
        ? translate('tool.metaActiveOfTotal', '{active} of {total} tools')
          .replace('{active}', String(summary.active)).replace('{total}', String(summary.total))
        : translate('tool.statusRunning', 'Running');
    } else if (summary.failed || summary.timed_out) {
      (group as HTMLElement).dataset.state = 'error';
      label.textContent = translate('tool.groupNeedsAttention', 'Tool needs attention');
      meta.textContent = translate('tool.metaFailedOfTotal', '{failed} of {total} failed')
        .replace('{failed}', String(summary.failed + summary.timed_out)).replace('{total}', String(summary.total));
    } else if (summary.cancelled) {
      (group as HTMLElement).dataset.state = 'cancelled';
      label.textContent = translate('tool.groupStopped', 'Tool run stopped');
      meta.textContent = toolCountText(summary.total);
    } else {
      (group as HTMLElement).dataset.state = 'complete';
      label.textContent = translate('tool.groupExplored', 'Explored');
      meta.textContent = toolCountText(summary.total);
    }
  }

  function activeMessage(): ToolMessage | null {
    if (disposed) return null;
    if (postFinishApprovalMessage) {
      const current = getMessage() || null;
      return current === postFinishApprovalMessage ? current : null;
    }
    if (!stillOwnsSlot()) return null;
    return getMessage() || null;
  }

  /* P_tool-declarative-refresh — the declarative renderer draws rows from
     message.toolCalls, and this runtime MUTATES that array in place: neither
     the message object nor the array ever changes identity, so React cannot
     notice a phase change by reference alone. Bump a revision the memoized
     row compares, then publish. The store coalesces these to one repaint per
     animation frame, so progress bursts cost no extra renders. */
  function notifyToolRun(message: ToolMessage | null): void {
    if (!message) return;
    message._toolRunRev = (message._toolRunRev || 0) + 1;
    const messageId = String(message.clientId || message.id || '');
    if (!messageId) return;
    const event: ChatRuntimeEvent = { type: 'tool-run-updated', messageId };
    try {
      const bridge = (typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>).__socratesReactChatBridge
        : null) as { publish?: (e: ChatRuntimeEvent) => void } | null;
      if (bridge && typeof bridge.publish === 'function') bridge.publish(event);
    } catch (_) { /* a listener throwing must not break the stream */ }
  }

  function hasActiveTools(): boolean {
    const message = activeMessage();
    const calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
    return calls.some(function (entry: ToolCallEntry) {
      const run = getRun(entry);
      if (run) return !isTerminalToolPhase(run.phase);
      return !entry._toolResultApplied && entry.output == null && !entry.isError;
    });
  }

  function findCard(id: string): Element | null {
    if (!body || !id) return null;
    const hit = body.querySelector('[data-tcid="' + cssEscape(id) + '"]');
    /* A declarative row carries the same data-tcid (the stylesheet and the
       e2e specs both key off it) but belongs to React: writing into it would
       be undone on the next render, and reading its state would drift from
       the data. Treat it as "no row" so every caller takes its no-row path. */
    if (hit && (hit as HTMLElement).dataset && (hit as HTMLElement).dataset.reactOwned === '1') {
      return null;
    }
    return hit;
  }

  function approvalSummary(approval: ToolApproval): string {
    if (approval.kind === 'commandExecution') return translate('tool.codexCommandApproval', 'Codex wants to run a command');
    if (approval.kind === 'fileChange') return translate('tool.codexFileApproval', 'Codex wants to change files');
    return translate('tool.codexApproval', 'Codex needs your approval');
  }

  function appendApprovalFact(panel: HTMLElement, label: string, value: unknown): void {
    if (value == null || value === '') return;
    const fact = document.createElement('div');
    fact.className = 'tool-inline-approval-fact';
    const key = document.createElement('span');
    key.className = 'tool-inline-approval-fact-label';
    key.textContent = label;
    const text = document.createElement('code');
    text.className = 'tool-inline-approval-fact-value';
    text.textContent = typeof value === 'string' ? value : JSON.stringify(value);
    fact.appendChild(key);
    fact.appendChild(text);
    panel.appendChild(fact);
  }

  function approvalPanels(approvalId: string): HTMLElement[] {
    if (!approvalId || typeof document === 'undefined' || !document.querySelectorAll) return [];
    return Array.from(document.querySelectorAll('.tool-inline-approval')).filter((panel) => (
      (panel as HTMLElement).dataset.approvalId === String(approvalId)
    )) as HTMLElement[];
  }

  function setApprovalUi(approvalId: string, text: string, state?: string, disabled = true): void {
    /* Record the transition on the entry first: a declarative row paints its
       status line from `approval.ui`, and the DOM panels below may be none. */
    const message = activeMessage();
    const calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
    for (const entry of calls) {
      if (!entry || !entry.approval || String(entry.approval.approvalId) !== String(approvalId)) continue;
      entry.approval = { ...entry.approval, ui: { text, state, disabled } };
    }
    if (message) notifyToolRun(message);
    approvalPanels(approvalId).forEach((panel) => {
      if (state) panel.dataset.state = state;
      const status = panel.querySelector('.tool-inline-approval-status') as HTMLElement | null;
      if (status) status.textContent = text;
      panel.querySelectorAll('button[data-approval-action]').forEach((button) => {
        (button as HTMLButtonElement).disabled = disabled;
      });
    });
  }

  async function submitApprovalAction(
    approval: ToolApproval,
    entryId: string,
    decision: string,
  ): Promise<void> {
    if (!approval || !approval.runId || !approval.approvalId) return;
    setApprovalUi(approval.approvalId, translate('tool.sendingApproval', 'Saving your decision…'));
    try {
      if (decision === 'stop') {
        await apiFetch('/api/agent-runs/' + encodeURIComponent(approval.runId) + '/interrupt', { method: 'POST', body: {} });
        setApprovalUi(approval.approvalId, translate('tool.runStopped', 'Stop requested'), 'stopped');
        return;
      }
      await apiFetch('/api/agent-runs/' + encodeURIComponent(approval.runId) + '/approvals/' + encodeURIComponent(approval.approvalId), {
        method: 'POST',
        body: { decision },
      });
      setApprovalUi(
        approval.approvalId,
        decision === 'decline'
          ? translate('tool.approvalDeclined', 'Declined')
          : translate('tool.approvalAccepted', 'Approved'),
        decision === 'decline' ? 'declined' : 'accepted',
      );
      const message = activeMessage();
      const entry = findEntry(message, entryId);
      if (entry) entry.approval = { ...entry.approval, ...approval, status: decision };
      notifyToolRun(message);
      if (decision !== 'decline') {
        const startedAt = Date.now();
        const poll = async (): Promise<void> => {
          if (Date.now() - startedAt > 120_000) return;
          try {
            const response = await apiFetch('/api/agent-runs/' + encodeURIComponent(approval.runId));
            const run = response && response.run;
            if (run && ['completed', 'failed', 'interrupted', 'disconnected'].includes(String(run.status))) {
              recordToolResult({
                id: entryId,
                name: entry ? entry.name : 'workspace_agent',
                ok: run.status === 'completed',
                status: run.status,
                output: run.summary || '',
                error: run.error || null,
                artifacts: response.artifacts || [],
              });
              return;
            }
          } catch (_) { /* a refresh/reconnect can retry on the next tick */ }
          window.setTimeout(() => { void poll(); }, 900);
        };
        window.setTimeout(() => { void poll(); }, 900);
      }
    } catch (err) {
      setApprovalUi(
        approval.approvalId,
        (err as Error).message || translate('tool.approvalFailed', 'Could not save the decision. Try again.'),
        undefined,
        false,
      );
      throw err;
    }
  }

  /**
   * Answer a pending approval for one tool call. Exposed for the declarative
   * row, whose buttons are React elements with their own handlers; the legacy
   * path reaches the same `submitApprovalAction` through a delegated click
   * listener. Rejects with the transport error after recording it in
   * `approval.ui`, so the caller can restore focus.
   */
  async function decideApproval(toolCallId: string, decision: string): Promise<void> {
    const message = activeMessage();
    const entry = findEntry(message, String(toolCallId || ''));
    if (!entry || !entry.approval || !decision) return;
    await submitApprovalAction(entry.approval, entry.id, decision);
  }

  function renderApproval(approval: ToolApproval): void {
    const message = activeMessage();
    if (!message || !approval || !approval.runId || !approval.approvalId) return;
    let entry = findEntry(message, String(approval.id || ''));
    if (!entry) {
      /* The normal path carries the tool call id in `id`; keep a small
       * fallback scan for harnesses that only provide runId/requestId. */
      const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
      entry = calls.find((candidate) => candidate.approval && candidate.approval.runId === approval.runId) || null;
    }
    if (!entry) return;
    entry.approval = { ...approval, status: approval.status || 'pending' };
    notifyToolRun(message);
    /* A declarative row renders the prompt from `entry.approval`
       (react/tool-run/ToolRunApproval), so there is nothing to mount — and
       queueing it as an orphan would only grow, since nothing drains it. */
    if (ownsLiveTurn()) return;
    let card = findCard(entry.id) as HTMLElement | null;
    if (!card && entry._groupHeadId) card = findCard(entry._groupHeadId) as HTMLElement | null;
    if (!card) {
      if (!message._orphanApprovals) message._orphanApprovals = {};
      const key = entry.id;
      message._orphanApprovals[key] = message._orphanApprovals[key] || [];
      message._orphanApprovals[key].push(approval);
      return;
    }
    const selector = '[data-approval-id="' + cssEscape(String(approval.approvalId)) + '"]';
    let panel = card.querySelector(selector) as HTMLElement | null;
    if (panel) return;
    panel = document.createElement('div');
    panel.className = 'tool-inline-approval';
    panel.dataset.approvalId = String(approval.approvalId);
    panel.dataset.runId = String(approval.runId);
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'polite');

    const heading = document.createElement('div');
    heading.className = 'tool-inline-approval-heading';
    const dot = document.createElement('span');
    dot.className = 'tool-inline-approval-dot';
    dot.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = approvalSummary(approval);
    heading.appendChild(dot);
    heading.appendChild(title);
    panel.appendChild(heading);
    const copy = document.createElement('p');
    copy.className = 'tool-inline-approval-copy';
    copy.textContent = translate('tool.codexApprovalCopy', 'Review the action before it continues.');
    panel.appendChild(copy);
    appendApprovalFact(panel, translate('tool.action', 'Action'), approval.command || approval.changes || approval.kind);
    appendApprovalFact(panel, translate('tool.reason', 'Reason'), approval.reason);
    appendApprovalFact(panel, translate('tool.path', 'Workspace'), approval.cwd || '[workspace]');

    const status = document.createElement('div');
    status.className = 'tool-inline-approval-status';
    status.textContent = translate('tool.awaitingApproval', 'Waiting for your decision');
    panel.appendChild(status);
    const actions = document.createElement('div');
    actions.className = 'tool-inline-approval-actions';
    const actionSpecs = [
      { decision: 'accept', label: translate('tool.approveOnce', 'Allow once'), primary: true },
      { decision: 'acceptForSession', label: translate('tool.approveRun', 'Allow this run'), primary: false },
      { decision: 'decline', label: translate('tool.decline', 'Decline'), primary: false },
      { decision: 'stop', label: translate('tool.stopRun', 'Stop run'), primary: false },
    ];
    const buttons: HTMLButtonElement[] = [];
    const runAction = async (decision: string, button: HTMLButtonElement) => {
      try {
        await submitApprovalAction(approval, entry!.id, decision);
      } catch {
        button.focus();
      }
    };
    actionSpecs.forEach((spec) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool-inline-approval-action' + (spec.primary ? ' primary' : '');
      button.dataset.approvalAction = spec.decision;
      button.textContent = spec.label;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void runAction(spec.decision, button);
      });
      buttons.push(button);
      actions.appendChild(button);
    });
    panel.appendChild(actions);
    /* Approval must remain visible even though the surrounding tool row is a
     * <details>. Open the row and place the card after the summary so it
     * stays in the normal message flow on desktop and mobile. */
    if (card.tagName.toLowerCase() === 'details') (card as HTMLDetailsElement).open = true;
    card.appendChild(panel);
  }

  /* P_approval-delegation — finish() serializes inline rows with outerHTML,
   * which intentionally drops listeners attached directly to approval
   * buttons. Keep one listener on the stable message body so approvals stay
   * actionable after the stream hands off to the persisted HTML. */
  const approvalDelegatedClick = (event: Event): void => {
    const target = event.target as Element | null;
    const button = target && target.closest
      ? target.closest('button[data-approval-action]') as HTMLButtonElement | null
      : null;
    if (!button) return;
    const panel = button.closest('.tool-inline-approval') as HTMLElement | null;
    const row = button.closest('[data-tcid]') as HTMLElement | null;
    const message = activeMessage();
    const entry = row && message ? findEntry(message, row.dataset.tcid || '') : null;
    if (!panel || !entry || !entry.approval) return;
    event.preventDefault();
    event.stopPropagation();
    void submitApprovalAction(entry.approval, entry.id, button.dataset.approvalAction || '').catch(() => { /* UI already shows the error */ });
  };
  if (body && typeof body.addEventListener === 'function') {
    body.addEventListener('click', approvalDelegatedClick);
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', approvalDelegatedClick);
  }

  function renderProgress(progress: ToolProgress, skipQueuedDrain?: boolean): void {
    const message = activeMessage();
    if (!message || !progress || !progress.id) return;
    const entry = findEntry(message, progress.id);
    if (!entry) {
      if (!message._orphanProgress || typeof message._orphanProgress !== 'object' || Array.isArray(message._orphanProgress)) {
        message._orphanProgress = {};
      }
      if (!message._orphanProgress[progress.id]) message._orphanProgress[progress.id] = [];
      message._orphanProgress[progress.id].push(progress);
      return;
    }
    entry._progressPhase = progress.phase;
    setRun(entry, phaseFromProgress(progress), { elapsedMs: progress.elapsedMs || 0 });
    /* Keep the bounded output buffer on the entry whether or not there is a DOM
       card to write into: the declarative row paints its live tail from
       `_liveOutput`, so a run whose row is collapsed in a group (or not mounted
       yet) still has what it printed when it appears. */
    if (progress.chunk && (progress.phase === 'stdout' || progress.phase === 'stderr' || progress.phase === 'timeout_warning')) {
      const buffer = entry._liveBuffer || (entry._liveBuffer = createLiveOutputBuffer());
      buffer.push(progress.phase === 'timeout_warning' ? '\n[' + progress.chunk + ']\n' : progress.chunk);
      entry._liveOutput = renderLivePreview(buffer.preview());
    }
    updateRunSummary(message);
    notifyToolRun(message);
    let card = findCard(progress.id);
    if (!card && entry._groupHeadId) {
      const headCard = findCard(entry._groupHeadId);
      if (headCard && headCard.classList.contains('tool-inline')) card = headCard;
    }
    if (!card) {
      /* React owns this turn's rows: the data above is the whole job. The
         pending-queue exists only so a late-mounting legacy card can replay
         chunks, so skipping it here is what keeps the queue from growing. */
      if (ownsLiveTurn()) return;
      entry._pendingProgress = entry._pendingProgress || [];
      entry._pendingProgress.push(progress);
      return;
    }

    if (!skipQueuedDrain && entry._pendingProgress && entry._pendingProgress.length) {
      const queued = entry._pendingProgress.splice(0);
      for (let i = 0; i < queued.length; i++) renderProgress(queued[i], true);
    }

    if ((card as HTMLElement).classList.contains('tool-inline')) {
      if ((entry.name === 'code_interpreter' || entry.name === 'Code')
        && (progress.phase === 'stdout' || progress.phase === 'stderr')) {
        updateInlineToolLabel(
          card as HTMLElement,
          translate('tool.actionAnalyze', 'Analyzing data…'),
        );
      }
      const elapsed = ((progress.elapsedMs || 0) / 1000).toFixed(1);
      updateInlineToolMeta(card as HTMLElement, progress.elapsedMs ? elapsed + 's' : '');
      return;
    }

    const out = card.querySelector('.agent-tool-out');
    if (!out) return;
    let live = out.querySelector('.agent-tool-progress') as HTMLElement | null;
    if (!live && progress.phase !== 'timeout_warning' && progress.phase !== 'completed' && progress.phase !== 'failed' && progress.phase !== 'queued') {
      live = document.createElement('div');
      live.className = 'agent-tool-progress';
      const outputText = out.querySelector('.agent-tool-output-text');
      if (outputText) out.insertBefore(live, outputText); else out.appendChild(live);
      live.innerHTML = '<span class="agent-tool-progress-badge"></span><pre class="agent-tool-stream"></pre>';
    }

    const badge = live && live.querySelector('.agent-tool-progress-badge') as HTMLElement | null;
    const stream = live && live.querySelector('.agent-tool-stream') as HTMLElement | null;
    let phaseLabel = '[Running]';
    if (progress.phase === 'queued') phaseLabel = '[Queued]';
    else if (progress.phase === 'ready') phaseLabel = '[Booting]';
    else if (progress.phase === 'stderr') phaseLabel = '[Stderr]';
    else if (progress.phase === 'timeout_warning') phaseLabel = '[Timeout at]';
    else if (progress.phase === 'skipped') phaseLabel = '[Skipped]';
    const elapsed = ((progress.elapsedMs || 0) / 1000).toFixed(1);
    if (badge) badge.textContent = phaseLabel + ' \u00B7 ' + elapsed + 's';
    const headerStatus = card.querySelector('.agent-tool-status') as HTMLElement | null;
    if (headerStatus) {
      headerStatus.className = 'agent-tool-status' + (progress.phase === 'timeout_warning' ? ' warn' : ' mute');
      const isCode = entry.name === 'code_interpreter' || entry.name === 'Code';
      const stageLabel = isCode && (progress.phase === 'stdout' || progress.phase === 'stderr')
        ? translate('tool.actionAnalyze', 'Analyzing data…')
        : isCode && (progress.phase === 'queued' || progress.phase === 'ready')
          ? translate('tool.actionCode', 'Executing code…')
          : phaseLabel.replace(/^\[|\]$/g, '');
      headerStatus.textContent = stageLabel + ' ' + elapsed + 's';
    }
    if (progress.phase === 'timeout_warning' && progress.chunk) {
      /* The warning reads like a stream line too, so it goes through the
         bounded buffer (kept visually bracketed as before) instead of
         unbounded appends. */
      if (stream) {
        const buffer = entry._liveBuffer || (entry._liveBuffer = createLiveOutputBuffer());
        buffer.push('\n[' + progress.chunk + ']\n');
        stream.textContent = renderLivePreview(buffer.preview());
        stream.scrollTop = stream.scrollHeight;
      }
      (card as HTMLElement).style.borderColor = 'hsl(35 80% 50%)';
      return;
    }
    if (stream && progress.chunk) {
      const buffer = entry._liveBuffer || (entry._liveBuffer = createLiveOutputBuffer());
      buffer.push(progress.chunk);
      /* Bounded rebuild: the buffer keeps head+tail windows and counts
         dropped content, so the DOM node never grows past the caps
         (previously a 51200-char slice that dropped the output head). */
      stream.textContent = renderLivePreview(buffer.preview());
      stream.scrollTop = stream.scrollHeight;
    }
  }

  function flushDeltas(): void {
    deltaFrame = null;
    const message = activeMessage();
    if (!message || !pendingDeltas.length) return;
    const latest = new Map<string, ToolCallDelta>();
    for (let i = 0; i < pendingDeltas.length; i++) {
      const delta = pendingDeltas[i];
      if (!delta) continue;
      latest.set((delta.id || '?') + ':' + (delta.index || 0), delta);
    }
    pendingDeltas.length = 0;

    /* P_tool-live-preview — put the streamed arguments on the entry before
       looking for a DOM row. The declarative row paints its live code /
       command preview from `argumentsText`, so a preview survives a call
       whose row is not mounted yet (or is collapsed inside a group) — the
       exact case updateInlineToolCodePreview used to lose. */
    let argumentsChanged = false;
    latest.forEach(function (delta: ToolCallDelta) {
      if (!delta || !delta.id || typeof delta.arguments !== 'string') return;
      const entry = findEntry(message, delta.id);
      if (!entry || entry.argumentsText === delta.arguments) return;
      entry.argumentsText = delta.arguments;
      argumentsChanged = true;
    });
    if (argumentsChanged) notifyToolRun(message);

    const matchedIds = new Set<string>();
    const cards = body.querySelectorAll('.agent-tool-card[data-tcid]');
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
      const card = cards[cardIndex];
      const toolCallId = card.getAttribute('data-tcid');
      let found: ToolCallDelta | undefined;
      latest.forEach(function (candidate: ToolCallDelta) {
        if (!found && candidate && candidate.id === toolCallId) found = candidate;
      });
      if (!found) continue;
      matchedIds.add(found.id);
      try { updateToolCardCode(toolCallId || '', found.arguments || '', found.name || ''); } catch (_) { /* ignore */ }
      if (found.final) {
        const code = card.querySelector('.agent-tool-code');
        if (code) code.classList.remove('agent-tool-code-streaming');
      }
    }

    /* P_tool-delta-stream — compact rows render live code previews, so
       deltas that arrive after the row is mounted must stream into the
       inline row's <pre> as well, not just into classic cards. Rows that
       are still settling skip updates; settle clears the preview. */
    const inlineRows = body.querySelectorAll('.tool-inline[data-tcid]');
    for (let rowIndex = 0; rowIndex < inlineRows.length; rowIndex++) {
      const row = inlineRows[rowIndex] as HTMLElement;
      if (row.dataset.state !== 'running') continue;
      const toolCallId = row.getAttribute('data-tcid');
      let found: ToolCallDelta | undefined;
      latest.forEach(function (candidate: ToolCallDelta) {
        if (!found && candidate && candidate.id === toolCallId) found = candidate;
      });
      if (!found) continue;
      matchedIds.add(found.id);
      try { updateInlineToolCodePreview(row, found.arguments || '', found.name || ''); } catch (_) { /* ignore */ }
    }

    /* Merged members have no row of their own — stream their deltas into
       the head row's live preview so code arguments stay visible. */
    latest.forEach(function (delta) {
      if (!delta || !delta.id || matchedIds.has(delta.id)) return;
      const entry = findEntry(message, delta.id);
      if (!entry || !entry._groupHeadId) return;
      const head = findCard(entry._groupHeadId);
      if (!head || !head.classList.contains('tool-inline')
        || (head as HTMLElement).dataset.state !== 'running') return;
      matchedIds.add(delta.id);
      try { updateInlineToolCodePreview(head as HTMLElement, delta.arguments || '', delta.name || ''); } catch (_) { /* ignore */ }
    });

    latest.forEach(function (delta) {
      if (!delta || !delta.id || matchedIds.has(delta.id)) return;
      const entry = findEntry(message, delta.id);
      if (entry) {
        entry._pendingDeltas = entry._pendingDeltas || [];
        entry._pendingDeltas.push(delta);
        return;
      }
      if (!message._orphanDeltas || typeof message._orphanDeltas !== 'object' || Array.isArray(message._orphanDeltas)) {
        message._orphanDeltas = {};
      }
      if (!message._orphanDeltas[delta.id]) message._orphanDeltas[delta.id] = [];
      message._orphanDeltas[delta.id].push(delta);
    });
  }

  function closeConnection(connection: ExecutionConnection): void {
    if (!connection) return;
    clearTimeout(connection.timer);
    try { connection.source.close(); } catch (_) { /* ignore */ }
    executionConnections.delete(connection.key);
  }

  function connectExecution(executionId: string, toolCallId: string): void {
    if (!useExecutionEventSource || !executionId || !toolCallId || disposed || !EventSourceImpl) return;
    const connectionKey = toolCallId + ':' + executionId;
    if (executionConnections.has(connectionKey)) return;
    try {
      const source = new EventSourceImpl('/api/executions/' + encodeURIComponent(executionId) + '/stream');
      const connection: ExecutionConnection = { key: connectionKey, source, timer: null as unknown as ReturnType<typeof setTimeout> };
      executionConnections.set(connectionKey, connection);
      connection.timer = setTimeout(function () {
        if (!disposed) {
          recordToolResult({
            id: toolCallId,
            ok: false,
            status: 'failed',
            output: '',
            stderr: '',
            error: 'execution_sse_timeout: backend did not respond within 60s',
            artifacts: [],
            durationMs: 60000,
            executionId: executionId,
            name: 'code_interpreter',
          });
        }
        closeConnection(connection);
      }, 60000);
      source.addEventListener('progress', function (event: MessageEvent) {
        try {
          const data = JSON.parse(event.data) as ToolProgress;
          data.id = toolCallId;
          renderProgress(data);
        } catch (_) { /* ignore */ }
      });
      source.addEventListener('result', function (event: MessageEvent) {
        try {
          const data = JSON.parse(event.data) as ToolResult;
          recordToolResult({
            id: toolCallId,
            ok: data.status === 'completed',
            status: data.status,
            output: data.output || '(no output)',
            stderr: data.stderr || '',
            error: data.status !== 'completed' ? (data.error || data.status) : undefined,
            errorCode: (data as ToolResult).errorCode || null,
            artifacts: (data as unknown as { artifactFileIds?: unknown[] }).artifactFileIds || [],
            durationMs: data.durationMs || 0,
            executionId: executionId,
            name: 'code_interpreter',
          });
        } catch (_) { /* ignore */ }
        closeConnection(connection);
      });
      source.addEventListener('error', function (event: MessageEvent) {
        try {
          const data = event.data ? JSON.parse(event.data) as { error?: string } : null;
          if (data && data.error) {
            recordToolResult({ id: toolCallId, ok: false, status: 'failed', output: '', error: data.error, artifacts: [] });
          }
        } catch (_) { /* ignore */ }
        closeConnection(connection);
      });
    } catch (_) {
      console.log('[execution-sse] failed');
    }
  }

  function recordToolUse(call: {
    id?: string;
    name?: string;
    input?: unknown;
    executionId?: string;
  }): HTMLElement | null {
    if (!call || !call.name || !activeMessage()) return null;
    /* onToolActivity may retire the live status through an immutable message
     * update. Re-read the active entry afterwards so toolCalls never land on
     * the superseded object captured before that update. */
    onToolActivity();
    const message = activeMessage();
    if (!message) return null;
    const requestedId = String(call.id || ('tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
    const existing = findEntry(message, requestedId);
    if (existing) {
      existing.name = String(call.name || existing.name);
      if (call.input != null) existing.input = call.input;
      if (call.executionId) {
        existing.executionId = call.executionId;
        if (!getRun(existing) || !isTerminalToolPhase(getRun(existing)!.phase)) {
          connectExecution(call.executionId, existing.id);
        }
      }
      const existingCard = findCard(existing.id);
      return existingCard
        ? (existingCard.querySelector('.agent-tool-out') as HTMLElement | null)
        : null;
    }
    const entry: ToolCallEntry = {
      id: requestedId,
      name: String(call.name),
      input: call.input == null ? null : call.input,
      output: null,
      isError: false,
      artifacts: [],
    };
    setRun(entry, TOOL_RUN_PHASES.preparing);

    if (pendingDeltas.length) {
      const kept: ToolCallDelta[] = [];
      for (let i = 0; i < pendingDeltas.length; i++) {
        const delta = pendingDeltas[i];
        if (delta && delta.id === entry.id) {
          entry._pendingDeltas = entry._pendingDeltas || [];
          entry._pendingDeltas.push(delta);
        } else {
          kept.push(delta);
        }
      }
      pendingDeltas.length = 0;
      for (let i = 0; i < kept.length; i++) pendingDeltas.push(kept[i]);
      if (entry._pendingDeltas && entry._pendingDeltas.length) {
        const latest = entry._pendingDeltas[entry._pendingDeltas.length - 1];
        if (latest && latest.arguments) {
          if (!entry.input || typeof entry.input !== 'object') entry.input = {};
          if (!(entry.input as Record<string, unknown>).__raw) (entry.input as Record<string, unknown>).__raw = latest.arguments;
        }
      }
    }

    if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
    message.toolCalls.push(entry);
    let mergedInto: LiveGroupState | null = null;
    if (mode === 'compact' && !liveSingleCardSlot) {
      mergedInto = findMergeGroup(entry);
      if (mergedInto) mergeIntoGroup(entry, mergedInto);
    }
    let output: Element | null = null;
    if (mode === 'detailed') {
      output = appendToolModule(entry.name, entry.input || {}, ensureToolContainer());
      if (!output) return null;
      const card = output.closest('.agent-tool-card');
      if (card) {
        card.setAttribute('data-tcid', entry.id);
        ownedToolCards.add(card as HTMLElement);
      }
    } else if (mergedInto) {
      /* Merged member: no new visible row; the head row carries the
         aggregate count and the member's own textOffset is inherited. */
    } else if (liveSingleCardSlot) {
      mountLiveSingleCardRow(entry);
    } else {
      mountInlineRow(entry);
    }

    const orphanDeltas = message._orphanDeltas?.[entry.id];
    if (orphanDeltas) {
      delete message._orphanDeltas![entry.id];
    }
    if (Array.isArray(orphanDeltas) && orphanDeltas.length) {
      entry._pendingDeltas = entry._pendingDeltas || [];
      entry._pendingDeltas.push.apply(entry._pendingDeltas, orphanDeltas);
    }
    if (entry._pendingDeltas && entry._pendingDeltas.length) {
      const queuedDeltas = entry._pendingDeltas.splice(0);
      for (let deltaIndex = 0; deltaIndex < queuedDeltas.length; deltaIndex++) {
        try { updateToolCardCode(entry.id, queuedDeltas[deltaIndex].arguments || '', queuedDeltas[deltaIndex].name || ''); } catch (_) { /* ignore */ }
        if (queuedDeltas[deltaIndex].arguments) entry.argumentsText = queuedDeltas[deltaIndex].arguments;
        /* P_tool-delta-stream — deltas buffered before tool_use landed
           replay into the compact row's live preview too; updateToolCardCode
           above is a no-op in compact mode (no .agent-tool-card exists). */
        if (mode === 'compact') {
          const inlineRow = findInlineRow(entry.id)
            || (mergedInto ? mergedInto.headRow : null);
          if (inlineRow) {
            try { updateInlineToolCodePreview(inlineRow, queuedDeltas[deltaIndex].arguments || '', queuedDeltas[deltaIndex].name || ''); } catch (_) { /* ignore */ }
          }
        }
      }
    }
    if (entry._pendingProgress && entry._pendingProgress.length) {
      const queuedProgress = entry._pendingProgress.splice(0);
      for (let progressIndex = 0; progressIndex < queuedProgress.length; progressIndex++) renderProgress(queuedProgress[progressIndex], true);
    }
    const orphanProgress = message._orphanProgress?.[entry.id];
    if (orphanProgress) delete message._orphanProgress![entry.id];
    if (Array.isArray(orphanProgress)) {
      for (let progressIndex = 0; progressIndex < orphanProgress.length; progressIndex++) {
        renderProgress(orphanProgress[progressIndex], true);
      }
    }
    const orphanApprovals = message._orphanApprovals?.[entry.id];
    if (orphanApprovals) delete message._orphanApprovals![entry.id];
    if (Array.isArray(orphanApprovals)) {
      for (let approvalIndex = 0; approvalIndex < orphanApprovals.length; approvalIndex++) {
        renderApproval({ ...orphanApprovals[approvalIndex], id: entry.id });
      }
    }
    /* Codex can emit its first step before the tool_use frame lands. */
    drainAgentFrames(entry, message);
    if (call.name === 'code_interpreter' && call.executionId) {
      entry.executionId = call.executionId;
      connectExecution(call.executionId, entry.id);
    }
    updateRunSummary(message);
    notifyToolRun(message);
    return output as HTMLElement | null;
  }

  /* ── Codex agent steps ──────────────────────────────────────────
     The workspace agent streams its own activity: each Codex thread item
     arrives as an `agent_step` frame and its todo list as `agent_plan`.
     Steps render into a host anchored right after the agent's inline row,
     so they read in the same order the agent worked, and they are also
     stored on the tool call so history replay and the share view can
     rebuild them without the live stream. */

  /** Host node for a run's steps: a sibling right after the agent row. */
  function ensureAgentRunHost(toolCallId: string): HTMLElement | null {
    const row = (findCard(toolCallId) || (function () {
      const entry = findEntry(activeMessage(), toolCallId);
      return entry && entry._groupHeadId ? findCard(entry._groupHeadId) : null;
    })()) as HTMLElement | null;
    if (!row) return null;
    const next = row.nextElementSibling as HTMLElement | null;
    if (next && next.classList && next.classList.contains('agent-run-host')) return next;
    const created = document.createElement('div');
    created.className = 'agent-run-host';
    created.dataset.agentAnchor = toolCallId;
    if (typeof row.insertAdjacentElement === 'function') {
      row.insertAdjacentElement('afterend', created);
    } else {
      body.appendChild(created);
    }
    return created;
  }

  /** Resolve the entry an agent frame belongs to, tolerating a missing id. */
  function agentEntryFor(message: ToolMessage, frameId: string): ToolCallEntry | null {
    const direct = frameId ? findEntry(message, frameId) : null;
    if (direct) return direct;
    const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
    for (let index = calls.length - 1; index >= 0; index--) {
      if (calls[index] && calls[index].name === 'workspace_agent' && !calls[index]._toolResultApplied) {
        return calls[index];
      }
    }
    return null;
  }

  function bufferAgentFrame(message: ToolMessage, frame: AgentStepFrame | AgentPlanFrame): void {
    if (!message._orphanAgentFrames) message._orphanAgentFrames = {};
    const key = String(frame.id || 'workspace_agent');
    if (!message._orphanAgentFrames[key]) message._orphanAgentFrames[key] = [];
    /* Bounded: a long run must not grow this buffer without limit. */
    if (message._orphanAgentFrames[key].length < 200) message._orphanAgentFrames[key].push(frame);
  }

  function recordAgentStep(frame: AgentStepFrame): void {
    let message = activeMessage();
    if (!message || !frame || !frame.stepId) return;
    const entry = agentEntryFor(message, String(frame.id || ''));
    if (!entry) {
      bufferAgentFrame(message, frame);
      return;
    }
    onToolActivity();
    message = activeMessage();
    const currentEntry = message ? agentEntryFor(message, String(frame.id || '')) : null;
    if (!message || !currentEntry) return;
    const liveEntry = currentEntry;
    if (frame.runId) liveEntry.runId = String(frame.runId);
    /* Persisted shape: plain data only, keyed by stepId so the started and
       completed events collapse into one entry. */
    const stored: AgentStepData = {
      stepId: String(frame.stepId),
      kind: frame.kind,
      title: frame.title ?? null,
      detail: frame.detail ?? null,
      command: frame.command ?? null,
      status: frame.status,
      exitCode: frame.exitCode ?? null,
      durationMs: frame.durationMs ?? null,
      diffStat: frame.diffStat ?? null,
      output: frame.output ?? null,
    };
    if (!Array.isArray(liveEntry.steps)) liveEntry.steps = [];
    const existingIndex = liveEntry.steps.findIndex((candidate) => candidate.stepId === stored.stepId);
    if (existingIndex >= 0) liveEntry.steps[existingIndex] = stored;
    /* Bounded, in reading order: a run that reports more than this keeps the
       steps the reader saw first, and the session route caps what persists. */
    else if (liveEntry.steps.length < 60) liveEntry.steps.push(stored);
    notifyToolRun(message);

    const host = ensureAgentRunHost(liveEntry.id);
    if (!host) return;
    try { upsertAgentStep(host, stored, liveEntry.runId || null); } catch (_) { /* presentation only */ }
  }

  function recordAgentPlan(frame: AgentPlanFrame): void {
    let message = activeMessage();
    if (!message || !frame || !Array.isArray(frame.steps) || frame.steps.length === 0) return;
    const entry = agentEntryFor(message, String(frame.id || ''));
    if (!entry) {
      bufferAgentFrame(message, frame);
      return;
    }
    onToolActivity();
    message = activeMessage();
    const liveEntry = message ? agentEntryFor(message, String(frame.id || '')) : null;
    if (!message || !liveEntry) return;
    if (frame.runId) liveEntry.runId = String(frame.runId);
    liveEntry.plan = { steps: frame.steps.slice(0, 40), explanation: frame.explanation ?? null };
    notifyToolRun(message);
    const host = ensureAgentRunHost(liveEntry.id);
    if (!host) return;
    try { upsertAgentPlan(host, liveEntry.plan, liveEntry.runId || null); } catch (_) { /* presentation only */ }
  }

  /** Replay frames that arrived before their tool_use landed. */
  function drainAgentFrames(entry: ToolCallEntry, message: ToolMessage): void {
    const buckets = message._orphanAgentFrames;
    if (!buckets) return;
    const queued = [
      ...(buckets[entry.id] || []),
      ...(entry.name === 'workspace_agent' ? (buckets.workspace_agent || []) : []),
    ];
    delete buckets[entry.id];
    if (entry.name === 'workspace_agent') delete buckets.workspace_agent;
    for (const frame of queued) {
      if (frame.type === 'plan') recordAgentPlan({ ...frame, id: entry.id });
      else recordAgentStep({ ...frame, id: entry.id });
    }
  }

  /** Finish the run section once the agent tool itself reports a result. */
  function settleAgentRunForEntry(entry: ToolCallEntry, result: ToolResult): void {
    if (!entry || !Array.isArray(entry.steps) || entry.steps.length === 0) {
      if (!entry || !entry.plan) return;
    }
    const host = ensureAgentRunHost(entry.id);
    if (!host) return;
    const run = getRun(entry);
    const state = result.ok === false
      ? (result.status === 'cancelled' ? 'cancelled' : 'failed')
      : 'done';
    try {
      settleAgentRun(host, {
        runId: entry.runId || null,
        state,
        durationMs: result.durationMs || (run && run.durationMs) || null,
      });
    } catch (_) { /* presentation only */ }
  }

  function recordToolApproval(approval: ToolApproval): void {
    const message = activeMessage();
    if (!message || !approval || !approval.runId || !approval.approvalId) return;
    let entry: ToolCallEntry | null = approval.id ? findEntry(message, String(approval.id)) : null;
    if (!entry && Array.isArray(message.toolCalls)) {
      /* A provider adapter may omit the presentation id. Attach the approval
       * to the most recent active workspace-agent call in this message. */
      for (let index = message.toolCalls.length - 1; index >= 0; index--) {
        const candidate = message.toolCalls[index];
        if (candidate && candidate.name === 'workspace_agent' && !candidate._toolResultApplied) {
          entry = candidate;
          break;
        }
      }
    }
    if (!entry) {
      if (!message._orphanApprovals) message._orphanApprovals = {};
      const key = String(approval.id || approval.runId);
      message._orphanApprovals[key] = message._orphanApprovals[key] || [];
      message._orphanApprovals[key].push(approval);
      return;
    }
    const normalized = { ...approval, id: entry.id };
    entry.approval = normalized;
    /* Publish before the DOM pass: a React row renders the panel from
       entry.approval, and the legacy path below may bail to the orphan
       buffer without touching anything visible. */
    notifyToolRun(message);
    renderApproval(normalized);
  }

  function recordToolProgress(progress: ToolProgress): void {
    if (!activeMessage()) return;
    renderProgress(progress);
  }

  function recordToolCallDelta(delta: ToolCallDelta): void {
    if (!activeMessage() || !delta) return;
    pendingDeltas.push(delta);
    if (deltaFrame == null) deltaFrame = requestFrame(flushDeltas);
  }

  function recordExecutionStart(event: ExecutionEvent): void {
    const message = activeMessage();
    if (!message || !event || !event.executionId || !event.id) return;
    const entry = findEntry(message, event.id);
    if (entry) {
      entry.executionId = event.executionId;
      if (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase)) return;
      setRun(entry, TOOL_RUN_PHASES.running);
      updateRunSummary(message);
      notifyToolRun(message);
    }
    connectExecution(event.executionId, event.id);
  }

  function recordToolResult(result: ToolResult): void {
    const message = activeMessage();
    if (!message || !result || !result.id) return;
    /* The main chat SSE is authoritative. If an explicitly enabled
       execution EventSource is still open, close it before applying the
       terminal result so it cannot replay the same result a moment later. */
    Array.from(executionConnections.values()).forEach(function (connection) {
      if (connection.key.indexOf(String(result.id) + ':') === 0) closeConnection(connection);
    });
    let output: HTMLElement | null = null;
    let entry = findEntry(message, result.id);
    if (!entry) {
      entry = {
        id: String(result.id),
        name: result.name || 'tool',
        input: null,
        output: null,
        isError: false,
        artifacts: [],
      };
      if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
      message.toolCalls.push(entry);
      setRun(entry, TOOL_RUN_PHASES.preparing);
      if (mode === 'compact') {
        /* A synthetic row mounts where the message text currently ends.
           Persist the split point directly — a result can land after
           finish()'s inlineToolRows write-back loop has already run, and
           without textOffset the row would be lost on history replay. */
        const mountedOffset = liveSingleCardSlot ? mountLiveSingleCardRow(entry) : mountInlineRow(entry);
        if (mountedOffset != null) entry.textOffset = mountedOffset;
      } else {
        output = appendToolModule(entry.name, {}, ensureToolContainer()) as HTMLElement | null;
        const syntheticCard = output && output.closest('.agent-tool-card');
        if (syntheticCard) syntheticCard.setAttribute('data-tcid', entry.id);
      }
    } else {
      const card = findCard(entry.id);
      if (card) output = card.querySelector('.agent-tool-out');
    }

    if (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase) && entry._toolResultApplied) return;

    if (result.executionId && !entry.executionId) {
      entry.executionId = result.executionId;
    }
    if (entry._pendingProgress && entry._pendingProgress.length) {
      const queuedProgress = entry._pendingProgress.splice(0);
      for (let progressIndex = 0; progressIndex < queuedProgress.length; progressIndex++) renderProgress(queuedProgress[progressIndex], true);
    }

    const awaitingApproval = result.status === 'awaiting_approval';
    let statusText = '';
    let statusClass = '';
    const duration = result.durationMs != null && result.durationMs > 0
      ? ' [' + (result.durationMs / 1000).toFixed(1) + 's]'
      : '';
    let display = '';
    if (awaitingApproval) {
      statusText = translate('tool.awaitingApproval', 'Waiting for your decision');
      statusClass = 'warn';
      display = translate('tool.codexApprovalCopy', 'Review the action before it continues.');
    } else if (result.ok === false) {
      if (result.status === 'timeout') {
        statusText = translate('tool.statusTimeout', 'Timeout');
        statusClass = 'warn';
      } else if (result.status === 'cancelled') {
        statusText = translate('tool.statusStopped', 'Stopped');
        statusClass = 'mute';
      } else {
        statusText = translate('tool.statusFailed', 'Failed');
        statusClass = 'err';
      }
      const errorMessage = result.userMessage || result.error || result.errorCode || result.output || 'failed';
      display = errorMessage + duration;
      if ((result.name || entry.name) === 'code_interpreter') {
        const stderr = String(result.stderr || '') + String(result.error || '');
        /* P_pyerror-hints — when the model gets a Python exception
           back, a one-line hint about the failure mode cuts redundant
           "retry with the same broken code" attempts. */
        if (/SyntaxError|IndentationError/i.test(stderr)) {
          display += '\n\nHint: Python refused to parse the source — fix the syntax / indentation in the same run, no need to retry the whole flow.';
        } else if (/ModuleNotFoundError/i.test(stderr)) {
          display += "\n\nHint: Pyodide ships numpy, pandas, and matplotlib pre-installed. For other packages, install them in the run with `import micropip; micropip.install('pkg')`.";
        } else if (/FileNotFoundError|No such file or directory/i.test(stderr)) {
          display += '\n\nHint: the scratch dir is session-scoped and persists across every code call in this conversation. Each run prints a `[scratch]` header listing the files currently in /artifacts — read it before guessing a path.';
        } else if (/PermissionError|IsADirectoryError|NotADirectoryError/i.test(stderr)) {
          display += '\n\nHint: the path is a directory or not writable. Write to a fresh filename inside /artifacts.';
        } else if (/NameError/i.test(stderr)) {
          display += '\n\nHint: a variable / function name is not defined. Either import it or define it earlier in the same run.';
        } else if (/TypeError/i.test(stderr)) {
          display += '\n\nHint: a value was passed to an operation with the wrong type. Check the call signature before retrying.';
        } else if (/ValueError/i.test(stderr)) {
          display += '\n\nHint: the value passed to a function is the right type but out of range or the wrong shape.';
        } else if (/IndexError/i.test(stderr)) {
          display += '\n\nHint: list/sequence index is out of range. Guard with `if i < len(xs):` or use a try/except.';
        } else if (/KeyError/i.test(stderr)) {
          display += '\n\nHint: dict lookup failed. Use `.get(key, default)` or `if key in d:` before indexing.';
        } else if (/ZeroDivisionError/i.test(stderr)) {
          display += '\n\nHint: division by zero. Add a guard for the denominator.';
        }
      }
    } else {
      statusText = translate('tool.statusDone', 'Done');
      statusClass = 'ok';
      display = (result.output || '(no output)') + (result.stderr ? '\n[stderr]\n' + result.stderr : '') + duration;
    }

    const terminalPhase = awaitingApproval
      ? TOOL_RUN_PHASES.running
      : result.ok === false
      ? (result.status === 'timeout'
        ? TOOL_RUN_PHASES.timed_out
        : result.status === 'cancelled' ? TOOL_RUN_PHASES.cancelled : TOOL_RUN_PHASES.failed)
      : TOOL_RUN_PHASES.succeeded;
    setRun(entry, terminalPhase, { endedAt: Date.now(), durationMs: result.durationMs || 0 });
    entry.output = display;
    entry.isError = result.ok === false;
    entry.results = Array.isArray(result.results) ? result.results.slice(0, 20) : [];
    if (result.visualization && result.visualization.version === 1) {
      entry.input = result.visualization;
      entry.visualization = result.visualization;
    }
    if (Array.isArray(result.artifacts)) entry.artifacts = normalizeArtifacts(result.artifacts);
    /* P_artifact-summary-in-context — the model can't see the PNG the
       run produced unless we tell it explicitly. */
    if (entry.artifacts && entry.artifacts.length) {
      const artifactLines = ['[artifacts]'];
      for (let aIdx = 0; aIdx < entry.artifacts.length; aIdx++) {
        const a = entry.artifacts[aIdx];
        const aName = a.name || a.id || 'artifact';
        const aMime = a.mimeType || 'application/octet-stream';
        artifactLines.push('- ' + aName + ' (' + aMime + ', id=' + a.id + ')');
      }
      entry.output = entry.output ? entry.output + '\n\n' + artifactLines.join('\n') : artifactLines.join('\n');
    }
    updateRunSummary(message);
    /* Everything the row reads (output / isError / results / artifacts /
       visualization) is on the entry by now, so this is the repaint point
       for the terminal state — it must fire before the early return below,
       otherwise a second result frame would leave the row spinning. */
    notifyToolRun(message);
    if (entry._toolResultApplied) return;
    /* The agent's own step list closes with the run, before the generic
       result rendering below decides how to settle the row. */
    if (entry.name === 'workspace_agent' && !awaitingApproval) {
      settleAgentRunForEntry(entry, result);
    }
    if (!output) {
      // Compact mode: settle the inline status row in place, then
      // surface image artifacts and visualizations directly AFTER the
      // inline row so the tool's output sits at the point in the answer
      // where the call actually fired (not at the bubble's very end).
      // Non-image artifacts (CSVs, JSON) are persisted on the entry and
      // discoverable via the session history, so we drop them silently.
      if (mode === 'compact') {
        const row = findInlineRow(entry.id);
        if (row) {
          /* P_tool-live-group — a merged row settling expands it: unhide
             and swap it into the live slot as the visible row. */
          if (row.dataset.merged === '1' && liveSingleCardSlot) {
            delete row.dataset.merged;
            try { replaceLiveInlineToolRow(liveSingleCardSlot, row, { skipFlash: true }); } catch (_) { /* ignore */ }
          }
          if (row.dataset.groupIds && Number(row.dataset.groupCount || 1) > 1) {
            maybeSettleGroup(row as HTMLElement);
          } else {
            settleInlineToolRow(row, {
              ...result,
              output: entry.output || result.output || '',
            }, { cancelled: result.status === 'cancelled' });
          }
        } else if (entry._groupHeadId) {
          const headRow = findCard(entry._groupHeadId);
          if (headRow && headRow.classList.contains('tool-inline')) {
            maybeSettleGroup(headRow as HTMLElement);
          }
        }
        const attachRow = row
          || (entry._groupHeadId ? (findCard(entry._groupHeadId) as HTMLElement | null) : null);
        const attachmentHost = attachRow ? ensureRowAttachmentHost(attachRow, entry.id) : body;
        for (let artifactIndex = 0; artifactIndex < entry.artifacts.length; artifactIndex++) {
          const artifact = entry.artifacts[artifactIndex];
          if (artifact.id) {
            appendInlineArtifact(artifact.id, artifact.mimeType, attachmentHost, artifact.name);
          }
        }
        if (result.visualization && result.visualization.version === 1) {
          mountVisualization(result.visualization, attachmentHost, { toolCallId: entry.id });
        }
        if (!awaitingApproval) entry._toolResultApplied = true;
      }
      return;
    }
    if (!awaitingApproval) entry._toolResultApplied = true;
    const liveProgress = output.querySelector('.agent-tool-progress');
    if (liveProgress) liveProgress.remove();
    const toolName = entry.name || result.name || '';
    if (toolName === 'render_visualization' && result.visualization && !entry.isError) {
      mountVisualization(result.visualization, body, { toolCallId: entry.id });
    }
    let rich = false;
    if (toolName === 'web_search' && Array.isArray(result.results) && result.results.length) {
      rich = renderWebSearchResults(output, result.results, ((entry.input as Record<string, unknown> | null) && (entry.input as Record<string, unknown>).query) || result.query || '');
    }
    if (!rich) renderToolTextOutput(output, display || '', { isError: entry.isError, kind: entry.isError ? 'error' : 'output' });

    if (entry.isError && result.detail) {
      const details = document.createElement('details');
      details.className = 'agent-tool-error-detail';
      const summary = document.createElement('summary');
      summary.textContent = '查看技术详情';
      const code = document.createElement('code');
      code.textContent = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail);
      details.appendChild(summary);
      details.appendChild(code);
      output.appendChild(details);
    }
    const resultCard = output.closest('.agent-tool-card') as HTMLElement | null;
    if (resultCard) {
      resultCard.dataset.toolState = entry.isError ? 'error' : 'complete';
      resultCard.style.borderColor = '';
      const badge = resultCard.querySelector('.agent-tool-status') as HTMLElement | null;
      if (badge) {
        badge.className = 'agent-tool-status ' + statusClass;
        const badgeDuration = result.durationMs != null && result.durationMs > 0
          ? ' ' + (result.durationMs / 1000).toFixed(1) + 's'
          : '';
        badge.textContent = statusText + badgeDuration;
      }
    }
    for (let artifactIndex = 0; artifactIndex < entry.artifacts.length; artifactIndex++) {
      const artifact = entry.artifacts[artifactIndex];
      if (artifact.id && artifact.mimeType && (artifact.mimeType.indexOf('image/') === 0 || artifact.mimeType.indexOf('text/html') === 0)) {
        appendInlineArtifact(artifact.id, artifact.mimeType, body, artifact.name);
      } else if (artifact.id) {
        appendInlineArtifact(artifact.id, artifact.mimeType, output, artifact.name);
      }
    }
  }

  function dispose(): void {
    if (disposed) return;
    const message = getMessage();
    const hasPendingApproval = !!(message && Array.isArray(message.toolCalls) && message.toolCalls.some((entry) => (
      !!(entry && entry.approval && (!entry.approval.status || entry.approval.status === 'pending'))
    )));
    if (hasPendingApproval) {
      /* The stream can finish while a Codex turn is paused for approval.
       * Keep the stable body listener and runtime state alive so the
       * serialized approval card remains actionable after finish() replaces
       * the row's DOM with outerHTML. */
      postFinishApprovalMessage = message;
      liveGroup = null;
      pendingDeltas.length = 0;
      Array.from(executionConnections.values()).forEach(closeConnection);
      executionConnections.clear();
      return;
    }
    disposed = true;
    ownedInlineRows.forEach((row) => stopInlineToolRowTimer(row));
    ownedInlineRows.clear();
    ownedToolCards.forEach((card) => stopToolCardTimerForCard(card));
    ownedToolCards.clear();
    /* An agent run whose stream ended without a result must not keep a
       one-second interval alive for the rest of the session. */
    if (body && typeof body.querySelectorAll === 'function') {
      body.querySelectorAll('.agent-run').forEach((section) => stopAgentRunTimer(section as HTMLElement));
    }
    if (body && typeof body.removeEventListener === 'function') {
      body.removeEventListener('click', approvalDelegatedClick);
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('click', approvalDelegatedClick);
    }
    liveGroup = null;
    pendingDeltas.length = 0;
    if (deltaFrame != null) {
      cancelFrame(deltaFrame);
      deltaFrame = null;
    }
    Array.from(executionConnections.values()).forEach(closeConnection);
    executionConnections.clear();
  }

  /* Text streaming after a tool row breaks live grouping: the next
     same-category call starts a fresh row instead of merging. */
  function noteTextDelta(): void {
    if (liveGroup) liveGroup.textSinceHead = true;
  }

  function cancel(): void {
    const message = stillOwnsSlot() ? getMessage() : null;
    if (message && Array.isArray(message.toolCalls)) {
      for (let i = 0; i < message.toolCalls.length; i++) {
        const entry = message.toolCalls[i];
        if (!entry || (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase))) continue;
        setRun(entry, TOOL_RUN_PHASES.cancelled, { endedAt: Date.now() });
        const card = findCard(entry.id);
        if (entry._groupHeadId) {
          /* Merged member: the head row settles the whole group below. */
          continue;
        }
        if (card && (card as HTMLElement).classList.contains('tool-inline')) {
          if (card && (card as HTMLElement).dataset.groupIds) {
            /* Group head: settle as one aggregate row after the loop. */
            continue;
          }
          settleInlineToolRow(card as HTMLElement, null, { cancelled: true });
        } else if (card) {
          (card as HTMLElement).dataset.toolState = 'cancelled';
          const badge = card.querySelector('.agent-tool-status') as HTMLElement | null;
          if (badge) { badge.className = 'agent-tool-status mute'; badge.textContent = translate('tool.statusStopped', 'Stopped'); }
        }
      }
      const groupRows = body.querySelectorAll('.tool-inline[data-group-ids]');
      for (let gi = 0; gi < groupRows.length; gi++) {
        const groupRow = groupRows[gi] as HTMLElement;
        if (groupRow.dataset.groupSettled !== '1') {
          maybeSettleGroup(groupRow, { forceCancel: true });
        }
      }
      updateRunSummary(message);
      /* Rows settle as stopped, not spinning: the declarative renderer reads
         run.phase off the entry, so the cancel has to publish. */
      notifyToolRun(message);
    }
    dispose();
  }

  return {
    hasActiveTools,
    recordToolUse,
    recordToolProgress,
    recordToolCallDelta,
    recordExecutionStart,
    recordToolResult,
    recordToolApproval,
    decideApproval,
    recordAgentStep,
    recordAgentPlan,
    noteTextDelta,
    cancel,
    dispose,
  };
}
