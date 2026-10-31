/**
 * chat/turn/statusChrome.ts — live-status chrome for addStreamingMessage.
 *
 * The waiting dot, the reasoning pill, the retry notice and the timeout
 * error block collapse into one field — `message._liveStatus` — drawn by
 * react/tool-run/TurnStatus, so a turn cannot show two "working on it"
 * lines. This module owns that field's mutations and the lifecycle
 * updates that keep the inline activity summary aligned with the live turn.
 *
 * Extracted from chat/streamingTurn.ts during the 2026-10 addStreamingMessage
 * split. The helpers here are tight callbacks over the shared message
 * state (`state.full`, `state.fullReasoning`, `state.clientId`,
 * `state.msgIdx`); keeping them as a single factory avoids each method
 * re-binding its own copies.
 */
import { setReactLiveStatus } from '../../ui/messageSnapshot.ts';
import { readTurnMessage } from './runtimeState.ts';
import type { LiveStatus, TurnMessage, TurnRuntimeState } from './runtimeState.ts';

export interface StatusChrome {
  liveMessage(): TurnMessage | null;
  setLiveStatus(status: LiveStatus | null): void;
  statusIsBusy(): boolean;
  clearLiveStatus(): void;
  stampWaiting(sec: number): void;
  stampThinking(sec?: number): void;
  isThinkingPhase(): boolean;
}

export function createStatusChrome(state: TurnRuntimeState): StatusChrome {
  const _waitingLabel = state.t('think.waitingForResponse', 'Waiting for the response.');

  function liveMessage(): TurnMessage | null {
    const message = readTurnMessage(state.msgIdx);
    return (message && message.clientId === state.clientId) ? message : null;
  }

  function setLiveStatus(status: LiveStatus | null): void {
    const msg = liveMessage();
    if (msg) setReactLiveStatus(msg, status);
  }

  /* A status line never overwrites a failure or a retry notice, and the
     waiting dot gives up as soon as the turn has real content.
     P_tool-order-defer — tool-running is busy too: while a tool row is
     deferred behind an unfinished paragraph, thinking/waiting stamps must
     not overwrite its line (the row itself isn't mounted yet, so this
     line is the only visible proof of work). */
  function statusIsBusy(): boolean {
    const msg = liveMessage();
    const prev = msg && msg._liveStatus;
    return !!(prev && (prev.phase === 'error' || prev.phase === 'retrying' || prev.phase === 'tool-running'));
  }

  function clearLiveStatus(): void {
    if (!statusIsBusy()) setLiveStatus(null);
  }

  function stampWaiting(sec: number): void {
    if (statusIsBusy()) return;
    /* Reasoning owns the line once it starts. Reasoning deltas re-stamp
       phase "thinking" on every chunk; the 1s elapsed tick would otherwise
       flip the label back to the waiting copy between deltas. One-way rule:
       waiting may not overwrite a thinking line — only content (append/tool
       activity) retires it. (P_thinking-unified: all live phases share one
       pill shape, so this is purely about label stability now, not layout.) */
    const _owner = liveMessage();
    const _prev = _owner && _owner._liveStatus;
    if (_prev && _prev.phase === 'thinking') return;
    /* The elapsed cue is quantized to 5s steps so the pill's width only
       changes rarely and predictably, instead of ticking every second. */
    setLiveStatus({
      phase: 'waiting', label: _waitingLabel, mode: state.appMode(),
      elapsedSec: sec > 0 ? sec : undefined,
    });
  }

  function stampThinking(sec?: number): void {
    const _owner = liveMessage();
    const _prev = _owner && _owner._liveStatus;
    if (_prev && (_prev.phase === 'error' || _prev.phase === 'retrying' || _prev.phase === 'tool-running')) return;
    const curSec = typeof sec === 'number' && sec >= 0 ? sec : (_prev && _prev.elapsedSec) ?? undefined;
    setLiveStatus({
      phase: 'thinking',
      label: state.t('think.thinking', '正在思考…'),
      mode: state.appMode(),
      elapsedSec: curSec,
    });
  }

  function isThinkingPhase(): boolean {
    const msg = liveMessage();
    const prev = msg && msg._liveStatus;
    return !!(prev && prev.phase === 'thinking');
  }

  return {
    liveMessage,
    setLiveStatus,
    statusIsBusy,
    clearLiveStatus,
    stampWaiting,
    stampThinking,
    isThinkingPhase,
  };
}
