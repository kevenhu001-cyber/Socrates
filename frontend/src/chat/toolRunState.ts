/* Normalized, client-only state for a single assistant message's tools.
 * The persisted `toolCalls` record stays untouched; these fields only make
 * live SSE delivery deterministic while a response is in progress. */

export interface ToolPhaseMap {
  queued: 'queued';
  preparing: 'preparing';
  running: 'running';
  succeeded: 'succeeded';
  failed: 'failed';
  cancelled: 'cancelled';
  timed_out: 'timed_out';
}

export type ToolRunPhase = ToolPhaseMap[keyof ToolPhaseMap];

export const TOOL_RUN_PHASES: ToolPhaseMap = Object.freeze({
  queued: 'queued',
  preparing: 'preparing',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  timed_out: 'timed_out',
});

const TERMINAL: ReadonlySet<string> = new Set<string>([
  TOOL_RUN_PHASES.succeeded,
  TOOL_RUN_PHASES.failed,
  TOOL_RUN_PHASES.cancelled,
  TOOL_RUN_PHASES.timed_out,
]);

export function isTerminalToolPhase(phase: string): boolean {
  return TERMINAL.has(phase);
}

export function phaseFromProgress(progress: { phase?: string } | null | undefined): ToolRunPhase {
  const phase = String((progress && progress.phase) || '').toLowerCase();
  if (phase === 'queued') return TOOL_RUN_PHASES.queued;
  if (phase === 'ready' || phase === 'preparing' || phase === 'booting') return TOOL_RUN_PHASES.preparing;
  if (phase === 'completed' || phase === 'complete') return TOOL_RUN_PHASES.succeeded;
  if (phase === 'cancelled' || phase === 'skipped') return TOOL_RUN_PHASES.cancelled;
  if (phase === 'timeout') return TOOL_RUN_PHASES.timed_out;
  // A warning is not terminal: the worker may still produce a valid result.
  if (phase === 'timeout_warning') return TOOL_RUN_PHASES.running;
  if (phase === 'failed' || phase === 'error') return TOOL_RUN_PHASES.failed;
  return TOOL_RUN_PHASES.running;
}

export interface ToolRun {
  phase: string;
}

/* The first terminal event wins. This deliberately makes delayed execution
 * EventSource frames harmless after a chat-stream result has landed. */
export function transitionToolRun(
  run: Record<string, unknown> | null | undefined,
  nextPhase: string,
  patch?: Record<string, unknown>,
): Record<string, unknown> {
  const currentPhase = String((run && run.phase) || TOOL_RUN_PHASES.preparing);
  if (isTerminalToolPhase(currentPhase)) return (run || { phase: currentPhase });
  const phase = (TOOL_RUN_PHASES as unknown as Record<string, string>)[nextPhase] || nextPhase || currentPhase;
  return { ...(run || {}), ...(patch || {}), phase };
}

export interface ToolRunSummary {
  total: number;
  active: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  timed_out: number;
}

export function summarizeToolRuns(runs: ({ phase?: string } | null | undefined)[] | null | undefined): ToolRunSummary {
  const list = Array.isArray(runs) ? runs : [];
  const counts: ToolRunSummary = { total: list.length, active: 0, succeeded: 0, failed: 0, cancelled: 0, timed_out: 0 };
  for (const run of list) {
    if (!run || !run.phase) continue;
    if (run.phase === TOOL_RUN_PHASES.succeeded) counts.succeeded++;
    else if (run.phase === TOOL_RUN_PHASES.failed) counts.failed++;
    else if (run.phase === TOOL_RUN_PHASES.cancelled) counts.cancelled++;
    else if (run.phase === TOOL_RUN_PHASES.timed_out) counts.timed_out++;
    else counts.active++;
  }
  return counts;
}
