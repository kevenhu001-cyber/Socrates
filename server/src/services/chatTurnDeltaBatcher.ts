/**
 * Coalesce adjacent high-frequency text/reasoning deltas before they enter the
 * durable chat-turn event queue. Live SSE is unaffected; persistence still
 * preserves exact text and ordering, but avoids one database event per token.
 */
export type DeltaEventName = 'content' | 'reasoning';
export type DeltaEventPublisher = (event: DeltaEventName, data: { delta: string }) => unknown;

export interface ChatTurnDeltaBatcher {
  push(event: DeltaEventName, delta: string): void;
  /** Persist buffered text now, before a semantic/tool/terminal event. */
  flush(): void;
  /** Discard only the timer; flush() should be called first when data matters. */
  dispose(): void;
}

export function createChatTurnDeltaBatcher(
  publish: DeltaEventPublisher,
  delayMs = 32,
): ChatTurnDeltaBatcher {
  let pendingEvent: DeltaEventName | null = null;
  let pendingDelta = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clearTimer();
    const event = pendingEvent;
    const delta = pendingDelta;
    pendingEvent = null;
    pendingDelta = '';
    if (event && delta) {
      try { publish(event, { delta }); } catch { /* persistence is best-effort */ }
    }
  };

  return {
    push(event, delta) {
      if (!delta) return;
      if (pendingEvent && pendingEvent !== event) flush();
      pendingEvent = event;
      pendingDelta += delta;
      if (timer !== null) return;
      timer = setTimeout(flush, Math.max(0, delayMs));
      timer.unref?.();
    },
    flush,
    dispose() {
      clearTimer();
      pendingEvent = null;
      pendingDelta = '';
    },
  };
}
