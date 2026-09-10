/* chat/turnUi.js — extracted from main.js (B5 batch).
 * Turn lifecycle UI: abort-quiet guards, turn progress, resend,
 * stop/send button states. Zero-behavior-change lift.
 * Cross-cluster turn entry points (askChatTurn, submitChatMessage)
 * resolve via window.* at call time to avoid circular imports.
 */
import { stateStore } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { turnState } from './turnState.js';
import { clearPendingTurn, interruptChatTurn, loadPendingTurn } from './turnClient.ts';

function _t(key) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') return window.t(key);
  } catch (_) {}
  return key;
}

/* P_turn-abort-quiet — lifecycle aborts (auth expiry, session switch,
   turn superseded, …) are intentional control flow, not errors. */
export function isExpectedTurnAbort(e) {
  if (!e) return true;
  var s = '';
  try { s = String((e.reason != null ? e.reason : '') + ' ' + (e.message || e)).toLowerCase(); } catch (_) { return false; }
  if (/session-expired|session-switch|session-deleted|session-purged|session-reset|archived-session|new-session|superseded|msg-edit|msg-regen|signout|sign-out|user-stop|user_stop|cancelled|canceled|first-delta-timeout/.test(s)) return true;
  var nm = ''; try { nm = String(e.name || ''); } catch (_) {}
  if (nm === 'AbortError' && /abort/i.test(s)) return true;
  return false;
}

/* P_turn-abort-quiet — rejection guard for fire-and-forget turn promises.
   Expected lifecycle aborts vanish; real failures log to console (the
   stream controller already surfaced them in-bubble, so no banner). */
export function quietTurn(p) {
  if (p && typeof p.catch === 'function') {
    p.catch(function (e) { if (!isExpectedTurnAbort(e)) { try { console.error('[chat] turn failed:', e); } catch (_) {} } });
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
  for (var i = stateStore.read('messages').length - 1; i >= 0; i--) {
    if (stateStore.read('messages')[i] && stateStore.read('messages')[i].role === 'user') {
      text = stateStore.read('messages')[i].rawText || stateStore.read('messages')[i].content || null;
      break;
    }
  }
  if (text && typeof window.askChatTurn === 'function') {
    quietTurn(window.askChatTurn(text));
    return true;
  }
  try { showToast(_t('toast.noRetryTarget')); } catch (_) {}
  return false;
}

/* Morph the send button into a red Stop button during streaming,
   or restore it to the normal send arrow when idle. React owns
   #sendBtnContent and re-renders the icon from dataset.stop, so
   this function only toggles the dataset + CSS class. */
export function setChatStopState(active) {
  var btn = document.getElementById('sendBtn');
  if (!btn) return;
  if (active) {
    btn.classList.add('chat-stop');
    btn.dataset.stop = '1';
  } else {
    btn.classList.remove('chat-stop');
    btn.dataset.stop = '0';
  }
  /* React owns #sendBtnContent and re-renders the icon from dataset.stop. */
}

/* Wrapper for the send/stop button click. When a stream is active,
   clicking stops it; otherwise it sends the message. */
export function handleSendClick() {
  var btn = document.getElementById('sendBtn');
  if (btn && btn.dataset.stop === '1') {
    /* M2 Stop semantics — aborting the socket only detaches the feed
       when the turn is bound; flip the server turn to interrupted so
       the detached worker stops instead of running to completion. */
    try{ interruptPendingTurn(); }catch(_){}
    if (turnState.activeChatCtl) {
      turnState.activeChatCtl.abort();
    }
    if (window._activeChatAbort) {
      try { window._activeChatAbort('user-stop'); } catch (_) {}
    }
  } else {
    /* submitChatMessage snapshots and commits the draft before its first
       await, then blurs during that same synchronous phase. Reading first is
       important: on mobile a focus-driven layout change can otherwise race
       Tiptap's selection transaction and leave only the morph animation. */
    if (typeof window.submitChatMessage === 'function') {
      window.submitChatMessage(null, { blurAfterSend: true });
    }
  }
}

export function stopChatResponse() {
  try{ interruptPendingTurn(); }catch(_){}
  if (turnState.activeChatCtl && typeof turnState.activeChatCtl.abort === 'function') {
    turnState.activeChatCtl.abort();
  }
  if (window._activeChatAbort) {
    try { window._activeChatAbort('user-stop'); } catch (_) {}
  }
}

/* Best-effort Stop propagation for bound turns. Reads the pending-turn
   pointer for the active session and flips the server row; the worker
   polls the row and aborts the upstream call. Fire-and-forget: socket
   abort below already detaches the feed. */
function interruptPendingTurn() {
  var sid = null;
  try{ sid = stateStore.read('currentSessionId') || null; }catch(_){}
  if (!sid) return;
  var pending = null;
  try{ pending = loadPendingTurn(sid); }catch(_){}
  if (!pending || !pending.turnId) return;
  try{ clearPendingTurn(sid); }catch(_){}
  try{
    var p = interruptChatTurn(pending.turnId);
    if (p && typeof p.catch === 'function') p.catch(function(){});
  }catch(_){}
}
