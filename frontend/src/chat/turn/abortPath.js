/**
 * chat/turn/abortPath.js — user-stop (abort) path for addStreamingMessage.
 *
 * User-initiated stop is the second end state for a streaming turn. The
 * bubble keeps any visible text (already-streamed chars are still on
 * screen and saved); an empty placeholder collapses to an invisible stub
 * the next turn's anchor glides past. A partial answer gets a Resend
 * button on top of the streamed HTML so the user can re-run the send
 * path with one click.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The split is structural only: the slot-ownership guard, the
 * partial-text finalize, the superseded-stub retirement, and the
 * legacy-shell eviction all keep their original sequencing.
 */
import { stateStore } from '../../state/store.js';
import { esc } from '../../render/helpers.js';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { formatMsgProgressive } from '../../render/markdown.js';
import { setReactLiveStatus } from '../../ui/messageSnapshot.js';
import { setChatStopState, markTurnEnded, resendLastUserMessage } from '../turnUi.js';
import { claimLiveRetry } from '../liveTurn.js';
import { turnState } from '../turnState.js';
import { removeSupersededStub } from '../turnAnchor.ts';
import { updateChatStats } from '../stats.js';
import { saveCurrentSession } from '../../session/persistence.js';
import { stripChatArtifacts } from '../../util/stripChatArtifacts.js';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';

/**
 * Build the abort entry point bound to one turn's state.
 *
 * @param {object} state  shared turn state (see chat/streamingTurn.js). The
 *   helper reads and mutates `state._disposed`, `state.finished`,
 *   `state.toolRuntime`, etc., so callers see the
 *   exact same lifecycle flips the original in-function abort() performed.
 * @returns {{abort: () => void}}
 */
