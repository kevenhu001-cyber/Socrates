/**
 * Upstream retry contract: statuses, attempt counts, backoff and sleep.
 */
/* ─── retry policy for upstream failures ────────────────────
 *
 * A multi-step turn is many POSTs against one provider key: the tool loop
 * re-calls the model per hop, and retrieval / compression / summary each add
 * their own. So the odds that *some* hop meets an exhausted RPM window scale
 * with the number of steps — which is why this used to read as "multi-step
 * turns always 429".
 *
 * Short provider recovery is owned here. All attempts and compatibility
 * variants share an eight-second backoff budget. A longer provider cooldown
 * is reported to the caller instead of keeping the answer spinner running.
 *
 * 500 is retryable here but 524 is not (it means the gateway gave up waiting
 * for a response that is still running upstream — replaying it would double
 * the bill). This mirrors the client's own STREAM_RETRYABLE_STATUS set.
 */
/**
 * The attempt contract of the upstream retry loop.
 *
 * These numbers ARE the contract — they were previously private constants
 * that a note described as "1 retry", which is how the declared number and
 * the real number drifted apart (P1-12). They are exported so the contract
 * can be asserted in a test and so a change to them is a deliberate act:
 *
 *   - a rate-limited request (429) gets the initial attempt plus four
 *     retries: the provider's own rpm window usually clears inside that.
 *   - a transient upstream failure (408/425/500/502/503/504/520/522) gets
 *     the initial attempt plus two retries.
 *   - a deterministic failure (400/401/404/422 and friends) is NEVER
 *     retried: replaying it cannot help and would charge the user twice.
 *   - ALL attempts share one eight-second backoff budget
 *     (UPSTREAM_RETRY_BUDGET_MS), so the worst case is bounded in wall
 *     clock, not in attempt count.
 *   - a compatibility variant (a provider that rejects tools, an unknown
 *     optional field, …) is a separate axis: each variant gets its own
 *     attempt budget within the same wall-clock budget.
 */
export const RATE_LIMIT_STATUS = 429;
export const TRANSIENT_RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504, 520, 522]);

/** Attempts for a rate-limited request: initial + 4 retries. */
export const RATE_LIMIT_ATTEMPTS = 5;
/** Attempts for a transient upstream failure: initial + 2 retries. */
export const TRANSIENT_ATTEMPTS = 3;

export function isRetryableUpstreamStatus(status: number): boolean {
  return status === RATE_LIMIT_STATUS || TRANSIENT_RETRYABLE_STATUS.has(status);
}

/** How many attempts a status is allowed in total. */
export function attemptsForUpstreamStatus(status: number): number {
  return status === RATE_LIMIT_STATUS ? RATE_LIMIT_ATTEMPTS : TRANSIENT_ATTEMPTS;
}

/** Is this status eligible for a retry at all? */
export function isRetryableUpstreamFailure(status: number): boolean {
  return isRetryableUpstreamStatus(status);
}

/**
 * Delay before the next attempt. A provider-sent `Retry-After` wins — it is
 * the only number that actually describes the window we are locked out of —
 * and is never shortened. The call's retry budget decides whether we can
 * wait; otherwise the cooldown is surfaced. Without one we escalate, with
 * jitter: several tool hops would otherwise retry in lockstep against the same
 * exhausted window and burn the remaining attempts simultaneously.
 */
export function upstreamRetryDelayMs(
  status: number,
  attempt: number,
  retryAfterHeader: string | null,
): number {
  const value = (retryAfterHeader || '').trim();
  const retryAfterMs = /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - Date.now();
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    // Never retry BEFORE the provider's window. Longer waits are surfaced
    // instead of being truncated into another guaranteed 429.
    return Math.round(retryAfterMs);
  }
  if (status === RATE_LIMIT_STATUS) {
    /* Bounded patience, NOT a guarantee a minute window has reset.
     * Explicit Retry-After takes priority over this jittered fallback. */
    return Math.min(2000 * 2 ** attempt, 20_000) + Math.floor(Math.random() * 500);
  }
  return (attempt === 0 ? 800 : 1600) + Math.floor(Math.random() * 400);
}

export function isTransientSocketReset(err: unknown): boolean {
  const rec = err as { code?: unknown; cause?: { code?: unknown }; message?: unknown } | null;
  const code = String(rec?.code ?? rec?.cause?.code ?? '');
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true;
  }
  const msg = String(rec?.message || '').toLowerCase();
  return msg.includes('other side closed') || msg.includes('socket');
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    /* Named AbortError so the callers' existing `name === 'AbortError'`
       guard treats a cancelled backoff as a cancellation, not as another
       provider failure worth retrying. */
    const aborted = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('LLM request aborted'), { name: 'AbortError' }));
    };
    if (signal?.aborted) {
      reject(Object.assign(new Error('LLM request aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}
