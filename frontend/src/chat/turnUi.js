/* chat/turnUi.js — extracted from main.js (B5 batch).
 * Turn lifecycle UI: abort-quiet guards, turn progress, resend,
 * stop/send button states. Zero-behavior-change lift.
 * Cross-cluster turn entry points (askChatTurn, submitChatMessage)
 * resolve via window.* at call time to avoid circular imports.
 */
import { stateStore } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { turnState } from './turnState.js';
import { buildUserContentParts } from './history.js';
import { reportSwallow } from '../util/reportSwallow.ts';
export { setChatStopState, handleSendClick, stopChatResponse, interruptPendingTurn } from './composerTurn.ts';

function _t(key) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') return window.t(key);
  } catch (e) {reportSwallow(e, 'chat/turnUi._t'); }
  return key;
}

/* P_turn-abort-quiet — lifecycle aborts (auth expiry, session switch,
   turn superseded, …) are intentional control flow, not errors. */
export function isExpectedTurnAbort(e) {
  if (!e) return true;
  var s = '';
  try { s = String((e.reason != null ? e.reason : '') + ' ' + (e.message || e)).toLowerCase(); } catch (_) { return false; }
  if (/session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout/.test(s)) return true;
  var nm = ''; try { nm = String(e.name || ''); } catch (e) {reportSwallow(e, 'chat/turnUi.isExpectedTurnAbort'); }
  if (nm === 'AbortError' && /abort/i.test(s)) return true;
  return false;
}

/* P_turn-abort-quiet — rejection guard for fire-and-forget turn promises.
   Expected lifecycle aborts vanish; real failures log to console (the
   stream controller already surfaced them in-bubble, so no banner). */
export function quietTurn(p) {
  if (p && typeof p.catch === 'function') {
    p.catch(function (e) { if (!isExpectedTurnAbort(e)) { try { console.error('[chat] turn failed:', e); } catch (e) {reportSwallow(e, 'chat/turnUi.quietTurn'); } } });
  }
  return p;
}

/* Snapshot the most recent user message clientId into turnState.turnUi and mark the
   turn in progress. Called when a streaming turn starts. */
export function markTurnInProgress() {
  var lastUserId = null;
  for (var i = stateStore.read('messages').length - 1; i >= 0; i--) {
    if (stateStore.read('messages')[i] && stateStore.read('messages')[i].role === 'user') { lastUserId = stateStore.read('messages')[i].clientId; break; }
  }
  turnState.turnUi.inProgress = true;
  turnState.turnUi.lastUserMessageId = lastUserId;
}

/* Mark the turn as no longer in progress (finish/abort/error). Keeps
   lastUserMessageId so a later Resend can target the same user message. */
export function markTurnEnded() {
  turnState.turnUi.inProgress = false;
}

/* Re-run the send path from the most recent user message with a fresh turn
   (Req 2.7). Reuses askChatTurn's existing AbortController/isUserAbort path —
   no new retry logic. Returns true if a resend was dispatched. */
export function resendLastUserMessage() {
  var text = null;
  var attachments = null;
  for (var i = stateStore.read('messages').length - 1; i >= 0; i--) {
    var entry = stateStore.read('messages')[i];
    if (entry && entry.role === 'user') {
      text = entry.rawText || entry.content || null;
      attachments = entry.attachments;
      break;
    }
  }
  if (text && typeof window.askChatTurn === 'function') {
    /* Resend rewinds to the last user turn, so askChatTurn slices that
       entry out of history and re-appends the explicit content — rebuild
       its multimodal parts here or the resend loses image/PDF/text. */
    var parts = null;
    try { parts = buildUserContentParts(text, attachments); } catch (_) { parts = null; }
    quietTurn(window.askChatTurn(text, parts));
    return true;
  }
  try { showToast(_t('toast.noRetryTarget')); } catch (e) {reportSwallow(e, 'chat/turnUi.resendLastUserMessage'); }
  return false;
}
