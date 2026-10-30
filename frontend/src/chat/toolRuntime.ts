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

import type { AgentPlanData, AgentStepData } from '../ui/agentSteps.ts';
import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  transitionToolRun,
} from './toolRunState.ts';
import type { ToolRun } from './toolRunState.ts';
import type { LiveOutputBufferHandle } from './liveOutput.ts';
import { copyToolData, mergeToolCalls } from './toolRuntime/projection.ts';
import { createAgentFrameRuntime } from './toolRuntime/agentFrames.ts';
import type { AgentPlanFrame, AgentStepFrame } from './toolRuntime/agentFrames.ts';
import { createApprovalRuntime } from './toolRuntime/approvals.ts';
import type { ToolApproval } from './toolRuntime/approvals.ts';
import { createToolUseRuntime } from './toolRuntime/toolUse.ts';
import { createToolResultRuntime } from './toolRuntime/resultRuntime.ts';
import type { ToolResultInput } from './toolRuntime/resultProjection.ts';
import { createProgressRuntime } from './toolRuntime/progress.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';
export type { AgentPlanFrame, AgentStepFrame } from './toolRuntime/agentFrames.ts';

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
  visualizations?: unknown[];
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
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:222', 'expected');
    /* ignore */
  }
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

interface ToolRuntimeLifecycle {
  disposed: boolean;
  postFinishApprovalMessage: ToolMessage | null;
}

interface ToolRuntimeMessageReader {
  readMessage: () => ToolMessage | null;
  getMessage: () => ToolMessage | null;
}

function createToolRuntimeMessageReader(options: ToolRuntimeOptions): ToolRuntimeMessageReader {
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
  return { readMessage, getMessage };
}

interface ToolRuntimePublisher extends ToolRuntimeMessageReader {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  activeMessage: () => ToolMessage | null;
  commitToolRunSnapshot: (message: ToolMessage | null) => void;
  flushPendingToolPublish: () => void;
  notifyToolRun: (message: ToolMessage | null, defer?: boolean) => void;
}

function createToolRuntimePublisher(
  options: ToolRuntimeOptions,
  stillOwnsSlot: () => boolean,
  lifecycle: ToolRuntimeLifecycle,
): ToolRuntimePublisher {
  const { readMessage, getMessage } = createToolRuntimeMessageReader(options);
  const requestFrame = options.requestAnimationFrame || ((callback: () => void) => requestAnimationFrame(callback));
  const cancelFrame = options.cancelAnimationFrame || ((id: number) => cancelAnimationFrame(id));
  let toolPublishFrame: number | null = null;
  let pendingToolPublish: ToolMessage | null = null;

  function activeMessage(): ToolMessage | null {
    if (lifecycle.disposed) return null;
    if (lifecycle.postFinishApprovalMessage) {
      const current = getMessage();
      if (!current) return null;
      /* Store updates replace the object; ids preserve the turn's ownership. */
      const pinned = String(lifecycle.postFinishApprovalMessage.clientId || lifecycle.postFinishApprovalMessage.id || '');
      const now = String(current.clientId || current.id || '');
      return pinned && pinned === now ? current : null;
    }
    if (!stillOwnsSlot()) return null;
    return getMessage() || null;
  }

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
        : null) as { publish?: (event: ChatRuntimeEvent) => void } | null;
      if (bridge && typeof bridge.publish === 'function') bridge.publish(event);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:342');
      /* Listener errors must not break the stream. */
    }
  }

  function flushPendingToolPublish(): void {
    const pending = pendingToolPublish;
    if (toolPublishFrame !== null) cancelFrame(toolPublishFrame);
    toolPublishFrame = null;
    pendingToolPublish = null;
    if (pending) commitToolRunSnapshot(pending);
  }

  function notifyToolRun(message: ToolMessage | null, defer = false): void {
    if (!message) return;
    const canSchedule = typeof options.requestAnimationFrame === 'function'
      || typeof requestAnimationFrame === 'function';
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

  return {
    readMessage,
    getMessage,
    requestFrame,
    cancelFrame,
    activeMessage,
    commitToolRunSnapshot,
    flushPendingToolPublish,
    notifyToolRun,
  };
}

const ORPHAN_KEY_CAP = 50;
const ORPHAN_LIST_CAP = 50;
const PENDING_LIST_CAP = 200;

