export interface StreamRetryDecision {
  isHeartbeat: boolean;
  semanticActivity: boolean;
  attempt: number;
  maxAttempts: number;
}

/** A full SSE request may be replayed only before visible/semantic output. */
export function shouldRetryInterruptedStream(decision: StreamRetryDecision): boolean {
  return decision.isHeartbeat
    && !decision.semanticActivity
    && decision.attempt < decision.maxAttempts;
}

import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { smoothScrollToBottom } from '../ui/scroll.js';

/** A captured viewport offset for one message row. */
export interface RetryViewportSnapshot {
  /** Absent on the pending replacement offset, which applies to the next stream. */
  clientId?: string;
  offset: number;
  expiresAt: number;
}

/**
 * Retry-viewport anchoring for failed streams.
 *
 * When a stream fails, the error row reserves viewport space so a Retry
 * starts where the interruption was visible instead of jumping back to
 * the user's prompt. The three snapshots (pending replacement offset,
 * press-time capture, last stable error offset) live in this factory's
 * closure; previously they were module-level vars in main.js.
 */
export interface StreamRetryViewport {
  /** Take the pending replacement offset, if still fresh. */
  consumeViewport(): RetryViewportSnapshot | null;
  /** Measure a row's current offset from the list top. */
  measureViewport(
    list: HTMLElement | null,
    clientId: string,
    ttlMs?: number,
  ): RetryViewportSnapshot | null;
  /** Capture the visible error offset before Retry steals focus. */
  captureViewport(list: HTMLElement | null, clientId: string): RetryViewportSnapshot | null;
  /** Replace the failed entry and stash the offset for the new stream. */
  prepareViewport(list: HTMLElement | null, msgIdx: number, clientId: string): void;
  /** Pin the reader through the legacy/React bubble handoff. */
  settleErrorViewport(
    list: HTMLElement | null,
    clientId: string,
    onOffset: (offset: number) => void,
  ): void;
  /** Drop the pending replacement offset (a new user turn began). */
  clearPendingViewport(): void;
  /** Remember the error row's last stable offset for a later Retry press. */
  rememberStableViewport(clientId: string, offset: number, ttlMs?: number): void;
}

/** Find a message without interpolating untrusted IDs into CSS selectors. */
function findMessageRow(list: HTMLElement, clientId: string): Element | null {
  for (const row of list.querySelectorAll('[data-client-id]')) {
    if (row.getAttribute('data-client-id') === clientId) return row;
  }
  return null;
}

interface StreamRetryViewportState {
  pendingViewport: RetryViewportSnapshot | null;
  retryPressViewport: RetryViewportSnapshot | null;
  stableViewport: RetryViewportSnapshot | null;
}

function measureRetryViewport(
  list: HTMLElement | null,
  clientId: string,
  ttlMs?: number,
): RetryViewportSnapshot | null {
  if (!list) return null;
  const row = findMessageRow(list, clientId);
  const anchor = row && (row.querySelector('.msg-error') || row);
  const listRect = list.getBoundingClientRect();
  const anchorRect = anchor && anchor.getBoundingClientRect();
  if (!anchorRect) return null;
  return {
    clientId,
    offset: Math.round(anchorRect.top - listRect.top),
    expiresAt: Date.now() + Math.max(1000, ttlMs || 2000),
  };
}

function consumeRetryViewport(state: StreamRetryViewportState): RetryViewportSnapshot | null {
  const pending = state.pendingViewport;
  state.pendingViewport = null;
  if (!pending || pending.expiresAt < Date.now()) return null;
  return pending;
}

function captureRetryViewport(
  state: StreamRetryViewportState,
  list: HTMLElement | null,
  clientId: string,
): RetryViewportSnapshot | null {
  if (!list) return null;
  /* Playwright and some browsers may scroll a focused button into view before
     pointerdown. Prefer the offset captured while the finalized error row was
     stably visible; this is also the position a real user saw before tapping
     Retry. The short-lived press snapshot still protects pointer/mouse event
     duplication when no stable error snapshot exists. */
  const stable = state.stableViewport;
  if (stable && stable.clientId === clientId && stable.expiresAt >= Date.now()) {
    const stablePress = { clientId, offset: stable.offset, expiresAt: Date.now() + 2000 };
    state.retryPressViewport = stablePress;
    return stablePress;
  }
  /* Pointer and compatibility mouse events can both fire for one tap.
     Preserve the first (pre-focus) measurement; a later mousedown must not
     overwrite it after the composer/layout has already started changing. */
  const existing = state.retryPressViewport;
  if (existing && existing.clientId === clientId && existing.expiresAt >= Date.now()) {
    return existing;
  }
  const snapshot = measureRetryViewport(list, clientId, 2000);
  if (!snapshot) return null;
  state.retryPressViewport = snapshot;
  return snapshot;
}

