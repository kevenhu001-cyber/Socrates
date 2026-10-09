/**
 * chat/toolRuntime.ts — per-message tool-call state.
 *
 * Data-only orchestrator for the tool lifecycle:
 *   tool_call_delta -> tool_use -> tool_progress -> tool_result
 * plus approval decisions and Codex agent steps/plans.
 *
 * Rendering belongs to react/tool-run, which draws rows, groups, approval
 * panels and step lists from `message.toolCalls[]`. This module never
 * touches the DOM: mutations stay in private drafts. High-frequency progress
 * updates publish detached snapshots at most once per frame; terminal and
 * approval transitions publish immediately. The chat message controller supplies ownership and the
 * textOffset callback; this module never reaches into global chat state
 * directly.
 *
 * What used to live here and where it went:
 *   inline rows / cards / approval panels / agent hosts — react/tool-run
 *   row copy — react/tool-run/labels.ts (single source)
 *   category table — render/toolCategory.ts (single source)
 *   snapshot projection — chat/toolRuntime/projection.ts
 *   progress and tool-use event lifecycles — chat/toolRuntime/progress.ts, toolUse.ts
 *   approval and agent event lifecycles — chat/toolRuntime/approvals.ts, agentFrames.ts
 *   terminal result projection and write-back — chat/toolRuntime/resultProjection.ts, resultRuntime.ts
 */
/* Type-only: the event shape is owned by the React store, but this module is
   loaded straight from Node by test/toolRuntime.test.mjs, so the runtime
   linkage stays the `window.__socratesReactChatBridge` global (same hand-off
   `publishReactChatRuntime` in main.js uses). */
import type { ChatRuntimeEvent } from '../react/types/domain';

import type { AgentPlanData, AgentStepData } from '../ui/agentSteps.js';
import { publishThinkingPanelEvent } from '../ui/messageSnapshot.js';
import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  transitionToolRun,
} from './toolRunState.js';
import type { ToolRun } from './toolRunState.js';
import type { LiveOutputBufferHandle } from './liveOutput.js';
import { copyToolData, mergeToolCalls } from './toolRuntime/projection.js';
import { createAgentFrameRuntime } from './toolRuntime/agentFrames.js';
import type { AgentPlanFrame, AgentStepFrame } from './toolRuntime/agentFrames.js';
import { createApprovalRuntime } from './toolRuntime/approvals.js';
import type { ToolApproval } from './toolRuntime/approvals.js';
import { createToolUseRuntime } from './toolRuntime/toolUse.js';
import { createToolResultRuntime } from './toolRuntime/resultRuntime.js';
import type { ToolResultInput } from './toolRuntime/resultProjection.js';
import { createProgressRuntime } from './toolRuntime/progress.js';
export type { AgentPlanFrame, AgentStepFrame } from './toolRuntime/agentFrames.js';

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
  status?: string;
  durationMs?: number;
  visualization?: unknown;
  results?: unknown[];
  /** Structured error layers mirrored from the tool_result payload so the
      declarative row can render userMessage / detail / stderr separately
      instead of falling back to the flattened `output` string. */
  userMessage?: string;
  error?: string | null;
  stderr?: string;
  errorCode?: string | null;
  detail?: unknown;
  retryable?: boolean;
  /** Codex run id, when this call is a workspace-agent run. */
  runId?: string;
  /** Projected Codex steps, persisted so history replay can rebuild them. */
  steps?: AgentStepData[];
  /** Latest Codex plan snapshot for this run. */
  plan?: AgentPlanData | null;
  /** Character offset into the message's rawText where the row belongs.
      Persisted with the message so history replay can rebuild the inline
      layout. Chosen by the stream controller's onInlineTool. */
  textOffset?: number;
  /** Cumulative streamed `arguments` JSON while the call is in flight.
      The declarative row shows this as a live code/command preview. */
  argumentsText?: string;
  /** Client-only runtime metadata — not persisted. */
  _run?: ToolRun;
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

