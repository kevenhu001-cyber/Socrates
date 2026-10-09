import type { ToolRun } from '../toolRunState.js';
import { projectToolResult } from './resultProjection.js';
import type { ToolResultInput } from './resultProjection.js';

interface ResultArtifact {
  id: string;
  mimeType: string | null;
  name: string | null;
}

interface ResultToolEntry {
  id: string;
  name: string;
  input: unknown | null;
  output: string | null;
  isError: boolean;
  artifacts: ResultArtifact[];
  executionId?: string;
  textOffset?: number;
  _run?: ToolRun;
  _pendingProgress?: Array<{ id: string; phase: string; elapsedMs?: number; chunk?: string }>;
  _toolResultApplied?: boolean;
}

interface ResultMessage<TEntry extends ResultToolEntry> {
  toolCalls?: TEntry[];
}

interface ResultConnection {
  key: string;
}

type SummaryToolState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

interface ToolResultRuntimeOptions<
  TEntry extends ResultToolEntry,
  TMessage extends ResultMessage<TEntry>,
  TConnection extends ResultConnection,
> {
  activeMessage: () => TMessage | null;
  executionConnections: Map<string, TConnection>;
  closeConnection: (connection: TConnection) => void;
  findEntry: (message: TMessage | null, id: string) => TEntry | null;
  setPreparing: (entry: TEntry) => void;
  recordRowOffset: (entry: TEntry) => number | null;
  getRun: (entry: TEntry | null) => ToolRun | null;
  isTerminalToolPhase: (phase: string) => boolean;
  renderProgress: (progress: { id: string; phase: string; elapsedMs?: number; chunk?: string }, skipQueuedDrain?: boolean) => void;
  setRun: (entry: TEntry, phase: string, patch?: Partial<ToolRun>) => ToolRun | null;
  publishToolSummary: (message: TMessage, entry: TEntry, state: SummaryToolState, status?: string) => void;
  notifyToolRun: (message: TMessage | null) => void;
  translate: (key: string, fallback: string) => string;
}

/** Own terminal-result idempotency, field mapping and summary publication. */
export function createToolResultRuntime<
  TEntry extends ResultToolEntry,
  TMessage extends ResultMessage<TEntry>,
  TConnection extends ResultConnection,
>(options: ToolResultRuntimeOptions<TEntry, TMessage, TConnection>) {
  function closeResultConnections(toolCallId: string): void {
    for (const connection of Array.from(options.executionConnections.values())) {
      if (connection.key.indexOf(String(toolCallId) + ':') === 0) options.closeConnection(connection);
    }
  }

  function ensureEntry(message: TMessage, result: ToolResultInput): TEntry {
    const existing = options.findEntry(message, result.id);
    if (existing) return existing;
    const entry = {
      id: String(result.id),
      name: result.name || 'tool',
      input: null,
      output: null,
      isError: false,
      artifacts: [],
    } as unknown as TEntry;
    if (!Array.isArray(message.toolCalls)) message.toolCalls = [];
    message.toolCalls.push(entry);
    options.setPreparing(entry);
    /* A late result can arrive after finish()'s offset write-back, so stamp
       its split point now for history replay. */
    const mountedOffset = options.recordRowOffset(entry);
    if (mountedOffset != null) entry.textOffset = mountedOffset;
    return entry;
  }

  function flushPendingProgress(entry: TEntry): void {
    const queued = entry._pendingProgress?.splice(0) || [];
    for (const progress of queued) options.renderProgress(progress, true);
  }

  function recordToolResult(result: ToolResultInput): void {
    const message = options.activeMessage();
    if (!message || !result || !result.id) return;
    closeResultConnections(result.id);
    const entry = ensureEntry(message, result);
    const run = options.getRun(entry);
    if (run && options.isTerminalToolPhase(run.phase) && entry._toolResultApplied) return;

    if (result.executionId && !entry.executionId) entry.executionId = result.executionId;
    flushPendingProgress(entry);
    const projection = projectToolResult(result, entry.name, options.translate, entry.artifacts);
    options.setRun(entry, projection.runPhase, {
      endedAt: Date.now(),
      durationMs: result.durationMs || 0,
    });
    Object.assign(entry, projection.entryPatch);
    /* Awaiting approval remains active; other results are latched before
       publishing so the frozen snapshot contains the terminal transition. */
    if (!projection.awaitingApproval) entry._toolResultApplied = true;
    options.publishToolSummary(message, entry, projection.activityState, result.status);
    options.notifyToolRun(message);
  }

  return { recordToolResult };
}