function pushPending(entry: ToolCallEntry, key: '_pendingDeltas' | '_pendingProgress', value: never): void {
  const list = (entry[key] || (entry[key] = [] as never)) as unknown as never[];
  list.push(value);
  if (list.length > PENDING_LIST_CAP) list.splice(0, list.length - PENDING_LIST_CAP);
}

function pushOrphan(
  message: ToolMessage,
  bucket: '_orphanProgress' | '_orphanDeltas' | '_orphanApprovals',
  id: string,
  value: never,
): void {
  const store = message as unknown as Record<string, Record<string, never[]>>;
  if (!store[bucket] || typeof store[bucket] !== 'object' || Array.isArray(store[bucket])) store[bucket] = {};
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

interface ToolDeltaFlushContext {
  activeMessage: () => ToolMessage | null;
  pendingDeltas: ToolCallDelta[];
  clearFrame: () => void;
  notifyToolRun: (message: ToolMessage | null) => void;
}

function flushToolCallDeltas(context: ToolDeltaFlushContext): void {
  context.clearFrame();
  const message = context.activeMessage();
  if (!message || !context.pendingDeltas.length) return;
  const latest = new Map<string, ToolCallDelta>();
  for (let i = 0; i < context.pendingDeltas.length; i++) {
    const delta = context.pendingDeltas[i];
    if (!delta) continue;
    latest.set((delta.id || '?') + ':' + (delta.index || 0), delta);
  }
  context.pendingDeltas.length = 0;

  let argumentsChanged = false;
  latest.forEach((delta) => {
    if (!delta || !delta.id || typeof delta.arguments !== 'string') return;
    const entry = findEntry(message, delta.id);
    if (!entry || entry.argumentsText === delta.arguments) return;
    entry.argumentsText = delta.arguments;
    argumentsChanged = true;
  });
  if (argumentsChanged) context.notifyToolRun(message);

  latest.forEach((delta) => {
    if (!delta || !delta.id) return;
    const entry = findEntry(message, delta.id);
    if (entry) {
      pushPending(entry, '_pendingDeltas', delta as never);
      return;
    }
    pushOrphan(message, '_orphanDeltas', delta.id, delta as never);
  });
}

function closeExecutionConnection(
  connections: Map<string, ExecutionConnection>,
  connection: ExecutionConnection,
): void {
  if (!connection) return;
  clearTimeout(connection.timer);
  try { connection.source.close(); } catch (_) {
    reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:471');
    /* A closed source is already settled. */
  }
  connections.delete(connection.key);
}

interface ExecutionConnectorContext {
  enabled: boolean;
  EventSourceImpl: typeof EventSource | null;
  isDisposed: () => boolean;
  connections: Map<string, ExecutionConnection>;
  closeConnection: (connection: ExecutionConnection) => void;
  recordToolResult: (result: ToolResult) => void;
  renderProgress: (progress: ToolProgress) => void;
}

function createExecutionConnector(context: ExecutionConnectorContext): (executionId: string, toolCallId: string) => void {
  return function connectExecution(executionId: string, toolCallId: string): void {
    if (!context.enabled || !executionId || !toolCallId || context.isDisposed() || !context.EventSourceImpl) return;
    const connectionKey = toolCallId + ':' + executionId;
    if (context.connections.has(connectionKey)) return;
    try {
      const source = new context.EventSourceImpl('/api/executions/' + encodeURIComponent(executionId) + '/stream');
      const connection: ExecutionConnection = { key: connectionKey, source, timer: null as unknown as ReturnType<typeof setTimeout> };
      context.connections.set(connectionKey, connection);
      connection.timer = setTimeout(() => {
        if (!context.isDisposed()) {
          context.recordToolResult({
            id: toolCallId, ok: false, status: 'failed', output: '', stderr: '',
            error: 'execution_sse_timeout: backend did not respond within 150s',
            artifacts: [], durationMs: 150000, executionId, name: 'code_interpreter',
          });
        }
        context.closeConnection(connection);
      }, 150000);
      source.addEventListener('progress', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as ToolProgress;
          data.id = toolCallId;
          context.renderProgress(data);
        } catch (_) {
          reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:509', 'expected');
          /* Ignore malformed execution progress. */
        }
      });
      source.addEventListener('result', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as ToolResult;
          context.recordToolResult({
            id: toolCallId,
            ok: data.status === 'completed',
            status: data.status,
            output: data.output || '(no output)',
            stderr: data.stderr || '',
            error: data.status !== 'completed' ? (data.error || data.status) : undefined,
            errorCode: data.errorCode || null,
            artifacts: (data as unknown as { artifactFileIds?: unknown[] }).artifactFileIds || [],
            durationMs: data.durationMs || 0,
            executionId,
            name: 'code_interpreter',
          });
        } catch (_) {
          reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:527', 'expected');
          /* Ignore malformed execution results. */
        }
        context.closeConnection(connection);
      });
      source.addEventListener('error', (event: MessageEvent) => {
        try {
          const data = event.data ? JSON.parse(event.data) as { error?: string } : null;
          if (data && data.error) {
            context.recordToolResult({
              id: toolCallId, ok: false, status: 'failed', output: '', error: data.error, artifacts: [],
            });
          }
        } catch (_) {
          reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:538', 'expected');
          /* Ignore malformed execution errors. */
        }
        context.closeConnection(connection);
      });
    } catch (_) {
      console.log('[execution-sse] failed');
    }
  };
}