interface ToolProgress {
  id: string;
  phase: string;
  elapsedMs?: number;
  chunk?: string;
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

type ToolResult = ToolResultInput;

interface ToolRuntimeOptions {
  /** Accepted for compatibility; ignored — nothing is mounted. */
  body?: HTMLElement | null;
  stillOwnsSlot?: () => boolean;
  getMessage?: () => ToolMessage | null;
  /** Commit detached tool data through the owning session action. */
  updateMessage: (patch: Pick<ToolMessage, 'toolCalls' | '_toolRunRev'>) => void;
  /** Accepted for compatibility; ignored — nothing is mounted. */
  ensureToolContainer?: () => HTMLElement;
  onToolActivity?: (toolName?: string) => void;
  /** Accepted for compatibility; ignored — retry buttons live in React. */
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
  /** Accepted for compatibility; ignored — all modes render from data. */
  mode?: 'compact' | 'detailed';
  /**
   * Split-point chooser supplied by the stream controller. Called with a
   * null row: the return value is the character offset into the message's
   * rawText where the row belongs, persisted on the entry as `textOffset`
   * — the one piece of layout information React cannot derive.
   */
  onInlineTool?: (entry: { id: string; name: string }, row: null) => number | null;
  /** Accepted for compatibility; ignored — grouping is derived by React. */
  liveSingleCardSlot?: HTMLElement | null;
  /** Accepted for compatibility; ignored — the runtime is always data-only. */
  ownsLiveTurn?: () => boolean;
}

interface ExecutionConnection {
  key: string;
  source: EventSource;
  timer: ReturnType<typeof setTimeout>;
}

type SummaryToolState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

export interface ToolRuntime {
  hasActiveTools: () => boolean;
  recordToolUse: (call: {
    id?: string;
    name?: string;
    input?: unknown;
    executionId?: string;
  }) => null;
  recordToolProgress: (progress: ToolProgress) => void;
  recordToolCallDelta: (delta: ToolCallDelta) => void;
  recordExecutionStart: (event: ExecutionEvent) => void;
  recordToolResult: (result: ToolResult) => void;
  recordToolApproval: (approval: ToolApproval) => void;
  /** Answer a pending approval from a declarative row. */
  decideApproval: (toolCallId: string, decision: string) => Promise<void>;
  /** `event: agent_step` — persist one Codex step. */
  recordAgentStep: (step: AgentStepFrame) => void;
  /** `event: agent_plan` — update the run's persisted checklist. */
  recordAgentPlan: (plan: AgentPlanFrame) => void;
  /** Accepted for compatibility; grouping is derived by React, so a no-op. */
  noteTextDelta: () => void;
  cancel: () => void;
  dispose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function findEntry(message: ToolMessage | null, id: string): ToolCallEntry | null {
  if (!message || !Array.isArray(message.toolCalls)) return null;
  for (let i = 0; i < message.toolCalls.length; i++) {
    if (message.toolCalls[i].id === id) return message.toolCalls[i];
  }
  return null;
}

function getRun(entry: ToolCallEntry | null): ToolRun | null {
  return entry && entry._run ? entry._run : null;
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
  const stillOwnsSlot = options.stillOwnsSlot || (() => true);
  const readMessage = options.getMessage || ((): ToolMessage | null => null);
  let draft: ToolMessage | null = null;
  function getMessage(): ToolMessage | null {
    const current = readMessage();
    if (!current) return null;
    if (!draft) {
      draft = {
        clientId: current.clientId, id: current.id, _toolRunRev: current._toolRunRev,
        toolCalls: (current.toolCalls || []).map((entry) => {
          const copy = copyToolData(entry);
          if (entry._run) setRun(copy, entry._run.phase, copyToolData(entry._run));
          return copy;
        }),
      };
    }
    if (String(current.clientId || current.id || '') !== String(draft.clientId || draft.id || '')) return null;
    return draft;
  }
  const onToolActivity = options.onToolActivity || (() => { /* no-op */ });
  const requestFrame = options.requestAnimationFrame || function (callback: () => void) {
    return requestAnimationFrame(callback);
  };
  const cancelFrame = options.cancelAnimationFrame || function (id: number) {
    cancelAnimationFrame(id);
  };
  const EventSourceImpl = options.EventSource || (typeof EventSource !== 'undefined' ? EventSource : null);
  const useExecutionEventSource = options.useExecutionEventSource === true;
  /* Split-point chooser. A null row means "record the offset only", which
     is the only mode this runtime operates in. */
  const onInlineTool = options.onInlineTool || (function (): number | null { return null; });

  let disposed = false;
  const pendingDeltas: ToolCallDelta[] = [];
  let deltaFrame: number | null = null;
  let toolPublishFrame: number | null = null;
  let pendingToolPublish: ToolMessage | null = null;
  const executionConnections = new Map<string, ExecutionConnection>();
  let postFinishApprovalMessage: ToolMessage | null = null;

  /**
   * Choose the split point and put it on the entry. Waiting for finish()'s
   * write-back loop meant a turn that never reached finish() (abort,
   * navigation, a dropped SSE) persisted calls with no offset, and any
   * renderer working from toolCalls[] mid-stream would not know where the
   * row belongs.
   */
  function recordRowOffset(entry: ToolCallEntry): number | null {
    let offset: number | null = null;
    try { offset = onInlineTool({ id: entry.id, name: entry.name }, null); } catch (_) { /* no host */ }
    if (typeof offset === 'number') entry.textOffset = offset;
    notifyToolRun(getMessage());
    return offset;
  }

  function activeMessage(): ToolMessage | null {
    if (disposed) return null;
    if (postFinishApprovalMessage) {
      const current = getMessage() || null;
      if (!current) return null;
      /* P_tool-postfinish-approval — the store replaces the message
         object on every update (`{ ...current, ...patch }`), and
         main.js's finish() applies its final html/rawText patch AFTER
         this runtime's dispose() captured postFinishApprovalMessage.
         A strict identity check (`current === postFinishApprovalMessage`)
         would therefore always fail for a finished turn and silently
         drop the approval POST. Compare ownership by clientId/id
         instead: that survives the object swap while still refusing to
         act on a different message (e.g. after a session switch). */
      const pinned = String(postFinishApprovalMessage.clientId || postFinishApprovalMessage.id || '');
      const now = String(current.clientId || current.id || '');
      return pinned && pinned === now ? current : null;
    }
    if (!stillOwnsSlot()) return null;
    return getMessage() || null;
  }

  function publishToolSummary(
    message: ToolMessage | null,
    entry: ToolCallEntry,
    state: SummaryToolState,
    status?: string,
  ): void {
    const messageId = String(message?.clientId || message?.id || '');
    if (!messageId) return;
    publishThinkingPanelEvent({
      type: 'tool-activity',
      messageId,
      id: entry.id,
      name: entry.name,
      input: entry.input,
      output: entry.output,
      results: entry.results,
      status,
      state,
    });
  }

  /* Publish detached tool snapshots before announcing the UI revision.
     Mutable queues, buffers and event payloads stay private to this runtime. */
  function commitToolRunSnapshot(message: ToolMessage | null): void {
    if (!message) return;
    const current = readMessage();
    if (!current || getMessage() !== message) return;
    message._toolRunRev = (current._toolRunRev || 0) + 1;
    options.updateMessage({
      toolCalls: mergeToolCalls(current.toolCalls, message.toolCalls || []),
      _toolRunRev: message._toolRunRev,
    });
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

  function flushPendingToolPublish(): void {
    const pending = pendingToolPublish;
    if (toolPublishFrame !== null) cancelFrame(toolPublishFrame);
    toolPublishFrame = null;
    pendingToolPublish = null;
    if (pending) commitToolRunSnapshot(pending);
  }

  /* Progress can arrive once per stdout flush. Keep the runtime draft current,
     then project it once at the next paint. Important transitions call this
     without `defer` and therefore cancel the queued frame and publish the
     newest complete state synchronously. In non-browser harnesses with no
     animation-frame API, retain synchronous behavior. */
  function notifyToolRun(message: ToolMessage | null, defer = false): void {
    if (!message) return;
    const canSchedule = typeof options.requestAnimationFrame === 'function' ||
      typeof requestAnimationFrame === 'function';
    if (!defer || !canSchedule) {
      if (toolPublishFrame !== null) cancelFrame(toolPublishFrame);
      toolPublishFrame = null;
      pendingToolPublish = null;
      commitToolRunSnapshot(message);
      return;
    }

    pendingToolPublish = message;
    if (toolPublishFrame !== null) return;
    let firedSynchronously = false;
    try {
      const handle = requestFrame(() => {
        firedSynchronously = true;
        toolPublishFrame = null;
        const pending = pendingToolPublish;
        pendingToolPublish = null;
        commitToolRunSnapshot(pending);
      });
      if (!firedSynchronously) toolPublishFrame = handle;
    } catch (_) {
      pendingToolPublish = null;
      commitToolRunSnapshot(message);
    }
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

  /* Orphan/pending queues are keyed by tool-call id and only grow while
   * the matching tool_use is in flight. Cap both dimensions so a turn that
   * emits thousands of pre-use frames (reconnect storm, runaway upstream)
   * degrades to dropping the oldest instead of growing the message object
   * without bound. */
  const ORPHAN_KEY_CAP = 50;
  const ORPHAN_LIST_CAP = 50;
  const PENDING_LIST_CAP = 200;
  function pushPending(entry: ToolCallEntry, key: '_pendingDeltas' | '_pendingProgress', value: never): void {
    const list = (entry[key] || (entry[key] = [] as never)) as unknown as never[];
    list.push(value);
    if (list.length > PENDING_LIST_CAP) list.splice(0, list.length - PENDING_LIST_CAP);
  }
  function pushOrphan(message: ToolMessage, bucket: '_orphanProgress' | '_orphanDeltas' | '_orphanApprovals', id: string, value: never): void {
    const store = message as unknown as Record<string, Record<string, never[]>>;
    if (!store[bucket] || typeof store[bucket] !== 'object' || Array.isArray(store[bucket])) {
      store[bucket] = {};
    }
    const map = store[bucket];
    if (!Array.isArray(map[id])) {
      if (Object.keys(map).length >= ORPHAN_KEY_CAP) {
        const oldest = Object.keys(map)[0];
        if (oldest) delete map[oldest];
      }
      map[id] = [];
    }
    const list = map[id];
    list.push(value);
    if (list.length > ORPHAN_LIST_CAP) list.splice(0, list.length - ORPHAN_LIST_CAP);
  }

  const progressRuntime = createProgressRuntime({
    activeMessage,
    findEntry,
    pushOrphan: (message, id, progress) => pushOrphan(message, '_orphanProgress', id, progress as never),
    setRun: (entry, phase, patch) => setRun(entry, phase, patch),
    notifyToolRun,
  });
  const renderProgress = progressRuntime.renderProgress;

  const resultRuntime = createToolResultRuntime({
    activeMessage,
    executionConnections,
    closeConnection,
    findEntry,
    setPreparing: (entry) => { setRun(entry, TOOL_RUN_PHASES.preparing); },
    recordRowOffset,
    getRun,
    isTerminalToolPhase,
    renderProgress,
    setRun: (entry, phase, patch) => setRun(entry, phase, patch),
    publishToolSummary,
    notifyToolRun,
    translate,
  });
  const agentFrames = createAgentFrameRuntime({
    activeMessage,
    findEntry,
    onToolActivity: () => onToolActivity(),
    notifyToolRun,
  });
  const approvalRuntime = createApprovalRuntime({
    activeMessage,
    findEntry,
    notifyToolRun,
    pushOrphan,
    recordToolResult: resultRuntime.recordToolResult,
    translate,
  });

  const toolUseRuntime = createToolUseRuntime({
    activeMessage,
    findEntry,
    onToolActivity,
    copyToolData,
    getRun,
    isTerminalToolPhase,
    setPreparing: (entry) => { setRun(entry, TOOL_RUN_PHASES.preparing); },
    pendingDeltas,
    pushPending: (entry, key, value) => pushPending(entry, key, value as never),
    recordRowOffset,
    renderProgress,
    renderApproval: approvalRuntime.renderApproval,
    drainAgentFrames: agentFrames.drainAgentFrames,
    connectExecution,
    publishToolSummary,
    notifyToolRun,
  });

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

    /* P_tool-live-preview — put the streamed arguments on the entry. The
       declarative row paints its live code / command preview from
       `argumentsText`, so a preview survives a call whose row is not
       mounted yet (or is collapsed inside a group). */
    let argumentsChanged = false;
    latest.forEach(function (delta: ToolCallDelta) {
      if (!delta || !delta.id || typeof delta.arguments !== 'string') return;
      const entry = findEntry(message, delta.id);
      if (!entry || entry.argumentsText === delta.arguments) return;
      entry.argumentsText = delta.arguments;
      argumentsChanged = true;
    });
    if (argumentsChanged) notifyToolRun(message);

    latest.forEach(function (delta) {
      if (!delta || !delta.id) return;
      const entry = findEntry(message, delta.id);
      if (entry) {
        pushPending(entry, '_pendingDeltas', delta as never);
        return;
      }
      pushOrphan(message, '_orphanDeltas', delta.id, delta as never);
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
      /* Watchdog for a dead channel only — the default execution budget
         is 120s (EXEC_TIMEOUT_MS_DEFAULT) and a call may specify more,
         so a shorter timer here would report a healthy long-running
         execution as failed and the real result would be dropped by
         _toolResultApplied. Budget + grace is the safe bound. */
      connection.timer = setTimeout(function () {
        if (!disposed) {
          resultRuntime.recordToolResult({
            id: toolCallId,
            ok: false,
            status: 'failed',
            output: '',
            stderr: '',
            error: 'execution_sse_timeout: backend did not respond within 150s',
            artifacts: [],
            durationMs: 150000,
            executionId: executionId,
            name: 'code_interpreter',
          });
        }
        closeConnection(connection);
      }, 150000);
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
          resultRuntime.recordToolResult({
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
            resultRuntime.recordToolResult({ id: toolCallId, ok: false, status: 'failed', output: '', error: data.error, artifacts: [] });
          }
        } catch (_) { /* ignore */ }
        closeConnection(connection);
      });
    } catch (_) {
      console.log('[execution-sse] failed');
    }
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
      publishToolSummary(message, entry, 'running');
      notifyToolRun(message);
    }
    connectExecution(event.executionId, event.id);
  }

