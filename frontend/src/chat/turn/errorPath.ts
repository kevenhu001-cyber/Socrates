/**
 * chat/turn/errorPath.ts — replaceWithError path for addStreamingMessage.
 *
 * A transient failure (network, 429, 5xx) renders the partial answer plus
 * a retry control in the React turn status. React captures the press-time
 * viewport; the active turn closure owns the retry budget and replacement.
 *
 * Extracted from chat/streamingTurn.ts during the 2026-10 addStreamingMessage
 * split. The split is structural only: a transient failure keeps its retry
 * affordance, send-button restore, and stream-failed runtime publish.
 */
import { settleTurnRuntime } from '@socrates/core';
import { esc } from '../../render/helpers.ts';
import { buildAssistantHtml } from '../../render/assistantHtml.ts';
import { setReactLiveStatus } from '../../ui/messageSnapshot.ts';
import { setChatStopState, markTurnEnded } from '../turnUi.ts';
import { claimLiveRetry } from '../liveTurn.ts';
import { turnState, streamRetryViewport } from '../turnState.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.ts';
import { readTurnMessage } from './runtimeState.ts';
import type { TurnRuntimeState } from './runtimeState.ts';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

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
    } catch (error) {
      reportEmptyCatch(error, 'empty catch: chat/turn/errorPath.ts:37');
      /* retry handler threw */
    }
  };
}

function bindRetryAffordance(
  state: TurnRuntimeState,
  onRetry: (() => unknown) | undefined,
): void {
  if (typeof onRetry !== 'function') return;
  const retryHandler = makeRetryHandler(state, onRetry);
  claimLiveRetry(state.ret, retryHandler);
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
      });
    }
  }
  bindRetryAffordance(state, onRetry);
}

function releaseFailedTurn(state: TurnRuntimeState): void {
  if (turnState.activeChatCtl !== state.ret) return;
  turnState.chatStreaming = false;
  try { setChatStopState(false); } catch (error) {
    reportEmptyCatch(error, 'empty catch: chat/turn/errorPath.ts:105');
    /* stop state already cleared */
  }
  try { markTurnEnded(); } catch (error) {
    reportEmptyCatch(error, 'empty catch: chat/turn/errorPath.ts:106');
    /* turn already ended */
  }
  turnState.activeChatCtl = null;
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
    /* The error row is the new end of the answer. Keep it inside the same
       dynamically measured safe area as normal text so the retry control
       can never settle underneath the composer. Save the last stable
       offset so focus changes during a Retry press cannot redefine where
       the replacement stream begins. */
    publishStreamFailure(state, errMsg);
  }
  return { replaceWithError };
}
