import { phaseFromProgress } from '../toolRunState.js';
import type { ToolRun } from '../toolRunState.js';
import { createLiveOutputBuffer, renderLivePreview } from '../liveOutput.js';
import type { LiveOutputBufferHandle } from '../liveOutput.js';

interface ToolProgress {
  id: string;
  phase: string;
  elapsedMs?: number;
  chunk?: string;
}

interface ProgressEntry {
  id: string;
  _run?: ToolRun;
  _progressPhase?: string;
  _liveBuffer?: LiveOutputBufferHandle;
  _liveOutput?: string;
  _pendingProgress?: ToolProgress[];
}

interface ProgressMessage<TEntry extends ProgressEntry> {
  toolCalls?: TEntry[];
}

interface ProgressRuntimeOptions<TEntry extends ProgressEntry, TMessage extends ProgressMessage<TEntry>> {
  activeMessage: () => TMessage | null;
  findEntry: (message: TMessage | null, id: string) => TEntry | null;
  pushOrphan: (message: TMessage, id: string, progress: ToolProgress) => void;
  setRun: (entry: TEntry, phase: string, patch?: Partial<ToolRun>) => ToolRun | null;
  notifyToolRun: (message: TMessage | null, defer?: boolean) => void;
}

function appendLiveOutput(entry: ProgressEntry, progress: ToolProgress): void {
  if (!progress.chunk || !['stdout', 'stderr', 'timeout_warning'].includes(progress.phase)) return;
  const buffer = entry._liveBuffer || (entry._liveBuffer = createLiveOutputBuffer());
  buffer.push(progress.phase === 'timeout_warning' ? '\n[' + progress.chunk + ']\n' : progress.chunk);
  entry._liveOutput = renderLivePreview(buffer.preview());
}

function flushPendingProgress<TEntry extends ProgressEntry>(
  entry: TEntry,
  renderProgress: (progress: ToolProgress, skipQueuedDrain?: boolean) => void,
): void {
  const queued = entry._pendingProgress?.splice(0) || [];
  for (const progress of queued) renderProgress(progress, true);
}

/** Keep per-tool progress, bounded output and pre-tool buffering in sync. */
export function createProgressRuntime<
  TEntry extends ProgressEntry,
  TMessage extends ProgressMessage<TEntry>,
>(options: ProgressRuntimeOptions<TEntry, TMessage>) {
  function renderProgress(progress: ToolProgress, skipQueuedDrain = false): void {
    const message = options.activeMessage();
    if (!message || !progress || !progress.id) return;
    const entry = options.findEntry(message, progress.id);
    if (!entry) {
      options.pushOrphan(message, progress.id, progress);
      return;
    }
    entry._progressPhase = progress.phase;
    options.setRun(entry, phaseFromProgress(progress), { elapsedMs: progress.elapsedMs || 0 });
    appendLiveOutput(entry, progress);
    options.notifyToolRun(message, true);
    if (!skipQueuedDrain) flushPendingProgress(entry, renderProgress);
  }

  return { renderProgress };
}
