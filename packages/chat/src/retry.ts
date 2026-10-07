/* retry — DOM-free stream retry / offline policy. Ports the pure
 * core of `frontend/src/chat/offline.ts` (retry constants + offline
 * probe) and the replay gate of `frontend/src/chat/streamRetry.ts`.
 *
 * Deliberately NOT ported: the retry-viewport anchoring
 * (`createStreamRetryViewport`) — it measures HTMLElement offsets with
 * getBoundingClientRect/requestAnimationFrame and only makes sense in
 * the web baseline's DOM list. The Universal App transcript is a
 * FlatList; a failed turn keeps its error row in place and Retry
 * replays from the same anchor instead of restoring a pixel offset. */

/** Six attempts = the initial request plus five fixed-delay retries. */
export const STREAM_MAX_ATTEMPTS = 6;
/* P_524-no-retry — HTTP 524 is structural (CDN closed the upstream
 * socket on an origin timeout budget). Retrying on a fixed backoff
 * just opens fresh connections into the same wall and amplifies load
 * on an already-overloaded upstream. Other 5xx (502/503/504/520/522)
 * are upstream-glitchy and DO benefit from retry. */
export const STREAM_RETRYABLE_STATUS: Record<number, boolean> = {
  408: true, 425: true, 429: true, 500: true, 502: true,
  503: true, 504: true, 520: true, 522: true,
};

/** True when the transport should be retried for this HTTP status. */
export function isRetryableStatus(status: number): boolean {
  return STREAM_RETRYABLE_STATUS[status] === true;
}

/** True when we know the network is unreachable: callers short-circuit
 * instead of burning the fixed retry delay. The typeof guard keeps
 * this safe on runtimes without navigator. */
export function offlineGuard(): boolean {
  if (typeof navigator !== 'undefined' && (navigator as { onLine?: boolean }).onLine === false) return true;
  return false;
}

export interface StreamRetryDecision {
  isHeartbeat: boolean;
  semanticActivity: boolean;
  attempt: number;
  maxAttempts: number;
}

/** A full SSE request may be replayed only before visible output: once
 * the user has seen content, replaying would duplicate it. */
export function shouldRetryInterruptedStream(decision: StreamRetryDecision): boolean {
  return decision.isHeartbeat
    && !decision.semanticActivity
    && decision.attempt < decision.maxAttempts;
}
