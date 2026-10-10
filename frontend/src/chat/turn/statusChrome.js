/**
 * chat/turn/statusChrome.js — live-status chrome for addStreamingMessage.
 *
 * The waiting dot, the reasoning pill, the retry notice and the timeout
 * error block collapse into one field — `message._liveStatus` — drawn by
 * react/tool-run/TurnStatus, so a turn cannot show two "working on it"
 * lines. This module owns that field's mutations and the lifecycle
 * publishes that keep the summary sheet aligned with the live turn.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The helpers here are tight callbacks over the shared message
 * state (`state.full`, `state.fullReasoning`, `state.clientId`,
 * `state.msgIdx`); keeping them as a single factory avoids each method
 * re-binding its own copies.
 */
import { stateStore } from '../../state/store.js';
import { setReactLiveStatus, publishThinkingPanelEvent } from '../../ui/messageSnapshot.js';

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
 *   publishThinkingPanelStart: () => void,
 *   publishThinkingPanelEnd: () => void,
 * }}
 */
export function createStatusChrome(state) {
  var _waitingLabel = state.appMode() === "chat" ? state.t("think.thinking") : state.t("common.generating");

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

  function waitingCopyFor(sec) {
    if (sec >= 45) return state.t("think.stillWorking", "仍在深入推理，请稍候…");
    if (sec >= 20) return state.t("think.organizingAnswer", "正在组织推导与回答内容…");
    if (sec >= 8) return state.t("think.reviewingContext", "正在检索上下文与相关记忆…");
    if (sec >= 3) return state.t("think.preparing", "正在构思生成方案…");
    return _waitingLabel;
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
    var _elapsedQ = sec >= 12 ? Math.max(10, Math.floor(sec / 5) * 5) : undefined;
    setLiveStatus({
      phase: "waiting", label: waitingCopyFor(sec), mode: state.appMode(),
      clickable: state.appMode() === "chat", elapsedSec: _elapsedQ
    });
  }

  function stampThinking() {
    if (!state.reactLive || statusIsBusy()) return;
    setLiveStatus({
      phase: "thinking",
      label: state.t("think.thinking", "正在深度思考…"),
      clickable: state.appMode() === "chat"
    });
  }

  /* P_thinking-panel — the panel snapshot carries only lifecycle state and
     tool summaries; model reasoning text is not sent to its renderer. */
  function publishThinkingPanelStart() {
    publishThinkingPanelEvent({ type: "thinking-start", messageId: state.clientId });
  }

  function publishThinkingPanelEnd() {
    publishThinkingPanelEvent({ type: "thinking-end", messageId: state.clientId });
  }

  return {
    liveMessage,
    setLiveStatus,
    statusIsBusy,
    clearLiveStatus,
    stampWaiting,
    stampThinking,
    publishThinkingPanelStart,
    publishThinkingPanelEnd,
  };
}
