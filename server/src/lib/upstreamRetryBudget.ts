/** One budget for the entire provider call, including compatibility variants.
 * This bounds automatic backoff, not a successful model's reasoning time. */
export const UPSTREAM_RETRY_BUDGET_MS = 8_000;

export function createUpstreamRetryBudget(now: () => number = () => performance.now()) {
  const startedAt = now();
  let reservedMs = 0;
  return {
    reserve(delayMs: number): boolean {
      const spentMs = Math.max(reservedMs, now() - startedAt);
      if (!Number.isFinite(delayMs) || delayMs < 0 || spentMs + delayMs > UPSTREAM_RETRY_BUDGET_MS) return false;
      reservedMs = spentMs + delayMs;
      return true;
    },
  };
}
