/* chat/turnUi.ts — extracted from main.js (B5 batch).
 * Turn lifecycle UI: abort-quiet guards, turn progress, resend,
 * stop/send button states. Zero-behavior-change lift.
 * Cross-cluster turn entry points (askChatTurn, submitChatMessage)
 * resolve via window.* at call time to avoid circular imports.
 */
import { stateStore } from '../state/store.ts';
import { showToast } from '../ui/toast.js';
import { turnState } from './turnState.ts';
import { buildUserContentParts } from './history.js';
import { reportSwallow } from '../util/reportSwallow.ts';
export { setChatStopState, handleSendClick, stopChatResponse, interruptPendingTurn } from './composerTurn.ts';

/** The chat entry point published by the legacy shell. */
interface TurnUiWindow extends Window {
  askChatTurn?: (text: string, parts: unknown) => unknown;
}

/** A message row as far as the turn helpers read it. */
interface TurnMessage {
  role?: string;
  clientId?: string | null;
  rawText?: string | null;
  content?: string | null;
  attachments?: unknown;
}

/** A promise-like the quiet-turn guard can attach a rejection handler to. */
interface Catchable {
  catch(onRejected: (error: unknown) => void): unknown;
}

function _t(key: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') return window.t(key);
  } catch (e) { reportSwallow(e, 'chat/turnUi._t'); }
  return key;
}

function messages(): TurnMessage[] {
  const list = stateStore.read('messages');
  return Array.isArray(list) ? (list as TurnMessage[]) : [];
}

/* P_turn-abort-quiet — lifecycle aborts (auth expiry, session switch,
   turn superseded, …) are intentional control flow, not errors. */
export function isExpectedTurnAbort(e: unknown): boolean {
  if (!e) return true;
  const error = e as { reason?: unknown; message?: unknown; name?: unknown };
  let s: string;
  try { s = String((error.reason != null ? error.reason : '') + ' ' + (error.message || e)).toLowerCase(); } catch { return false; }
  if (/session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout/.test(s)) return true;
  let nm = '';
  try { nm = String(error.name || ''); } catch (err) { reportSwallow(err, 'chat/turnUi.isExpectedTurnAbort'); }
  if (nm === 'AbortError' && /abort/i.test(s)) return true;
  return false;
}

/* P_turn-abort-quiet — rejection guard for fire-and-forget turn promises.
   Expected lifecycle aborts vanish; real failures log to console (the
   stream controller already surfaced them in-bubble, so no banner). */
export function quietTurn<T>(p: T): T {
  const catchable = p as unknown as Catchable | null | undefined;
  if (catchable && typeof catchable.catch === 'function') {
    catchable.catch(function (e) {
      if (!isExpectedTurnAbort(e)) {
        try { console.error('[chat] turn failed:', e); } catch (err) { reportSwallow(err, 'chat/turnUi.quietTurn'); }
      }
    });
  }
  return p;
}

/* Snapshot the most recent user message clientId into turnState.turnUi and mark the
   turn in progress. Called when a streaming turn starts. */
export function markTurnInProgress(): void {
  let lastUserId: string | null = null;
  const list = messages();
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].role === 'user') { lastUserId = list[i].clientId ?? null; break; }
  }
  turnState.turnUi.inProgress = true;
  turnState.turnUi.lastUserMessageId = lastUserId;
}

/* Mark the turn as no longer in progress (finish/abort/error). Keeps
   lastUserMessageId so a later Resend can target the same user message. */
export function markTurnEnded(): void {
  turnState.turnUi.inProgress = false;
}

/* Re-run the send path from the most recent user message with a fresh turn
   (Req 2.7). Reuses askChatTurn's existing AbortController/isUserAbort path —
   no new retry logic. Returns true if a resend was dispatched. */
export function resendLastUserMessage(): boolean {
  let text: string | null = null;
  let attachments: unknown = null;
  const list = messages();
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (entry && entry.role === 'user') {
      text = entry.rawText || entry.content || null;
      attachments = entry.attachments;
      break;
    }
  }
  const win = window as TurnUiWindow;
  if (text && typeof win.askChatTurn === 'function') {
    /* Resend rewinds to the last user turn, so askChatTurn slices that
       entry out of history and re-appends the explicit content — rebuild
       its multimodal parts here or the resend loses image/PDF/text. */
    let parts: unknown;
    try { parts = buildUserContentParts(text, attachments); } catch { parts = null; }
    quietTurn(win.askChatTurn(text, parts));
    return true;
  }
  try { showToast(_t('toast.noRetryTarget')); } catch (e) { reportSwallow(e, 'chat/turnUi.resendLastUserMessage'); }
  return false;
}