interface ToolRuntimeHandlers {
  renderProgress: ReturnType<typeof createProgressRuntime>['renderProgress'];
  resultRuntime: ReturnType<typeof createToolResultRuntime>;
  agentFrames: {
    recordAgentStep: (frame: AgentStepFrame) => void;
    recordAgentPlan: (frame: AgentPlanFrame) => void;
    drainAgentFrames: (entry: ToolCallEntry, message: ToolMessage) => void;
  };
  approvalRuntime: ReturnType<typeof createApprovalRuntime>;
  toolUseRuntime: ReturnType<typeof createToolUseRuntime>;
  closeConnection: (connection: ExecutionConnection) => void;
  connectExecution: (executionId: string, toolCallId: string) => void;
}

function createToolRuntimeHandlers(context: {
  options: ToolRuntimeOptions;
  lifecycle: ToolRuntimeLifecycle;
  activeMessage: () => ToolMessage | null;
  executionConnections: Map<string, ExecutionConnection>;
  pendingDeltas: ToolCallDelta[];
  recordRowOffset: (entry: ToolCallEntry) => number | null;
  notifyToolRun: (message: ToolMessage | null, defer?: boolean) => void;
}): ToolRuntimeHandlers {
  const onToolActivity = context.options.onToolActivity || (() => { /* no-op */ });
  const EventSourceImpl = context.options.EventSource || (typeof EventSource !== 'undefined' ? EventSource : null);
  const progressRuntime = createProgressRuntime({
    activeMessage: context.activeMessage,
    findEntry,
    pushOrphan: (message, id, progress) => pushOrphan(message, '_orphanProgress', id, progress as never),
    setRun: (entry, phase, patch) => setRun(entry, phase, patch),
    notifyToolRun: context.notifyToolRun,
  });
  const renderProgress = progressRuntime.renderProgress;
  const closeConnection = (connection: ExecutionConnection): void => {
    closeExecutionConnection(context.executionConnections, connection);
  };
  let writeToolResult: (result: ToolResult) => void = () => undefined;
  const connectExecution = createExecutionConnector({
    enabled: context.options.useExecutionEventSource === true,
    EventSourceImpl,
    isDisposed: () => context.lifecycle.disposed,
    connections: context.executionConnections,
    closeConnection,
    recordToolResult: (result) => writeToolResult(result),
    renderProgress,
  });
  const resultRuntime = createToolResultRuntime({
    activeMessage: context.activeMessage,
    executionConnections: context.executionConnections,
    closeConnection,
    findEntry,
    setPreparing: (entry) => { setRun(entry, TOOL_RUN_PHASES.preparing); },
    recordRowOffset: context.recordRowOffset,
    getRun,
    isTerminalToolPhase,
    renderProgress,
    setRun: (entry, phase, patch) => setRun(entry, phase, patch),
    notifyToolRun: context.notifyToolRun,
    translate,
  });
  writeToolResult = resultRuntime.recordToolResult;
  const agentFrames = createAgentFrameRuntime<ToolCallEntry, ToolMessage>({
    activeMessage: context.activeMessage,
    findEntry,
    onToolActivity: () => onToolActivity(),
    notifyToolRun: context.notifyToolRun,
  });
  const approvalRuntime = createApprovalRuntime({
    activeMessage: context.activeMessage,
    findEntry,
    notifyToolRun: context.notifyToolRun,
    pushOrphan,
    recordToolResult: resultRuntime.recordToolResult,
    translate,
  });
  const toolUseRuntime = createToolUseRuntime({
    activeMessage: context.activeMessage,
    findEntry,
    onToolActivity,
    copyToolData,
    getRun,
    isTerminalToolPhase,
    setPreparing: (entry) => { setRun(entry, TOOL_RUN_PHASES.preparing); },
    pendingDeltas: context.pendingDeltas,
    pushPending: (entry, key, value) => pushPending(entry, key, value as never),
    recordRowOffset: context.recordRowOffset,
    renderProgress,
    renderApproval: approvalRuntime.renderApproval,
    drainAgentFrames: agentFrames.drainAgentFrames,
    connectExecution,
    notifyToolRun: context.notifyToolRun,
  });
  return { renderProgress, resultRuntime, agentFrames, approvalRuntime, toolUseRuntime, closeConnection, connectExecution };
}

