/* chat/turnState.js — centralized mutable turn/streaming state.
 * Extracted from main.js module-level vars to enable safe function
 * extraction without circular imports. Single mutable object so both
 * main.js (legacy) and new modules share live state.
 * Zero-behavior-change: same initial values, same mutation semantics.
 */
import { createStreamRetryViewport } from './streamRetry.ts';

/* Active-chat controller + pending-turn payloads. Previously module-local
   vars in main.js with a comment noting window mirrors were removed. */
export var turnState = {
  activeChatCtl: null,
  pendingAttachments: null,
  pendingBranchContext: null,
  pendingChatContent: null,
  chatStopMode: false,
  chatStreaming: false,
  turnUi: { inProgress: false, lastUserMessageId: null },
  liveRetryOwner: null,
  liveTurnRuntimes: new Map(),
  liveSearchRetry: null,
  toolRetryWired: false,
};

export function getTurnState() {
  return turnState;
}

export function resetTurnState() {
  turnState.activeChatCtl = null;
  turnState.pendingAttachments = null;
  turnState.pendingBranchContext = null;
  turnState.pendingChatContent = null;
  turnState.chatStopMode = false;
  turnState.chatStreaming = false;
  turnState.turnUi = { inProgress: false, lastUserMessageId: null };
  turnState.liveRetryOwner = null;
  if (turnState.liveTurnRuntimes && typeof turnState.liveTurnRuntimes.clear === 'function') {
    turnState.liveTurnRuntimes.clear();
  }
  turnState.liveSearchRetry = null;
}

/* Retry-viewport anchoring (consume/measure/capture/prepare/settle):
   one store per app lifetime. Previously a module-local const in main.js;
   centralized here so extracted message/streaming modules share it. */
export const streamRetryViewport = createStreamRetryViewport();
