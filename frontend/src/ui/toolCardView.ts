/**
 * ui/toolCardView.ts — pure view-model derivation for tool cards.
 *
 * Maps a normalized `ToolRun` (from chat/toolRunState.ts) plus the current
 * time into the small, non-persisted view model the tool-card renderer reads:
 * whether the run is still running, its phase, the elapsed/total time, and a
 * human-readable time label. Terminal runs report `endedAt - startedAt`;
 * running runs report `now - startedAt`. Both are clamped to `>= 0`.
 *
 * This module holds no DOM logic — the wiring in ui/toolCards.js consumes it.
 */

import { isTerminalToolPhase, type ToolRun } from '../chat/toolRunState.js';

export interface ToolCardView {
  running: boolean;
  phase: string;
  /** ms since startedAt for a running run, or endedAt-startedAt for a terminal run */
  timeMs: number;
  timeLabel: string; // e.g. "1.4s" / "2m 03s"
}

export function formatDuration(ms: number): string {
  const t = Math.max(0, Math.floor(ms));
  if (t < 1000) return `${t}ms`;
  const s = t / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

export function toolCardView(run: ToolRun, now: number): ToolCardView {
  const terminal = isTerminalToolPhase(run.phase);
  const timeMs = terminal
    ? Math.max(0, (run.endedAt ?? run.startedAt) - run.startedAt)
    : Math.max(0, now - run.startedAt);
  return { running: !terminal, phase: run.phase, timeMs, timeLabel: formatDuration(timeMs) };
}