function createExecutionStartHandler(
  activeMessage: () => ToolMessage | null,
  connectExecution: (executionId: string, toolCallId: string) => void,
  notifyToolRun: (message: ToolMessage | null) => void,
): (event: ExecutionEvent) => void {
  return function recordExecutionStart(event: ExecutionEvent): void {
    const message = activeMessage();
    if (!message || !event || !event.executionId || !event.id) return;
    const entry = findEntry(message, event.id);
    if (entry) {
      entry.executionId = event.executionId;
      if (getRun(entry) && isTerminalToolPhase(getRun(entry)!.phase)) return;
      setRun(entry, TOOL_RUN_PHASES.running);
      notifyToolRun(message);
    }
    connectExecution(event.executionId, event.id);
  };
}

/* ------------------------------------------------------------------ */
/*  createToolRuntime                                                  */
/* ------------------------------------------------------------------ */

export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  const stillOwnsSlot = options.stillOwnsSlot || (() => true);
  const lifecycle: ToolRuntimeLifecycle = { disposed: false, postFinishApprovalMessage: null };
  const publisher = createToolRuntimePublisher(options, stillOwnsSlot, lifecycle);
  const {
    getMessage, requestFrame, cancelFrame, activeMessage,
    flushPendingToolPublish, notifyToolRun,
  } = publisher;
  /* Split-point chooser. A null row means "record the offset only", which
     is the only mode this runtime operates in. */
  const onInlineTool = options.onInlineTool || (function (): number | null { return null; });

  const pendingDeltas: ToolCallDelta[] = [];
  let deltaFrame: number | null = null;
  const executionConnections = new Map<string, ExecutionConnection>();

  /**
   * Choose the split point and put it on the entry. Waiting for finish()'s
   * write-back loop meant a turn that never reached finish() (abort,
   * navigation, a dropped SSE) persisted calls with no offset, and any
   * renderer working from toolCalls[] mid-stream would not know where the
   * row belongs.
   */
  function recordRowOffset(entry: ToolCallEntry): number | null {
    let offset: number | null = null;
    try { offset = onInlineTool({ id: entry.id, name: entry.name }, null); } catch (_) {
      reportEmptyCatch(_, 'empty catch: chat/toolRuntime.ts:690');
      /* no host */
    }
    if (typeof offset === 'number') entry.textOffset = offset;
    notifyToolRun(getMessage());
    return offset;
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
  const handlers = createToolRuntimeHandlers({
    options,
    lifecycle,
    activeMessage,
    executionConnections,
    pendingDeltas,
    recordRowOffset,
    notifyToolRun,
  });
  const {
    renderProgress, resultRuntime, agentFrames, approvalRuntime,
    toolUseRuntime, closeConnection, connectExecution,
  } = handlers;

  function flushDeltas(): void {
    flushToolCallDeltas({
      activeMessage,
      pendingDeltas,
      clearFrame: () => { deltaFrame = null; },
      notifyToolRun,
    });
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

  const recordExecutionStart = createExecutionStartHandler(activeMessage, connectExecution, notifyToolRun);

  function dispose(): void {
    if (lifecycle.disposed) return;
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
      lifecycle.postFinishApprovalMessage = message;
      pendingDeltas.length = 0;
      Array.from(executionConnections.values()).forEach(closeConnection);
      executionConnections.clear();
      return;
    }
    lifecycle.disposed = true;
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
