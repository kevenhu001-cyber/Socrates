/**
 * chat/toolRuntime.ts — per-message tool-call state.
 *
 * Data-only orchestrator for the tool lifecycle:
 *   tool_call_delta -> tool_use -> tool_progress -> tool_result
 * plus approval decisions and Codex agent steps/plans.
 *
 * Rendering belongs to react/tool-run, which draws rows, groups, approval
 * panels and step lists from `message.toolCalls[]`. This module never
 * touches the DOM: every mutation lands on the entry data and announces
 * itself through `notifyToolRun` (a `_toolRunRev` bump plus a
 * `tool-run-updated` bridge event, coalesced to one repaint per frame by
 * the store). The chat message controller supplies ownership and the
 * textOffset callback; this module never reaches into global chat state
 * directly.
 *
 * What used to live here and where it went:
 *   inline rows / cards / approval panels / agent hosts — react/tool-run
 *   row copy — react/tool-run/labels.ts (single source)
 *   category table — render/toolCategory.ts (single source)
 */
/* Type-only: the event shape is owned by the React store, but this module is
   loaded straight from Node by test/toolRuntime.test.mjs, so the runtime
   linkage stays the `window.__socratesReactChatBridge` global (same hand-off
   `publishReactChatRuntime` in main.js and ui/thinkingPill.js use). */
import type { ChatRuntimeEvent } from '../react/types/domain';

import type { AgentPlanData, AgentStepData } from '../ui/agentSteps.js';
import {
  TOOL_RUN_PHASES,
  isTerminalToolPhase,
  phaseFromProgress,
  transitionToolRun,
} from './toolRunState.js';
import type { ToolRun } from './toolRunState.js';
import { createLiveOutputBuffer, renderLivePreview } from './liveOutput.js';
import type { LiveOutputBufferHandle } from './liveOutput.js';
import { apiFetch } from '../util/api.js';

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
   * without owning a DOM node.
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
  /** Accepted for compatibility; ignored — nothing is mounted. */
  body?: HTMLElement | null;
  stillOwnsSlot?: () => boolean;
  getMessage?: () => ToolMessage | null;
  /** Accepted for compatibility; ignored — nothing is mounted. */
  ensureToolContainer?: () => HTMLElement;
  onToolActivity?: () => void;
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
  const getMessage = options.getMessage || ((): ToolMessage | null => null);
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

  function setApprovalUi(approvalId: string, text: string, state?: string, disabled = true): void {
    /* Record the transition on the entry: the declarative row paints its
       status line from `approval.ui`. */
    const message = activeMessage();
    const calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
    for (const entry of calls) {
      if (!entry || !entry.approval || String(entry.approval.approvalId) !== String(approvalId)) continue;
      entry.approval = { ...entry.approval, ui: { text, state, disabled } };
    }
    if (message) notifyToolRun(message);
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
   * row, whose buttons are React elements with their own handlers.
   * Rejects with the transport error after recording it in
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

  function renderProgress(progress: ToolProgress, skipQueuedDrain?: boolean): void {
    const message = activeMessage();
    if (!message || !progress || !progress.id) return;
    const entry = findEntry(message, progress.id);
    if (!entry) {
      pushOrphan(message, '_orphanProgress', progress.id, progress as never);
      return;
    }
    entry._progressPhase = progress.phase;
    setRun(entry, phaseFromProgress(progress), { elapsedMs: progress.elapsedMs || 0 });
    /* Keep the bounded output buffer on the entry: the declarative row
       paints its live tail from `_liveOutput`, so a run whose row is
       collapsed in a group (or not mounted yet) still has what it printed
       when it appears. */
    if (progress.chunk && (progress.phase === 'stdout' || progress.phase === 'stderr' || progress.phase === 'timeout_warning')) {
      const buffer = entry._liveBuffer || (entry._liveBuffer = createLiveOutputBuffer());
      buffer.push(progress.phase === 'timeout_warning' ? '\n[' + progress.chunk + ']\n' : progress.chunk);
      entry._liveOutput = renderLivePreview(buffer.preview());
    }
    notifyToolRun(message);
    if (!skipQueuedDrain && entry._pendingProgress && entry._pendingProgress.length) {
      const queued = entry._pendingProgress.splice(0);
      for (let i = 0; i < queued.length; i++) renderProgress(queued[i], true);
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
  }): null {
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
      return null;
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
          pushPending(entry, '_pendingDeltas', delta as never);
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
    /* Record the split point on the data the moment it is chosen (see
       recordRowOffset): the declarative renderer lays the row out from it. */
    recordRowOffset(entry);

    const orphanDeltas = message._orphanDeltas?.[entry.id];
    if (orphanDeltas) {
      delete message._orphanDeltas![entry.id];
    }
    if (Array.isArray(orphanDeltas) && orphanDeltas.length) {
      for (const d of orphanDeltas) pushPending(entry, '_pendingDeltas', d as never);
    }
    if (entry._pendingDeltas && entry._pendingDeltas.length) {
      const queuedDeltas = entry._pendingDeltas.splice(0);
      for (let deltaIndex = 0; deltaIndex < queuedDeltas.length; deltaIndex++) {
        if (queuedDeltas[deltaIndex].arguments) entry.argumentsText = queuedDeltas[deltaIndex].arguments;
      }
      notifyToolRun(message);
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
    notifyToolRun(message);
    return null;
  }

  /* ── Codex agent steps ──────────────────────────────────────────
     The workspace agent streams its own activity: each Codex thread item
     arrives as an `agent_step` frame and its todo list as `agent_plan`.
     Both are stored on the tool call so history replay and the share view
     can rebuild them without the live stream; react/tool-run renders them. */

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
    const liveEntry = message ? agentEntryFor(message, String(frame.id || '')) : null;
    if (!message || !liveEntry) return;
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
      pushOrphan(message, '_orphanApprovals', String(approval.id || approval.runId), approval as never);
      return;
    }
    const normalized = { ...approval, id: entry.id };
    entry.approval = normalized;
    /* Publish: the declarative row renders the panel from entry.approval. */
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
      /* A synthetic entry records where the message text currently ends.
         Persist the split point directly — a result can land after
         finish()'s inlineToolRows write-back loop has already run, and
         without textOffset the row would be lost on history replay. */
      const mountedOffset = recordRowOffset(entry);
      if (mountedOffset != null) entry.textOffset = mountedOffset;
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
    const duration = result.durationMs != null && result.durationMs > 0
      ? ' [' + (result.durationMs / 1000).toFixed(1) + 's]'
      : '';
    let display: string;
    if (awaitingApproval) {
      display = translate('tool.codexApprovalCopy', 'Review the action before it continues.');
    } else if (result.ok === false) {
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
    /* Everything the row reads (output / isError / results / artifacts /
       visualization) is on the entry by now, so this is the repaint point
       for the terminal state — it must fire before the early return below,
       otherwise a second result frame would leave the row spinning. */
    notifyToolRun(message);
    if (entry._toolResultApplied) return;
    if (!awaitingApproval) entry._toolResultApplied = true;
  }

  function dispose(): void {
    if (disposed) return;
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
      }
      /* Runs settle as stopped, not spinning: the declarative renderer reads
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
