/**
 * toolRun — the normalized tool-run lifecycle contract (M3 of the
 * LobeHub-alignment plan).
 *
 * Previously this model lived only in `frontend/src/chat/toolRunState.ts`,
 * where the Rust/WASM mechanism library was wired in directly, so the RN
 * client and the server could not share it. The model is now a pure
 * contract here with the WASM binding injected, so:
 *
 *   - the desktop client passes its `getSocratesWasm()` binding,
 *   - the RN client and any server-side projection use the pure-TS path,
 *   - both paths must produce identical output (desktop verifies this in
 *     `frontend/test/wasmParity.test.mjs`).
 *
 * A tool run is client-side projection state for one native tool call:
 * the persisted `toolCalls` record stays untouched; these fields only
 * make live SSE delivery deterministic while a response is in progress.
 */

import type { ToolRun } from '@socrates/contracts';
export type { ToolRun } from '@socrates/contracts';

export interface ToolRunSummary {
  total: number;
  active: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  timed_out: number;
}

export const TOOL_RUN_PHASES: Record<string, string> = Object.freeze({
  queued: 'queued',
  preparing: 'preparing',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  timed_out: 'timed_out',
});

const TERMINAL = new Set([
  TOOL_RUN_PHASES.succeeded,
  TOOL_RUN_PHASES.failed,
  TOOL_RUN_PHASES.cancelled,
  TOOL_RUN_PHASES.timed_out,
]);

/**
 * The subset of the Rust mechanism library the tool-run model uses.
 * Shape-compatible with the desktop client's `getSocratesWasm()`.
 */
export interface ToolRunWasmBinding {
  is_terminal_phase(phase: string): boolean;
  phase_from_progress_js(phase: string): string;
  transition_run(currentPhase: string, nextPhase: string): string;
  summarize_runs(runs: ToolRun[]): ToolRunSummary;
}

export interface ToolRunApi {
  isTerminalToolPhase(phase: string): boolean;
  phaseFromProgress(progress: { phase?: string } | null): string;
  /** The first terminal event wins. This deliberately makes delayed
   * execution EventSource frames harmless after a chat-stream result has
   * landed. */
  transitionToolRun(run: ToolRun | null, nextPhase: string, patch?: Partial<ToolRun>): ToolRun;
  summarizeToolRuns(runs: (ToolRun | null)[]): ToolRunSummary;
}

/**
 * Build the tool-run API. Pass a WASM binding (or a getter that resolves
 * it lazily — the desktop client's mechanism library may not be loaded at
 * module-evaluation time) to delegate the mechanism functions to the Rust
 * library; omit it for the pure-TS fallback that the parity tests treat
 * as the reference.
 */
export function createToolRunApi(
  wasmBinding?: ToolRunWasmBinding | null | (() => ToolRunWasmBinding | null),
): ToolRunApi {
  const getW = (): ToolRunWasmBinding | null => {
    if (typeof wasmBinding === 'function') return wasmBinding() || null;
    return wasmBinding || null;
  };
  const hasWasm = (): boolean => Boolean(getW());

  function isTerminalToolPhase(phase: string): boolean {
    const w = getW();
    if (w) return w.is_terminal_phase(String(phase || ''));
    return TERMINAL.has(phase);
  }

  function phaseFromProgress(progress: { phase?: string } | null): string {
    const w = getW();
    if (w) return w.phase_from_progress_js(String((progress && progress.phase) || ''));
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

  function transitionToolRun(
    run: ToolRun | null,
    nextPhase: string,
    patch?: Partial<ToolRun>,
  ): ToolRun {
    const current = run || { id: '', tool: '', phase: TOOL_RUN_PHASES.preparing, startedAt: 0 };
    if (isTerminalToolPhase(current.phase)) return current;
    const w = getW();
    if (w) {
      const phase = w.transition_run(current.phase, String(nextPhase || ''));
      return { ...current, ...(patch || {}), phase };
    }
    const phase = TOOL_RUN_PHASES[nextPhase] || nextPhase || current.phase;
    return { ...current, ...(patch || {}), phase };
  }

  function summarizeToolRuns(runs: (ToolRun | null)[]): ToolRunSummary {
    const list = Array.isArray(runs) ? runs : [];
    const w = getW();
    if (w && list.length > 0) return w.summarize_runs(list as ToolRun[]);
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

  return { isTerminalToolPhase, phaseFromProgress, transitionToolRun, summarizeToolRuns };
}

/** Pure-TS reference implementation (no WASM). */
export const pureToolRunApi: ToolRunApi = createToolRunApi(null);
