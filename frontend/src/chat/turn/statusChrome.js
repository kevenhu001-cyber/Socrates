/**
 * chat/turn/statusChrome.js — live-status chrome for addStreamingMessage.
 *
 * The waiting dot, the reasoning pill, the retry notice and the timeout
 * error block collapse into one field — `message._liveStatus` — drawn by
 * react/tool-run/TurnStatus, so a turn cannot show two "working on it"
 * lines. This module owns that field's mutations and the lifecycle
 * updates that keep the inline activity summary aligned with the live turn.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The helpers here are tight callbacks over the shared message
 * state (`state.full`, `state.fullReasoning`, `state.clientId`,
 * `state.msgIdx`); keeping them as a single factory avoids each method
 * re-binding its own copies.
 */
import { stateStore } from '../../state/store.js';
import { setReactLiveStatus } from '../../ui/messageSnapshot.js';

/**
 * Build the live-status chrome bound to one turn's state.
 *
 * @param {object} state  shared turn state (see chat/streamingTurn.js).
 * @param {Function} state.appMode  () => 'chat' | ... (mode getter)
 * @returns {{
 *   liveMessage: () => object|null,
 *   setLiveStatus: (status: object|null) => void,
 *   statusIsBusy: () => boolean,
 *   clearLiveStatus: () => void,
 *   stampWaiting: (sec: number) => void,
 *   stampThinking: () => void,
 * }}
 */
export function createStatusChrome(state) {
  var _waitingLabel = state.t("think.waitingForResponse", "Waiting for the response.");

  function liveMessage() {
    return (state.msgIdx >= 0 && stateStore.read("messages")[state.msgIdx] &&
      stateStore.read("messages")[state.msgIdx].clientId === state.clientId)
      ? stateStore.read("messages")[state.msgIdx] : null;
  }

  function setLiveStatus(status) {
    var msg = liveMessage();
    if (msg) setReactLiveStatus(msg, status);
  }

  /* A status line never overwrites a failure or a retry notice, and the
     waiting dot gives up as soon as the turn has real content.
     P_tool-order-defer — tool-running is busy too: while a tool row is
     deferred behind an unfinished paragraph, thinking/waiting stamps must
     not overwrite its line (the row itself isn't mounted yet, so this
     line is the only visible proof of work). */
  function statusIsBusy() {
    var msg = liveMessage();
    var prev = msg && msg._liveStatus;
    return !!(prev && (prev.phase === "error" || prev.phase === "retrying" || prev.phase === "tool-running"));
  }

  function clearLiveStatus() {
    if (!statusIsBusy()) setLiveStatus(null);
  }

  function stampWaiting(sec) {
    if (!state.reactLive || statusIsBusy()) return;
    /* Reasoning owns the line once it starts. Reasoning deltas re-stamp
       phase "thinking" on every chunk; the 1s elapsed tick would otherwise
       flip the label back to the waiting copy between deltas. One-way rule:
       waiting may not overwrite a thinking line — only content (append/tool
       activity) retires it. (P_thinking-unified: all live phases share one
       pill shape, so this is purely about label stability now, not layout.) */
    var _owner = liveMessage();
    var _prev = _owner && _owner._liveStatus;
    if (_prev && _prev.phase === "thinking") return;
    /* The elapsed cue is quantized to 5s steps so the pill's width only
       changes rarely and predictably, instead of ticking every second. */
    setLiveStatus({
      phase: "waiting", label: _waitingLabel, mode: state.appMode(),
      elapsedSec: sec > 0 ? sec : undefined
    });
  }

  function stampThinking(sec) {
    if (!state.reactLive) return;
    var _owner = liveMessage();
    var _prev = _owner && _owner._liveStatus;
    if (_prev && (_prev.phase === "error" || _prev.phase === "retrying" || _prev.phase === "tool-running")) return;
    var curSec = typeof sec === 'number' && sec >= 0 ? sec : (_prev && _prev.elapsedSec);
    setLiveStatus({
      phase: "thinking",
      label: state.t("think.thinking", "正在思考…"),
      mode: state.appMode(),
      elapsedSec: curSec,
    });
  }

  function isThinkingPhase() {
    var msg = liveMessage();
    var prev = msg && msg._liveStatus;
    return !!(prev && prev.phase === "thinking");
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