function prepareRetryViewport(
  state: StreamRetryViewportState,
  list: HTMLElement | null,
  msgIdx: number,
  clientId: string,
): void {
  if (!list) return;
  const pressed = state.retryPressViewport;
  state.retryPressViewport = null;
  state.stableViewport = null;
  const row = findMessageRow(list, clientId);
  const offset = pressed && pressed.clientId === clientId && pressed.expiresAt >= Date.now()
    ? pressed.offset
    : measureRowOffset(list, row, 24);
  state.pendingViewport = { offset, expiresAt: Date.now() + 15000 };

  const messages = stateStore.read('messages') as Array<{ clientId?: string } | null>;
  const currentIndex = messages.findIndex((message) => message && message.clientId === clientId);
  if (currentIndex >= 0) {
    stateStore.dispatch({ type: 'session/remove-message-at', index: currentIndex, clientId });
  }
  // React owns its rows through the state update above. Removing one here
  // makes the next React commit throw NotFoundError and lose the transcript.
  if (row && row.parentNode === list && !row.hasAttribute('data-react-owned')) row.remove();
  publishReactChatRuntime({ type: 'stream-retry-replaced', messageId: clientId, messageIndex: msgIdx });
}

function measureRowOffset(list: HTMLElement, row: Element | null, fallback: number): number {
  const anchor = row && (row.querySelector('.msg-error') || row);
  const anchorRect = anchor && anchor.getBoundingClientRect();
  return anchorRect ? Math.round(anchorRect.top - list.getBoundingClientRect().top) : fallback;
}

function watchViewportIntent(): { hasIntent(): boolean; detach(): void } {
  let userIntent = false;
  const intentEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  const markIntent = (): void => {
    userIntent = true;
  };
  for (const name of intentEvents) {
    window.addEventListener(name, markIntent, { passive: true, capture: true });
  }
  return {
    hasIntent: () => userIntent,
    detach: () => {
      for (const name of intentEvents) {
        window.removeEventListener(name, markIntent, { capture: true });
      }
    },
  };
}

function settleErrorViewport(
  list: HTMLElement | null,
  clientId: string,
  onOffset: (offset: number) => void,
): void {
  if (!list || typeof onOffset !== 'function') return;
  const keepPinned = !stateStore.read('_userScrolledAway');
  const intent = watchViewportIntent();
  let frames = 0;
  const settle = (): void => {
    if (intent.hasIntent()) {
      intent.detach();
      return;
    }
    if (keepPinned) {
      smoothScrollToBottom(list, { smooth: false, owner: 'retry' });
      stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
    }
    const row = findMessageRow(list, clientId);
    if (row) onOffset(measureRowOffset(list, row, 0));
    if (++frames < 45) requestAnimationFrame(settle);
    else intent.detach();
  };
  requestAnimationFrame(settle);
}

/** Create the retry-viewport store (one per app lifetime). */
export function createStreamRetryViewport(): StreamRetryViewport {
  const state: StreamRetryViewportState = {
    pendingViewport: null,
    retryPressViewport: null,
    stableViewport: null,
  };
  return {
    consumeViewport: () => consumeRetryViewport(state),
    measureViewport: measureRetryViewport,
    captureViewport: (list, clientId) => captureRetryViewport(state, list, clientId),
    prepareViewport: (list, msgIdx, clientId) => prepareRetryViewport(state, list, msgIdx, clientId),
    settleErrorViewport,
    clearPendingViewport: () => { state.pendingViewport = null; },
    rememberStableViewport: (clientId, offset, ttlMs = 60000) => {
      state.stableViewport = { clientId, offset, expiresAt: Date.now() + ttlMs };
    },
  };
}