export function createAbortPath(state) {
  function abort() {
    /* P_session-stream-dispose — flip the sticky flag FIRST so any
       in-flight append()/recordToolUse()/finish() callbacks that
       are already scheduled in the microtask queue (the stream.js
       reader keeps draining the SSE buffer for one or two ticks
       after AbortController.abort()) will short-circuit on their
       own _disposed checks and never touch stateStore.read("messages"). */
    if (state._disposed) return;
    if (state.finished) return;
    state.finished = true;
    state._disposed = true;
    state._publishThinkingPanelEnd();
    if (state._elapsedTick) clearInterval(state._elapsedTick);
    state.cancelScheduledRender();
    /* Restore the send button — but only if no new stream has
     * already taken over (the new wrapper cancels the OLD
     * controller when the user sends a follow-up, and the new
     * addStreamingMessage has already raised turnState.chatStreaming). */
    if (turnState.activeChatCtl === state.ret) {
      turnState.chatStreaming = false;
      try { setChatStopState(false); } catch (_) { /* stop state already cleared */ }
      try { markTurnEnded(); } catch (_) { /* turn already ended */ }
    }
    /* Stop the independent execution stream and any queued delta
       frame before this message can lose ownership of its slot. */
    state.toolRuntime.cancel();
    /* A user stop is an intentional end state. Keep any visible text as a
     * normal assistant message so it remains on screen and can be saved.
     * P_session-cross-talk — verify the slot still holds OUR placeholder
     * (by clientId) before splicing. If the user switched sessions,
     * stateStore.read("messages") was replaced and msgIdx now points at the new
     * session's message — splicing here would delete the new session's
     * message. The abandoned placeholder is harmless (it's not in the
     * new session's array), so just skip the splice. */
    var abortedMessage = (state.msgIdx >= 0 && stateStore.read("messages")[state.msgIdx] &&
      stateStore.read("messages")[state.msgIdx].clientId === state.clientId)
      ? stateStore.read("messages")[state.msgIdx] : null;
    var stoppedRaw = abortedMessage ? String(state.full || abortedMessage.rawText || "") : String(state.full || "");
    var visibleStoppedRaw = stripChatArtifacts(stoppedRaw)
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*$/gi, "")
      .trim();
    var hasPartial = !!(abortedMessage && visibleStoppedRaw);
    if (abortedMessage && !hasPartial && abortedMessage.type === "streaming") {
      /* P_supersede-stable — removing the empty placeholder also removes
         the turn's viewport reserve, collapsing the scroll range on the
         send frame. Keep the entry as an invisible stub that still holds
         its reserve; the new turn's anchor glides past it and retires it
         off-screen (removeSupersededStub is the no-new-turn fallback). */
      abortedMessage = state.patchOwnedMessage({
        rawText: "",
        html: '<span data-turn-stub="1"></span>',
        type: "assistant",
        _supersededStub: true
      }) || abortedMessage;
      setTimeout(function () {
        try { removeSupersededStub(state.clientId); } catch (_) { /* already gone */ }
      }, 700);
    }
    /* Finalize the partial text before publishing the aborted state. A
       complete scaffold becomes interactive; an open scaffold stays on
       the tolerant progressive renderer so already-streamed fields are
       not replaced by an empty fallback. */
    if (hasPartial && abortedMessage) {
      var stoppedHtml = "";
      try {
        stoppedHtml = buildAssistantHtml(stoppedRaw);
        if (/scaffold-stream-unclosed/.test(stoppedHtml)) {
          stoppedHtml = formatMsgProgressive(stoppedRaw);
        }
      } catch (_) {
        try { stoppedHtml = formatMsgProgressive(stoppedRaw); }
        catch (__) { stoppedHtml = "<p>" + esc(visibleStoppedRaw) + "</p>"; }
      }
      /* Task 4.1 — Resend affordance. After a user Stop, offer a
         Resend control on the stopped bubble that re-runs the send path
         from the most recent user message with a fresh turn (Req 2.6/2.7).
         Mirrors the recovered-stream `data-stream-retry` pattern: the
         button lives in the message HTML and clicks are delegated on the
         React-owned list. Reuses askChatTurn's AbortController/isUserAbort
         path — no new retry logic. */
      var resendHtml = '<div class="msg-error msg-resend" style="margin-top:8px">' +
        '<span class="msg-error-text">' + esc(state.t("chat.stopped") || "Response stopped") + '</span>' +
        '<button type="button" class="msg-retry-btn chat-resend-btn" data-chat-resend>' + esc(state.t("chat.resend") || "Resend") + '</button>' +
        '</div>';
      stoppedHtml = stoppedHtml + resendHtml;
      abortedMessage = state.patchOwnedMessage({
        rawText: stoppedRaw, html: stoppedHtml, type: "assistant", state: "stopped"
      }) || abortedMessage;
      /* The declarative renderer has no host for the html-resend
         affordance, so the stopped line is data. */
      setReactLiveStatus(abortedMessage, {
        phase: "stopped", label: state.t("chat.stopped") || "Response stopped"
      });
      claimLiveRetry(state.ret, function () {
        try { resendLastUserMessage(); } catch (_) { /* resend handler threw */ }
      });
      /* Delegate the Resend click on the list (button DOM is React-owned
         after the next paint). One-shot: detaches after firing. */
      var _resendDelegated = function (ev) {
        var tgt = ev.target;
        if (!(tgt && tgt.closest && tgt.closest("[data-chat-resend]"))) return;
        try { state.list.removeEventListener("click", _resendDelegated); } catch (_) { /* listener already detached */ }
        resendLastUserMessage();
      };
      try { state.list.addEventListener("click", _resendDelegated); } catch (_) { /* list unavailable */ }
      try { saveCurrentSession(); } catch (_) { /* save failed */ }
      try { updateChatStats(); } catch (_) { /* stats update failed */ }
    }
    /* Publish first, then remove only a throwaway shell on the next
       frame (a non-React node with our clientId, if one ever exists). */
    publishReactChatRuntime({
      type: "stream-aborted",
      messageId: state.clientId,
      textLength: state.full.length
    });
    requestAnimationFrame(function () {
      try {
        var _abLegacy = state.list.querySelector('[data-client-id="' + state.clientId + '"]');
        if (_abLegacy && !_abLegacy.hasAttribute("data-react-owned") && _abLegacy.parentNode === state.list) {
          state.list.removeChild(_abLegacy);
        }
      } catch (_) { /* legacy shell already gone */ }
    });
  }
  return { abort };
}
