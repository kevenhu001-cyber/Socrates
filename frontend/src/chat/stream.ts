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
  type AIRequestOptions,
} from './retryPolicy.ts';
import { abandonServerTurn, newClientTurnId } from './turnClient.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

/** Bridges installed by main.js before any stream can run; a required shape
 * because a stream without them is a boot-order bug the original would throw on. */
interface StreamWindow extends Window {
  getActiveProvider: () => unknown;
  offlineGuard: () => boolean;
  STREAM_MAX_ATTEMPTS?: number;
  _activeChatAbort?: ((reason?: unknown) => void) | null;
}

/** Resolved value of a completed stream call. */
export interface StreamResult {
  text: string;
  html?: string | null;
  widgets?: unknown[];
  cancelled?: boolean;
}

/** Outcome of one attempt, produced by streamAttempt.js. */
export type StreamAttemptOutcome =
  | { kind: 'success'; result: StreamResult }
  | { kind: 'failure' }
  | { kind: 'cancelled'; result: StreamResult | null }
  | { kind: 'retry'; error: Error };

/** Options threaded through the streaming call. Tool-callback handlers ride
 * along as extra keys because the frame processor invokes them by name. */
export interface StreamCallOptions extends AIRequestOptions {
  maxAttempts?: number;
  turnId?: string;
  [key: string]: unknown;
}

/** `null` is allowed: exam generation calls without a delta sink. */
export type StreamDeltaHandler = ((text: string, full: string) => void) | null;
export type StreamThinkingHandler = ((text: string) => void) | null;

function setLastCallError(value: string | null): void {
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value });
}

function bindAbortSignal(
  parent: AbortSignal | null | undefined,
  child: { abort(reason?: unknown): void },
): (() => void) | null {
  if (!parent) return null;
  const onAbort = (): void => {
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

function maxStreamAttempts(opts?: StreamCallOptions | null): number {
  const configured = opts && typeof opts.maxAttempts === 'number'
    ? opts.maxAttempts
    : (window as unknown as StreamWindow).STREAM_MAX_ATTEMPTS;
  return typeof configured === 'number' && configured > 0
    ? configured
    : AI_MAX_ATTEMPTS;
}

/* Drop the global abort handle only while it is still the one this call
   installed. A superseded stream unwinds after the next turn has put its
   own handle in place; an older cleanup must not erase the live handle. */
function clearActiveChatAbort(handle: unknown): void {
  const win = window as unknown as StreamWindow;
  if (handle && win._activeChatAbort === handle) win._activeChatAbort = null;
}

/* Streaming variant. Calls /api/chat/stream (our backend SSE proxy).
   onDelta(text, full) is called for every text chunk the upstream produces.
   Resolves to {text, html, widgets, cancelled} on success, or null on failure.
   There is no client-side response deadline: reasoning may take as long as
   needed, while transient transport failures use the shared retry policy. */
export async function callAPIStream(
  messages: unknown,
  maxTokens: number,
  onDelta: StreamDeltaHandler,
  onThinking: StreamThinkingHandler,
  opts?: StreamCallOptions | null,
): Promise<StreamResult | null> {
  const win = window as unknown as StreamWindow;
  const getActiveProvider = win.getActiveProvider;
  const offlineGuard = win.offlineGuard;
  const maxAttempts = maxStreamAttempts(opts);
  const retryOptions: AIRequestOptions = Object.assign({}, opts || {}, {
    source: 'chat',
    maxRetries: maxAttempts - 1,
  });

  if (!getActiveProvider()) {
    setLastCallError('no provider');
    return null;
  }
  setLastCallError(null);

  const turnController = new AbortController();
  const unbindExternal = bindAbortSignal(retryOptions.signal ?? null, turnController);
  let activeAbortHandle: ((reason?: unknown) => void) | null = null;
  const waitForRetry = async (attempt: number, error: unknown): Promise<boolean> => {
    try {
      return await waitForAIRetry(attempt, error, Object.assign({}, retryOptions, {
        signal: turnController.signal,
      }));
    } catch (caught) {
      if (isUserAbort(caught, turnController.signal) || isUserAbort(caught, retryOptions.signal)) {
        return false;
      }
      throw caught;
    }
  };
  const retryWasCancelled = (): boolean => turnController.signal.aborted
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
    let lastError: Error | null = null;

    // Shell consumers need the stream API, not the HTTP reader and SSE
    // processor. Bind cancellation BEFORE loading that execution graph so
    // Stop/session changes during a cold import cannot send a stale request.
    activeAbortHandle = (reason) => turnController.abort(reason || 'user-stop');
    win._activeChatAbort = activeAbortHandle;
    const { runStreamAttempt } = await import('./streamAttempt.js');
    if (turnController.signal.aborted) return { text: '', cancelled: true };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      /* streamAttempt.js is still untyped; the outcome union is declared here
         and the module can adopt it wholesale when it converts. */
      const outcome = (await runStreamAttempt({
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
        bindAttemptSignal: (controller: { abort(reason?: unknown): void }) =>
          bindAbortSignal(turnController.signal, controller),
        onAbortHandle: (handle: (reason?: unknown) => void) => { activeAbortHandle = handle; },
        waitForRetry,
        retryWasCancelled,
        setLastCallError,
      })) as StreamAttemptOutcome;

      if (outcome.kind === 'success' || outcome.kind === 'cancelled') return outcome.result;
      if (outcome.kind === 'retry') {
        lastError = outcome.error;
        /* The failed attempt's server turn keeps generating upstream tokens
           until the server's stale-turn reclaim runs (120 s). With several
           attempts allowed per user action that is several concurrent paid
           generations for one question — stop the turn we are replacing
           before opening the next one.
           Skip it when the next attempt rebinds the SAME turn (an explicit
           turnId): interrupting that would kill the attempt that is about to
           start. */
        const rebindsSameTurn = !!(opts && typeof opts.turnId === 'string' && opts.turnId);
        if (!rebindsSameTurn) abandonServerTurn(activeTurn.current);
        /* Renew clientTurnId so attempt 2 does not collide with attempt 1's
           turn execution claim on the server. */
        if (opts && typeof opts === 'object' && opts.clientTurn && typeof (opts.clientTurn as { id?: unknown }).id === 'string') {
          (opts.clientTurn as { id: string }).id = newClientTurnId();
        }
        activeTurn.current = null;
        continue;
      }
      return null;
    }

    /* Keep an error visible even when every retryable attempt was exhausted. */
    setLastCallError((lastError && lastError.message) || 'Stream failed after all retries');
    return null;
  } finally {
    if (unbindExternal) unbindExternal();
    clearActiveChatAbort(activeAbortHandle);
  }
}
