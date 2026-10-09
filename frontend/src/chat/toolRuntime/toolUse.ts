import type { ToolRun } from '../toolRunState.js';
import type { ToolApproval } from './approvals.js';

interface ToolUseInput {
  id?: string;
  name?: string;
  input?: unknown;
  executionId?: string;
}

interface ToolCallDelta {
  id: string;
  index: number;
  arguments?: string;
  final?: boolean;
  name?: string;
}

interface ToolProgress {
  id: string;
  phase: string;
  elapsedMs?: number;
  chunk?: string;
}

interface ToolUseEntry {
  id: string;
  name: string;
  input: unknown | null;
  output: string | null;
  isError: boolean;
  artifacts: Array<{ id: string; mimeType: string | null; name: string | null }>;
  executionId?: string;
  textOffset?: number;
  argumentsText?: string;
  _run?: ToolRun;
  _pendingDeltas?: ToolCallDelta[];
  _pendingProgress?: ToolProgress[];
  _toolResultApplied?: boolean;
}

interface ToolUseMessage<TEntry extends ToolUseEntry> {
  toolCalls?: TEntry[];
  _orphanDeltas?: Record<string, ToolCallDelta[]>;
  _orphanProgress?: Record<string, ToolProgress[]>;
  _orphanApprovals?: Record<string, ToolApproval[]>;
}

interface ToolUseRuntimeOptions<
  TEntry extends ToolUseEntry,
  TMessage extends ToolUseMessage<TEntry>,
> {
  activeMessage: () => TMessage | null;
  findEntry: (message: TMessage | null, id: string) => TEntry | null;
  onToolActivity: (toolName?: string) => void;
  copyToolData: <T>(value: T) => T;
  getRun: (entry: TEntry | null) => ToolRun | null;
  isTerminalToolPhase: (phase: string) => boolean;
  setPreparing: (entry: TEntry) => void;
  pendingDeltas: ToolCallDelta[];
  pushPending: (
    entry: TEntry,
    key: '_pendingDeltas' | '_pendingProgress',
    value: ToolCallDelta | ToolProgress,
  ) => void;
  recordRowOffset: (entry: TEntry) => number | null;
  renderProgress: (progress: ToolProgress, skipQueuedDrain?: boolean) => void;
  renderApproval: (approval: ToolApproval) => void;
  drainAgentFrames: (entry: TEntry, message: TMessage) => void;
  connectExecution: (executionId: string, toolCallId: string) => void;
  publishToolSummary: (message: TMessage, entry: TEntry, state: 'running') => void;
  notifyToolRun: (message: TMessage | null) => void;
}

function updateExistingEntry<TEntry extends ToolUseEntry, TMessage extends ToolUseMessage<TEntry>>(
  options: ToolUseRuntimeOptions<TEntry, TMessage>,
  message: TMessage,
  entry: TEntry,
  call: ToolUseInput,
): void {
  entry.name = String(call.name || entry.name);
  if (call.input != null) entry.input = options.copyToolData(call.input);
  if (call.executionId) {
    entry.executionId = call.executionId;
    const run = options.getRun(entry);
    if (!run || !options.isTerminalToolPhase(run.phase)) {
      options.connectExecution(call.executionId, entry.id);
    }
  }
  options.publishToolSummary(message, entry, 'running');
  options.notifyToolRun(message);
}

function createEntry<TEntry extends ToolUseEntry>(call: ToolUseInput, id: string): TEntry {
  return {
    id,
    name: String(call.name),
    input: call.input == null ? null : call.input,
    output: null,
    isError: false,
    artifacts: [],
  } as unknown as TEntry;
}

