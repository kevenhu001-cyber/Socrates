import { sessionStore } from '../../store/index.ts';
import { clearPendingTurn, interruptChatTurn, loadPendingTurn } from './client.ts';
import { turnState, type ActiveChatController } from './state.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

type CancellationReason = 'user-stop' | 'superseded' | 'msg-edit' | 'msg-regen';
type SessionExitReason =
  | 'session-switch'
  | 'new-session'
  | 'session-reset'
  | 'archived-session'
  | 'session-deleted'
  | 'session-purged';
type RequestAbort = typeof turnState.activeChatAbort;

/** Stop the bound server turn and cancel the local renderer and request.
 * A send may already have mounted the replacement's placeholder. */
export function cancelActiveTurn(
  reason: CancellationReason,
  keepRenderer?: ActiveChatController | null,
): void {
  const renderer = turnState.activeChatCtl;
  const request = turnState.activeChatAbort;

  interruptPendingTurn();
  if (renderer !== keepRenderer) abortRenderer(renderer);
  abortRequest(request, reason);
}

/** Release browser-side turn state before the session swaps its message list. */
export function detachActiveTurn(reason: SessionExitReason): void {
  const { activeChatCtl, activeChatAbort, activePagePreparationAbort, pendingFirstTurnController } =
    turnState;
  abortRequest(activeChatAbort, reason);
  abortRenderer(activeChatCtl);

  if (turnState.pendingFirstTurnController === pendingFirstTurnController)
    turnState.pendingFirstTurnController = null;
  if (turnState.activePagePreparationAbort === activePagePreparationAbort)
    turnState.activePagePreparationAbort = null;
  if (turnState.activeChatAbort === activeChatAbort) turnState.activeChatAbort = null;
  if (turnState.activeChatCtl === activeChatCtl) {
    turnState.activeChatCtl = null;
    turnState.chatStreaming = false;
    turnState.chatStopMode = false;
    turnState.turnUi.inProgress = false;
  }
}

function abortRenderer(renderer: ActiveChatController | null): void {
  try {
    renderer?.abort();
  } catch (error) {
    reportSwallow(error, 'chat/turn/cancelActiveTurn.renderer');
  }
}

function abortRequest(request: RequestAbort, reason: CancellationReason | SessionExitReason): void {
  try {
    request?.(reason);
  } catch (error) {
    reportSwallow(error, 'chat/turn/cancelActiveTurn.request');
  }
}

/** Tell a bound server turn to stop before detaching the local stream. */
function interruptPendingTurn(): void {
  let sessionId: string | null = null;
  try {
    sessionId = sessionStore.getState().currentSessionId || null;
  } catch (error) {
    reportSwallow(error, 'chat/turn/cancelActiveTurn.interrupt.session');
  }
  if (!sessionId) return;

  let pending: { turnId?: string } | null = null;
  try {
    pending = loadPendingTurn(sessionId);
  } catch (error) {
    reportSwallow(error, 'chat/turn/cancelActiveTurn.interrupt.pending');
  }
  if (!pending?.turnId) return;

  try {
    clearPendingTurn(sessionId);
  } catch (error) {
    reportSwallow(error, 'chat/turn/cancelActiveTurn.interrupt.clear');
  }
  try {
    void interruptChatTurn(pending.turnId).catch((error) => {
      reportSwallow(error, 'chat/turn/cancelActiveTurn.interrupt.server');
    });
  } catch (error) {
    reportSwallow(error, 'chat/turn/cancelActiveTurn.interrupt.serverCall');
  }
}
