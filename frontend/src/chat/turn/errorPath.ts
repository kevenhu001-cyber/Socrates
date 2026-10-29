/**
 * chat/turn/errorPath.ts — replaceWithError path for addStreamingMessage.
 *
 * A transient failure (network, 429, 5xx) renders the partial answer plus
 * a retry control in the React turn status. The status keeps the viewport
 * capture sequence delegated through the message list.
 *
 * Extracted from chat/streamingTurn.js during the 2026-10 addStreamingMessage
 * split. The split is structural only: every callback, capture, and read
 * order is preserved exactly so a transient failure still ends with the
 * same retry affordance, send-button restore, legacy-shell eviction, and
 * stream-failed runtime publish as before.
 */
import { settleTurnRuntime } from '@socrates/core';
import { esc } from '../../render/helpers.ts';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { setReactLiveStatus } from '../../ui/messageSnapshot.ts';
import { setChatStopState, markTurnEnded } from '../turnUi.ts';
import { claimLiveRetry } from '../liveTurn.ts';
import { turnState, streamRetryViewport } from '../turnState.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnRuntimeState } from './runtimeState.ts';

export interface ErrorPath {
  replaceWithError(errMsg: string, onRetry?: () => unknown): void;
}

function makeRetryHandler(state: TurnRuntimeState, onRetry: () => unknown): () => void {
  return function retryHandler(): void {
    try {
      streamRetryViewport.prepareViewport(state.list, state.msgIdx, state.clientId);
      const result = onRetry();
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        (result as PromiseLike<unknown>).then(undefined, function () { /* retry async handler failed */ });
      }
    } catch { /* retry handler threw */ }
  };
}

function findRetryTarget(node: Element | null, retryBtnId: string): Element | null {
  if (!node) return null;
  if (node.id === retryBtnId) return node;
  return node.closest ? node.closest('#' + retryBtnId) : null;
}

function bindDelegatedRetryButton(state: TurnRuntimeState, retryHandler: () => void): void {
  const capturePress = (event: Event): void => {
    if (!findRetryTarget(event.target as Element | null, state.retryBtnId)) return;
    streamRetryViewport.captureViewport(state.list, state.clientId);
    if (event.type === 'mousedown') event.preventDefault();
  };
  state.list.addEventListener('pointerdown', capturePress, true);
  state.list.addEventListener('mousedown', capturePress, true);
  const delegatedClick = (event: Event): void => {
    if (!findRetryTarget(event.target as Element | null, state.retryBtnId)) return;
    state.list.removeEventListener('pointerdown', capturePress, true);
    state.list.removeEventListener('mousedown', capturePress, true);
    state.list.removeEventListener('click', delegatedClick);
    retryHandler();
  };
  state.list.addEventListener('click', delegatedClick);
}

function bindRetryAffordance(
  state: TurnRuntimeState,
  onRetry: (() => unknown) | undefined,
): void {
  if (typeof onRetry !== 'function') return;
  const retryHandler = makeRetryHandler(state, onRetry);
  claimLiveRetry(state.ret, retryHandler);
  bindDelegatedRetryButton(state, retryHandler);
}

function renderErrorMessage(
  state: TurnRuntimeState,
  errMsg: string,
  onRetry: (() => unknown) | undefined,
): void {
  let partialHtml = '';
  if (state.full.trim()) {
    try { partialHtml = buildAssistantHtml(state.full); }
    catch { partialHtml = '<p>' + esc(state.full) + '</p>'; }
  }
  const errorText = String(errMsg || 'Generation failed');
  const errorHtml = partialHtml + '<div class="msg-error">' +
    '<span class="msg-error-text">' + esc(errorText) + '</span>' +
    '</div>';
  if (state.ownsMessageSlot()) {
    const message = state.patchOwnedMessage({ html: errorHtml, type: 'assistant' });
    if (message) {
      setReactLiveStatus(message, {
        phase: 'error', label: errorText, error: errorText,
        retryable: typeof onRetry === 'function',
        retryButtonId: state.retryBtnId,
      });
    }
  }
  bindRetryAffordance(state, onRetry);
}

function releaseFailedTurn(state: TurnRuntimeState): void {
  if (turnState.activeChatCtl !== state.ret) return;
  turnState.chatStreaming = false;
  try { setChatStopState(false); } catch { /* stop state already cleared */ }
  try { markTurnEnded(); } catch { /* turn already ended */ }
  turnState.activeChatCtl = null;
}

function removeLegacyErrorShell(state: TurnRuntimeState): void {
  try {
    const legacy = state.list.querySelector('[data-client-id="' + state.clientId + '"]');
    if (legacy && !legacy.hasAttribute('data-react-owned') && legacy.parentNode === state.list) {
      state.list.removeChild(legacy);
    }
  } catch { /* legacy shell already gone */ }
}

function publishStreamFailure(state: TurnRuntimeState, errMsg: string): void {
  publishReactChatRuntime({
    type: 'stream-failed',
    messageId: state.clientId,
    textLength: state.full.length,
    error: String(errMsg || 'Generation failed').slice(0, 160),
  });
  streamRetryViewport.settleErrorViewport(state.list, state.clientId, (offset) => {
    streamRetryViewport.rememberStableViewport(state.clientId, offset, 60000);
  });
}

/**
 * Build the replaceWithError entry point bound to one turn's state. All
 * fields are read each call; the helper does not need its own copies.
 */
export function createErrorPath(state: TurnRuntimeState): ErrorPath {
  function replaceWithError(errMsg: string, onRetry?: () => unknown): void {
    if (state.finished) return;
    /* Mark this turn finished first so a
       late natural finish callback finds _disposed/finished flipped. */
    state.finished = true;
    state.toolRuntime.cancel();
    state.patchOwnedMessage({ turnRuntime: settleTurnRuntime(readTurnMessage(state.msgIdx)?.turnRuntime, 'failed') });
    if (state._elapsedTick) clearInterval(state._elapsedTick);
    state.cancelScheduledRender();
    try {
      renderErrorMessage(state, errMsg, onRetry);
    } catch {
      state.patchOwnedMessage({ html: '<p>' + esc(errMsg || 'Generation failed') + '</p>', type: 'assistant' });
    }
    /* Restore the send button — even error paths end the stream.
     * Guarded on the active controller so a new stream that
     * supersedes this one is not clobbered. */
    releaseFailedTurn(state);
    /* Drop the legacy bubble so the next snapshot-driven re-render
       doesn't duplicate the finalized error bubble. (Same bug as
       finish/abort — `msgList` was undeclared here too.) */
    removeLegacyErrorShell(state);
    /* The error row is the new end of the answer. Keep it inside the same
       dynamically measured safe area as normal text so the retry control
       can never settle underneath the composer. Save the last stable
       offset so focus changes during a Retry press cannot redefine where
       the replacement stream begins. */
    publishStreamFailure(state, errMsg);
  }
  return { replaceWithError };
}