  function dispose(): void {
    if (disposed) return;
    /* A turn can finish before the scheduled progress paint. Commit the
       latest draft before finishRender reads the session snapshot. */
    flushPendingToolPublish();
    const message = getMessage();
    const hasPendingApproval = !!(message && Array.isArray(message.toolCalls) && message.toolCalls.some((entry) => (
      !!(entry && entry.approval && (!entry.approval.status || entry.approval.status === 'pending'))
    )));
    if (hasPendingApproval) {
      /* The stream can finish while a Codex turn is paused for approval.
       * Keep the runtime state alive so the declarative approval row stays
       * actionable after finish(). */
      postFinishApprovalMessage = message;
      pendingDeltas.length = 0;
      Array.from(executionConnections.values()).forEach(closeConnection);
      executionConnections.clear();
      return;
    }
    disposed = true;
    pendingDeltas.length = 0;
    if (deltaFrame != null) {
      cancelFrame(deltaFrame);
      deltaFrame = null;
    }
    Array.from(executionConnections.values()).forEach(closeConnection);
    executionConnections.clear();
  }

  /* Text streaming after a tool row used to break live grouping. Grouping is
     derived by the declarative renderer from adjacency in rawText, so this
     is a no-op kept for the public interface. */
  function noteTextDelta(): void { /* no-op */ }

  function cancel(): void {
    const message = stillOwnsSlot() ? getMessage() : null;
    if (message && Array.isArray(message.toolCalls)) {
      for (let i = 0; i < message.toolCalls.length; i++) {
        const entry = message.toolCalls[i];
        if (!entry || (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase))) continue;
        setRun(entry, TOOL_RUN_PHASES.cancelled, { endedAt: Date.now() });
        publishToolSummary(message, entry, 'stopped', 'cancelled');
      }
      /* Runs settle as stopped, not spinning: the declarative renderer reads
         run.phase off the entry, so the cancel has to publish. */
      notifyToolRun(message);
    }
    dispose();
  }

  return {
    hasActiveTools,
    recordToolUse: toolUseRuntime.recordToolUse,
    recordToolProgress,
    recordToolCallDelta,
    recordExecutionStart,
    recordToolResult: resultRuntime.recordToolResult,
    recordToolApproval: approvalRuntime.recordToolApproval,
    decideApproval: approvalRuntime.decideApproval,
    recordAgentStep: agentFrames.recordAgentStep,
    recordAgentPlan: agentFrames.recordAgentPlan,
    noteTextDelta,
    cancel,
    dispose,
  };
}
