/* ── Streaming chat LLM call ──
   SSE consumer for /api/chat/stream and the built-in Beagle proxy.
   Per-attempt request and stream handling lives in streamAttempt.js;
   this module owns provider validation, retry policy, and turn cleanup.
   Bubble rendering and turn-controller setup live in the lazy
   streamingTurn.js module; message submission stays in sendPipeline.js.
   Reads main.js globals via window.* (state, getActiveProvider,
   offlineGuard, etc.). */

import { stateStore } from '../state/store.js';
import {
  AI_MAX_ATTEMPTS,
  isUserAbort,
  waitForAIRetry,
} from './retryPolicy.ts';
import { runStreamAttempt } from './streamAttempt.js';
import { reportSwallow } from '../util/reportSwallow.ts';

function setLastCallError(value) {
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value });
}

function bindAbortSignal(parent, child) {
  if (!parent) return null;
  const onAbort = () => {
    try { child.abort(parent.reason || 'aborted'); }
    catch (error) { reportSwallow(error, 'chat/stream.bindAbortSignal'); }
  };
  if (parent.aborted) onAbort();
  else parent.addEventListener('abort', onAbort, { once: true });
  return () => {
    try { parent.removeEventListener('abort', onAbort); }
    catch (error) { reportSwallow(error, 'chat/stream.bindAbortSignal#2'); }
  };
}

function maxStreamAttempts(opts) {
  const configuredAttempts = opts && typeof opts.maxAttempts === 'number'
    ? opts.maxAttempts
    : window.STREAM_MAX_ATTEMPTS;
  return typeof configuredAttempts === 'number' && configuredAttempts > 0
    ? configuredAttempts
    : AI_MAX_ATTEMPTS;
}

/* Drop the global abort handle only while it is still the one this call
   installed. A superseded stream unwinds after the next turn has put its
   own handle in place; an older cleanup must not erase the live handle. */
function clearActiveChatAbort(handle) {
  if (handle && window._activeChatAbort === handle) window._activeChatAbort = null;
}

/* Streaming variant. Calls /api/chat/stream (our backend SSE proxy).
   onDelta(text, full) is called for every text chunk the upstream produces.
   Resolves to {text, html, widgets, cancelled} on success, or null on failure.
   There is no client-side response deadline: reasoning may take as long as
   needed, while transient transport failures use the shared retry policy. */
export async function callAPIStream(messages, maxTokens, onDelta, onThinking, opts) {
  const getActiveProvider = window.getActiveProvider;
  const offlineGuard = window.offlineGuard;
  const maxAttempts = maxStreamAttempts(opts);
  const retryOptions = Object.assign({}, opts || {}, {
    source: 'chat',
    maxRetries: maxAttempts - 1,
  });

  if (!getActiveProvider()) {
    setLastCallError('no provider');
    return null;
  }
  setLastCallError(null);

  const turnController = new AbortController();
  const unbindExternal = bindAbortSignal(retryOptions.signal, turnController);
  let activeAbortHandle = null;
  const waitForRetry = async (attempt, error) => {
    try {
      return await waitForAIRetry(attempt, error, Object.assign({}, retryOptions, {
        signal: turnController.signal,
      }));
    } catch (caught) {
      if (isUserAbort(caught, turnController.signal) || isUserAbort(caught, retryOptions.signal)) return false;
      throw caught;
    }
  };
  const retryWasCancelled = () => turnController.signal.aborted
    && isUserAbort(null, turnController.signal);

  try {
    /* Fail fast when the OS already knows the network is unavailable. */
    if (offlineGuard()) {
      setLastCallError('offline: you appear to be offline');
      return null;
    }

    const activeTurn = {
      current: opts && typeof opts.turnId === 'string' ? opts.turnId : null,
    };
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outcome = await runStreamAttempt({
        messages,
        maxTokens,
        onDelta,
        onThinking,
        opts,
        attempt,
        lastError,
        turnController,
        turnSignal: turnController.signal,
        activeTurn,
        bindAttemptSignal: (controller) => bindAbortSignal(turnController.signal, controller),
        onAbortHandle: (handle) => { activeAbortHandle = handle; },
        waitForRetry,
        retryWasCancelled,
        setLastCallError,
      });

      if (outcome.kind === 'success' || outcome.kind === 'cancelled') return outcome.result;
      if (outcome.kind === 'retry') {
        lastError = outcome.error;
        continue;
      }
      return null;
    }

    /* Keep an error visible even when every retryable attempt was exhausted. */
    setLastCallError(lastError && lastError.message || 'Stream failed after all retries');
    return null;
  } finally {
    if (unbindExternal) unbindExternal();
    clearActiveChatAbort(activeAbortHandle);
  }
}
