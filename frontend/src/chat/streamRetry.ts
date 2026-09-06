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

/** Create the retry-viewport store (one per app lifetime). */
export function createStreamRetryViewport(): StreamRetryViewport {
  let pendingViewport: RetryViewportSnapshot | null = null;
  let retryPressViewport: RetryViewportSnapshot | null = null;
  let stableViewport: RetryViewportSnapshot | null = null;

  function measureViewport(
    list: HTMLElement | null,
    clientId: string,
    ttlMs?: number,
  ): RetryViewportSnapshot | null {
    if (!list) return null;
    const row = list.querySelector('[data-client-id="' + clientId + '"]');
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

  function consumeViewport(): RetryViewportSnapshot | null {
    const pending = pendingViewport;
    pendingViewport = null;
    if (!pending || pending.expiresAt < Date.now()) return null;
    return pending;
  }

  function captureViewport(
    list: HTMLElement | null,
    clientId: string,
  ): RetryViewportSnapshot | null {
    if (!list) return null;
    /* Playwright and some browsers may scroll a focused button into view before
       pointerdown. Prefer the offset captured while the finalized error row was
       stably visible; this is also the position a real user saw before tapping
       Retry. The short-lived press snapshot still protects pointer/mouse event
       duplication when no stable error snapshot exists. */
    const stable = stableViewport;
    if (stable && stable.clientId === clientId && stable.expiresAt >= Date.now()) {
      const stablePress: RetryViewportSnapshot = {
        clientId,
        offset: stable.offset,
        expiresAt: Date.now() + 2000,
      };
      retryPressViewport = stablePress;
      return stablePress;
    }
    /* Pointer and compatibility mouse events can both fire for one tap.
       Preserve the first (pre-focus) measurement; a later mousedown must not
       overwrite it after the composer/layout has already started changing. */
    const existing = retryPressViewport;
    if (existing && existing.clientId === clientId && existing.expiresAt >= Date.now()) {
      return existing;
    }
    const snapshot = measureViewport(list, clientId, 2000);
    if (!snapshot) return null;
    retryPressViewport = snapshot;
    return snapshot;
  }

  function prepareViewport(
    list: HTMLElement | null,
    msgIdx: number,
    clientId: string,
  ): void {
    if (!list) return;
    const pressed = retryPressViewport;
    retryPressViewport = null;
    stableViewport = null;
    let offset: number;
    let row: Element | null = null;
    if (pressed && pressed.clientId === clientId && pressed.expiresAt >= Date.now()) {
      offset = pressed.offset;
    } else {
      row = list.querySelector('[data-client-id="' + clientId + '"]');
      const anchor = row && (row.querySelector('.msg-error') || row);
      const listRect = list.getBoundingClientRect();
      const anchorRect = anchor && anchor.getBoundingClientRect();
      offset = anchorRect ? Math.round(anchorRect.top - listRect.top) : 24;
    }
    pendingViewport = {
      offset,
      expiresAt: Date.now() + 15000,
    };

    const messages = stateStore.read('messages') as Array<{ clientId?: string } | null>;
    const currentIndex = messages.findIndex(
      (message) => message && message.clientId === clientId,
    );
    if (currentIndex >= 0) {
      stateStore.dispatch({
        type: 'session/remove-message-at',
        index: currentIndex,
        clientId,
      });
    }
    if (row && row.parentNode === list) row.remove();
    publishReactChatRuntime({
      type: 'stream-retry-replaced',
      messageId: clientId,
      messageIndex: msgIdx,
    });
  }

  /* The failed stream's legacy bubble and its durable React replacement do not
     commit in the same frame. Keep a reader who was already pinned at the
     bottom pinned through that short handoff, and remember the error row's last
     stable offset for Retry. Any real interaction immediately releases this
     correction so manual reading/scrolling always wins. */
  function settleErrorViewport(
    list: HTMLElement | null,
    clientId: string,
    onOffset: (offset: number) => void,
  ): void {
    if (!list || typeof onOffset !== 'function') return;
    const keepPinned = !stateStore.read('_userScrolledAway');
    let userIntent = false;
    const intentEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const markIntent = (): void => {
      userIntent = true;
    };
    for (const name of intentEvents) {
      window.addEventListener(name, markIntent, { passive: true, capture: true });
    }
    const detach = (): void => {
      for (const name of intentEvents) {
        window.removeEventListener(name, markIntent, { capture: true });
      }
    };
    let frames = 0;
    const settle = (): void => {
      if (userIntent) {
        detach();
        return;
      }
      if (keepPinned) {
        list.scrollTop = list.scrollHeight;
        stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value: false });
      }
      const row = list.querySelector('[data-client-id="' + clientId + '"]');
      const anchor = row && (row.querySelector('.msg-error') || row);
      if (anchor) {
        const offset = Math.round(
          anchor.getBoundingClientRect().top - list.getBoundingClientRect().top,
        );
        onOffset(offset);
      }
      if (++frames < 45) requestAnimationFrame(settle);
      else detach();
    };
    requestAnimationFrame(settle);
  }

  function clearPendingViewport(): void {
    pendingViewport = null;
  }

  function rememberStableViewport(clientId: string, offset: number, ttlMs = 60000): void {
    stableViewport = {
      clientId,
      offset,
      expiresAt: Date.now() + ttlMs,
    };
  }

  return {
    consumeViewport,
    measureViewport,
    captureViewport,
    prepareViewport,
    settleErrorViewport,
    clearPendingViewport,
    rememberStableViewport,
  };
}
