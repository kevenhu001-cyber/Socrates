/**
 * Normalized, client-only state for a single assistant message's tools.
 * The persisted `toolCalls` record stays untouched; these fields only make
 * live SSE delivery deterministic while a response is in progress.
 *
 * M3 (LobeHub alignment): the contract itself now lives in
 * `@socrates/core` (packages/core/src/toolRun.ts) so the RN client and the
 * server share it. This module injects the desktop WASM mechanism library
 * (tools-rust, compiled to WASM — see util/socratesWasm.ts) into the shared
 * factory; the pure-TS path inside the factory remains the fallback and
 * the parity reference for tests (test/wasmParity.test.mjs).
 */

import { getSocratesWasm } from '../util/socratesWasm.ts';
import { createToolRunApi } from '@socrates/core/toolRun';

export type { ToolRun, ToolRunSummary } from '@socrates/core/toolRun';
export { TOOL_RUN_PHASES } from '@socrates/core/toolRun';

const api = createToolRunApi(() => {
  const w = getSocratesWasm();
  return w || null;
});

export const isTerminalToolPhase = api.isTerminalToolPhase;
export const phaseFromProgress = api.phaseFromProgress;
export const transitionToolRun = api.transitionToolRun;
export const summarizeToolRuns = api.summarizeToolRuns;
