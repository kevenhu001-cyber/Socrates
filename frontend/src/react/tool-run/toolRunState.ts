import {isTerminalToolPhase} from '../../chat/toolRunState.js';
import type {ToolCallRecord, ToolRunState} from './toolRunModel.types.ts';

/* ── state ─────────────────────────────────────────────────────────────── */

const APPROVAL_STATUSES = new Set(['awaiting', 'awaiting_approval', 'pending_approval']);
const CANCELLED_STATUSES = new Set(['stopped', 'cancelled', 'aborted']);
const FAILED_STATUSES = new Set(['failed', 'timed_out', 'timeout', 'error']);

/** True while a recorded approval is still asking (a decided one is history). */
function isAwaitingDecision(call: ToolCallRecord): boolean {
  const approval = call.approval;
  if (!approval || !approval.approvalId || !approval.runId) return false;
  const status = String(approval.status || 'pending');
  return status === 'pending';
}

function explicitStateOf(
  call: ToolCallRecord,
  phase: string,
  status: string,
): ToolRunState | null {
  if (phase === 'cancelled' || CANCELLED_STATUSES.has(status)) return 'stopped';
  if (APPROVAL_STATUSES.has(status) || status === 'awaiting_approval') return 'awaiting';
  /* A human decision takes precedence over the run phase so a pending prompt
     cannot be hidden behind a generic "Working…" status. */
  if (isAwaitingDecision(call)) return 'awaiting';
  if (phase === 'failed' || phase === 'timed_out' || call.isError === true || FAILED_STATUSES.has(status)) {
    return 'error';
  }
  if (phase === 'succeeded') return 'done';
  if (phase) return isTerminalToolPhase(phase) ? 'done' : 'running';
  return null;
}

function persistedStateOf(call: ToolCallRecord, status: string): ToolRunState {
  if (status === 'completed' || status === 'done') return 'done';
  /* Saves predating tool_status may only carry their result or duration. */
  if (call.output != null) return 'done';
  if (Array.isArray(call.results) && call.results.length) return 'done';
  if (typeof call.durationMs === 'number' && call.durationMs > 0) return 'done';
  return 'running';
}

/**
 * Collapse the two representations of a run's progress into one: the live
 * `_run.phase` written by chat/toolRuntime.ts while streaming, and the
 * persisted terminal flags (isError / status / output) present in history.
 *
 * A call with no terminal marker at all is still in flight. That is the whole
 * reason the declarative path can render a live stream from the same model as
 * a restored turn: toolRuntime only has to keep writing _run.
 */
export function toolRunStateOf(call: ToolCallRecord | null | undefined): ToolRunState {
  if (!call) return 'running';
  const phase = call._run && call._run.phase ? String(call._run.phase) : '';
  const status = String(call.status || '');
  const explicit = explicitStateOf(call, phase, status);
  if (explicit) return explicit;
  /* No live run record (history / share): a result landed if the backend
     wrote any terminal field. Anything reaching here without one never
     resolved. */
  return persistedStateOf(call, status);
}

export function durationOf(call: ToolCallRecord): number {
  if (call._run && typeof call._run.durationMs === 'number' && call._run.durationMs > 0) {
    return call._run.durationMs;
  }
  return typeof call.durationMs === 'number' && call.durationMs > 0 ? call.durationMs : 0;
}

/**
 * Wall-clock start of an in-flight run, or 0 when the call carries none
 * (history, shared turns, or a tool that never reported progress). The live
 * rows use this to tick an elapsed counter; settled rows show durationMs.
 */
export function runStartedAt(call: ToolCallRecord | null | undefined): number {
  const started = call && call._run && typeof call._run.startedAt === 'number'
    ? call._run.startedAt
    : 0;
  return started > 0 ? started : 0;
}
