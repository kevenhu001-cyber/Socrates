import { turnState } from './turnState.js';
import { stateStore } from '../state/store.js';
import { clearPendingTurn, interruptChatTurn, loadPendingTurn } from './turnClient.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export interface ComposerSendOptions {
  blurAfterSend?: boolean;
}

interface ComposerTurnWindow extends Window {
  submitChatMessage?: (textOverride?: string | null, options?: ComposerSendOptions) => void | Promise<unknown>;
  _activeChatAbort?: (reason?: string) => void;
}

function legacyTurnActions(): ComposerTurnWindow {
  return window as ComposerTurnWindow;
}

/** React renders the primary button; this typed command owns its send/stop transition. */
export function setChatStopState(active: boolean): void {
  const button = document.getElementById('composerPrimaryBtn');
  if (!button) return;
  if (active) {
    button.classList.add('chat-stop');
    button.dataset.stop = '1';
  } else {
    button.classList.remove('chat-stop');
    button.dataset.stop = '0';
  }
}

export function handleSendClick(): void {
  const button = document.getElementById('composerPrimaryBtn');
  if (button?.dataset.stop === '1') {
    stopChatResponse();
    return;
  }
  legacyTurnActions().submitChatMessage?.(null, { blurAfterSend: true });
}

export function stopChatResponse(): void {
  try { interruptPendingTurn(); }
  catch (error) { reportSwallow(error, 'chat/composerTurn.stop.interruptPendingTurn'); }
  const activeChatCtl = (turnState as { activeChatCtl?: unknown }).activeChatCtl as { abort?: () => void } | null | undefined;
  if (activeChatCtl && typeof activeChatCtl.abort === 'function') {
    activeChatCtl.abort();
  }
  try { legacyTurnActions()._activeChatAbort?.('user-stop'); }
  catch (error) { reportSwallow(error, 'chat/composerTurn.stop.abortActive'); }
}

/** Tell a bound server turn to stop before detaching the local stream. */
export function interruptPendingTurn(): void {
  let sessionId: string | null = null;
  try { sessionId = stateStore.read('currentSessionId') || null; }
  catch (error) { reportSwallow(error, 'chat/composerTurn.interrupt.session'); }
  if (!sessionId) return;

  let pending: { turnId?: string } | null = null;
  try { pending = loadPendingTurn(sessionId); }
  catch (error) { reportSwallow(error, 'chat/composerTurn.interrupt.pending'); }
  if (!pending?.turnId) return;

  try { clearPendingTurn(sessionId); }
  catch (error) { reportSwallow(error, 'chat/composerTurn.interrupt.clear'); }
  try {
    void interruptChatTurn(pending.turnId).catch((error) => {
      reportSwallow(error, 'chat/composerTurn.interrupt.server');
    });
  } catch (error) {
    reportSwallow(error, 'chat/composerTurn.interrupt.serverCall');
  }
}