function drainPreUseDeltas<TEntry extends ToolUseEntry>(
  pendingDeltas: ToolCallDelta[],
  entry: TEntry,
  pushPending: ToolUseRuntimeOptions<TEntry, ToolUseMessage<TEntry>>['pushPending'],
): void {
  if (!pendingDeltas.length) return;
  const kept: ToolCallDelta[] = [];
  for (const delta of pendingDeltas) {
    if (delta && delta.id === entry.id) pushPending(entry, '_pendingDeltas', delta);
    else kept.push(delta);
  }
  pendingDeltas.length = 0;
  pendingDeltas.push(...kept);
  const queued = entry._pendingDeltas || [];
  const latest = queued[queued.length - 1];
  if (latest && latest.arguments) {
    if (!entry.input || typeof entry.input !== 'object') entry.input = {};
    const input = entry.input as Record<string, unknown>;
    if (!input.__raw) input.__raw = latest.arguments;
  }
}

function replayPendingDeltas<TEntry extends ToolUseEntry, TMessage extends ToolUseMessage<TEntry>>(
  options: ToolUseRuntimeOptions<TEntry, TMessage>,
  message: TMessage,
  entry: TEntry,
): void {
  const orphaned = message._orphanDeltas?.[entry.id];
  if (orphaned) delete message._orphanDeltas![entry.id];
  if (Array.isArray(orphaned)) {
    for (const delta of orphaned) options.pushPending(entry, '_pendingDeltas', delta);
  }
  const queued = entry._pendingDeltas;
  if (!queued || !queued.length) return;
  for (const delta of queued.splice(0)) {
    if (delta.arguments) entry.argumentsText = delta.arguments;
  }
  options.notifyToolRun(message);
}

function replayPendingProgress<TEntry extends ToolUseEntry, TMessage extends ToolUseMessage<TEntry>>(
  options: ToolUseRuntimeOptions<TEntry, TMessage>,
  message: TMessage,
  entry: TEntry,
): void {
  const queued = entry._pendingProgress?.splice(0) || [];
  const orphaned = message._orphanProgress?.[entry.id];
  if (orphaned) delete message._orphanProgress![entry.id];
  for (const progress of [...queued, ...(orphaned || [])]) options.renderProgress(progress, true);
}

function replayApprovals<TEntry extends ToolUseEntry, TMessage extends ToolUseMessage<TEntry>>(
  options: ToolUseRuntimeOptions<TEntry, TMessage>,
  message: TMessage,
  entry: TEntry,
): void {
  const queued = message._orphanApprovals?.[entry.id];
  if (queued) delete message._orphanApprovals![entry.id];
  for (const approval of queued || []) options.renderApproval({ ...approval, id: entry.id });
}

/** Record a tool_use once and replay any data frames that arrived before it. */
export function createToolUseRuntime<
  TEntry extends ToolUseEntry,
  TMessage extends ToolUseMessage<TEntry>,
>(options: ToolUseRuntimeOptions<TEntry, TMessage>) {
  function recordToolUse(call: ToolUseInput): null {
    if (!call || !call.name || !options.activeMessage()) return null;
    /* Activity can replace the immutable message, so always re-read it. */
    options.onToolActivity(call.name);
    const message = options.activeMessage();
    if (!message) return null;
    const id = String(call.id || ('tc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)));
    const existing = options.findEntry(message, id);
    if (existing) {
      updateExistingEntry(options, message, existing, call);
      return null;
    }

    const entry = createEntry<TEntry>(call, id);
    if (call.input != null) entry.input = options.copyToolData(call.input);
    options.setPreparing(entry);
    drainPreUseDeltas(options.pendingDeltas, entry, options.pushPending);
    if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
    message.toolCalls.push(entry);
    options.recordRowOffset(entry);
    replayPendingDeltas(options, message, entry);
    replayPendingProgress(options, message, entry);
    replayApprovals(options, message, entry);
    options.drainAgentFrames(entry, message);
    if (call.name === 'code_interpreter' && call.executionId) {
      entry.executionId = call.executionId;
      options.connectExecution(call.executionId, entry.id);
    }
    options.publishToolSummary(message, entry, 'running');
    options.notifyToolRun(message);
    return null;
  }

  return { recordToolUse };
}
