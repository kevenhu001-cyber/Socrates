/**
 * chat/turn/errorPath.js — replaceWithError path for addStreamingMessage.
 *
 * A transient failure (network, 429, 5xx) renders the partial answer plus
 * an inline retry button. The button lives in the message HTML and clicks
 * are delegated on the React-owned list (or attached directly when a real
 * `<button>` DOM node is present). The same handler feeds React's status
 * pill via claimLiveRetry.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The split is structural only: every callback, capture, and read
 * order is preserved exactly so a transient failure still ends with the
 * same retry affordance, send-button restore, legacy-shell eviction, and
 * stream-failed runtime publish as before.
 */
import { esc } from '../../render/helpers.js';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { setReactLiveStatus } from '../../ui/messageSnapshot.js';
import { setChatStopState, markTurnEnded } from '../turnUi.js';
import { claimLiveRetry } from '../liveTurn.js';
import { updateChatStats } from '../stats.js';
import { streamRetryViewport } from '../turnState.js';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';

/**
 * Build the replaceWithError entry point bound to one turn's state.
 *
 * @param {object} state  shared turn state (see chat/streamingTurn.js). All
 *   fields are read each call; the helper does not need its own copies.
 * @returns {{replaceWithError: (errMsg: string, onRetry?: Function) => void}}
 */
export function createErrorPath(state) {
  function replaceWithError(errMsg, onRetry) {
    if (state.finished) return;
    /* Mark this turn finished and publish the thinking-end signal first so a
       late natural finish callback finds _disposed/finished flipped. */
    state.finished = true;
    state._publishThinkingPanelEnd();
    state.toolRuntime.cancel();
    if (state._elapsedTick) clearInterval(state._elapsedTick);
    state.cancelScheduledRender();
    try {
      var partialHtml = "";
      if (state.full.trim()) {
        try { partialHtml = buildAssistantHtml(state.full); }
        catch (_) { partialHtml = "<p>" + esc(state.full) + "</p>"; }
      }
      var errHtml = partialHtml + '<div class="msg-error">' +
        '<span class="msg-error-text">' + esc(errMsg || 'Generation failed') + '</span>' +
        '<button type="button" class="msg-retry-btn" id="' + state.retryBtnId + '">Retry</button>' +
        '</div>';
      /* Serialize the error into the snapshot so React re-renders a
         finalized error bubble. The status line is that error's other
         half — the declarative renderer has no host for markup inside
         `html`. The placeholder `btn` (just an id, no addEventListener)
         triggers the delegation branch below for click handling. */
      if (state.ownsMessageSlot()) {
        var _errorMessage = state.patchOwnedMessage({ html: errHtml, type: "assistant" });
        if (_errorMessage) {
          var _errCopy = String(errMsg || 'Generation failed');
          setReactLiveStatus(_errorMessage, {
            phase: "error", label: _errCopy, error: _errCopy,
            retryable: typeof onRetry === "function"
          });
        }
      }
      var btn = { id: state.retryBtnId };
      if (btn && typeof onRetry === "function") {
        var retryHandler = function () {
          /* P_no_retry_loading — fire onRetry() immediately so the
             new streaming bubble appears in one step. Replace the failed
             assistant entry first and preserve the error row's viewport
             offset so retry starts where the interruption was visible,
             rather than jumping back to the user's prompt. */
          try {
            streamRetryViewport.prepareViewport(state.list, state.msgIdx, state.clientId);
            var innerRet = onRetry();
            if (innerRet && typeof innerRet.then === "function") {
              innerRet.catch(function () { /* retry async handler failed */ });
            }
          } catch { /* retry handler threw */ }
        };
        /* React's status line asks this closure to retry; it is the same
           handler the delegated legacy click below runs. */
        claimLiveRetry(state.ret, retryHandler);
        if (typeof btn.addEventListener === "function") {
          var _captureDirectRetry = function (ev) {
            streamRetryViewport.captureViewport(state.list, state.clientId);
            /* Mouse focus would collapse the expanded composer before
               click. Keep editor focus until the retry stream replaces
               the failed row; keyboard activation is unaffected. */
            if (ev.type === "mousedown") ev.preventDefault();
          };
          btn.addEventListener("pointerdown", _captureDirectRetry, true);
          btn.addEventListener("mousedown", _captureDirectRetry, true);
          btn.addEventListener("click", retryHandler);
        } else {
          function _findRetryTarget(node) {
            if (!node) return null;
            if (node.id === state.retryBtnId) return node;
            return node.closest ? node.closest("#" + state.retryBtnId) : null;
          }
          /* Capture the visible error offset before the retry button
             steals focus from the expanded mobile composer. Chromium can
             synthesize either pointer+mouse events or only mouse events
             depending on the input source, so cover both paths. */
          var _captureRetryPress = function (ev) {
            if (!_findRetryTarget(ev.target)) return;
            streamRetryViewport.captureViewport(state.list, state.clientId);
            if (ev.type === "mousedown") ev.preventDefault();
          };
          state.list.addEventListener("pointerdown", _captureRetryPress, true);
          state.list.addEventListener("mousedown", _captureRetryPress, true);
          /* Delegate retry clicks for React-rendered error bubbles.
             (Previously this was an `else if(msgList && ...)`
             guard, but `msgList` was undeclared in this closure
             scope so the delegation never fired — retry clicks on
             React-rendered error bubbles were silently dead.) */
          state.list.addEventListener("click", function _retryDelegated(ev) {
            if (_findRetryTarget(ev.target)) {
              state.list.removeEventListener("pointerdown", _captureRetryPress, true);
              state.list.removeEventListener("mousedown", _captureRetryPress, true);
              state.list.removeEventListener("click", _retryDelegated);
              retryHandler();
            }
          });
        }
      }
    } catch {
      state.patchOwnedMessage({ html: '<p>' + esc(errMsg || 'Generation failed') + '</p>', type: "assistant" });
    }
    updateChatStats();
    /* Restore the send button — even error paths end the stream.
     * Guarded on the active controller so a new stream that
     * supersedes this one is not clobbered. */
    if (state.activeChatCtl === state.ret) {
      state.chatStreaming = false;
      try { setChatStopState(false); } catch (_) { /* stop state already cleared */ }
      try { markTurnEnded(); } catch (_) { /* turn already ended */ }
    }
    /* Drop the legacy bubble so the next snapshot-driven re-render
       doesn't duplicate the finalized error bubble. (Same bug as
       finish/abort — `msgList` was undeclared here too.) */
    try {
      var _errLegacy = state.list.querySelector('[data-client-id="' + state.clientId + '"]');
      if (_errLegacy && !_errLegacy.hasAttribute("data-react-owned") && _errLegacy.parentNode === state.list) {
        state.list.removeChild(_errLegacy);
      }
    } catch (_) { /* legacy shell already gone */ }
    publishReactChatRuntime({
      type: "stream-failed",
      messageId: state.clientId,
      textLength: state.full.length,
      error: String(errMsg || "Generation failed").slice(0, 160)
    });
    /* The error row is the new end of the answer. Keep it inside the same
       dynamically measured safe area as normal text so the retry control
       can never settle underneath the composer. Save the last stable
       offset so focus changes during a Retry press cannot redefine where
       the replacement stream begins. */
    streamRetryViewport.settleErrorViewport(state.list, state.clientId, function (offset) {
      streamRetryViewport.rememberStableViewport(state.clientId, offset, 60000);
    });
  }
  return { replaceWithError };
}
