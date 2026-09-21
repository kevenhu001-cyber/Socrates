/* chat/liveTurn.js — extracted from main.js (B5 batch).
 * Live-turn registries: retry owner, runtime map for Codex approvals,
 * message lookup, approval checks, search-retry wiring.
 * Zero-behavior-change lift; state lives in turnState.js.
 */
import { stateStore } from '../state/store.js';
import { turnState } from './turnState.js';

/* P_react-live-turn — one live turn may be retried, and only its own
   streaming closure knows how (it holds the prompt, the retry budget, and the
   viewport to re-anchor). React's status line and the legacy timeout block
   therefore both route through this registry instead of each owning a click
   handler. The newest stream claims it; finish()/abort() release it. */
export function claimLiveRetry(owner, run) {
  turnState.liveRetryOwner = owner ? { owner: owner, run: run } : null;
}

export function retryLiveTurn(messageId) {
  var owner = turnState.liveRetryOwner;
  if (!owner) return false;
  if (messageId && String(owner.owner.clientId || '') !== String(messageId)) return false;
  try { owner.run(); } catch (_) { /* the retry handler threw — the turn is unchanged */ }
  return true;
}

/* P_react-live-turn — a declarative row answers a Codex approval through
   __socratesLegacy.liveTurn, and the only code that can POST a decision lives
   inside the runtime that recorded it (chat/toolRuntime.ts needs the message
   closure to write the outcome back onto toolCalls[].approval). */
export function registerLiveTurnRuntime(messageId, runtime) {
  if (!messageId || !runtime) return;
  turnState.liveTurnRuntimes.set(String(messageId), runtime);
  if (turnState.liveTurnRuntimes.size > 16) {
    var oldest = turnState.liveTurnRuntimes.keys().next().value;
    turnState.liveTurnRuntimes.delete(oldest);
  }
}

export function liveTurnMessage(messageId) {
  var key = String(messageId || '');
  var msgs = stateStore.read('messages') || [];
  if (!key) return null;
  for (var i = msgs.length - 1; i >= 0; i--) {
    var m = msgs[i];
    if (m && (String(m.clientId || '') === key || String(m.id || '') === key)) return m;
  }
  return null;
}

export function approvalStillPending(message) {
  var calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
  for (var i = 0; i < calls.length; i++) {
    var ap = calls[i] && calls[i].approval;
    if (ap && (!ap.status || ap.status === 'pending')) return true;
  }
  return false;
}

export function decideLiveApproval(messageId, toolCallId, decision) {
  var key = String(messageId || '');
  var runtime = turnState.liveTurnRuntimes.get(key);
  var message = liveTurnMessage(key);
  if (!runtime || !approvalStillPending(message)) {
    turnState.liveTurnRuntimes.delete(key);
    return null;
  }
  if (typeof runtime.decideApproval !== 'function') return null;
  /* The runtime records a failed POST into approval.ui (which the row paints)
     and re-enables the buttons, so the rejection has nowhere useful left to
     go — swallow it rather than leave an unhandled promise. */
  return Promise.resolve(runtime.decideApproval(toolCallId, decision)).catch(function () {});
}

/* P_tool_retry_button — Retry on a failed search row re-issues the query
   through the streaming closure that owns the prompt (`onSearchRetry`). */
export function claimLiveSearchRetry(handler) {
  turnState.liveSearchRetry = typeof handler === 'function' ? handler : null;
}

/* One-shot wiring guard: the document-level tool-retry listener must only
   be registered once. */
export function installLiveTurnRetryListener() {
  if (typeof document !== 'undefined' && !turnState.toolRetryWired) {
    turnState.toolRetryWired = true;
    document.addEventListener('tool-retry', function (ev) {
      var detail = (ev && ev.detail) || {};
      /* share.js / history replay install their own handler for the same event. */
      var handler = (typeof window.__socratesToolRetry === 'function')
        ? window.__socratesToolRetry : turnState.liveSearchRetry;
      if (typeof handler !== 'function') return;
      /* P_tool_retry_prompt — pass the whole detail so repair prompts
         (viz-failure "Fix with AI") reach the handler alongside the
         legacy `query` field. */
      try { handler(detail.query || '', detail); } catch (_) { /* a failed retry is just a missed click */ }
    });
  }
}
