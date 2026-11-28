/** One backoff budget for the entire provider call, including compatibility variants.
 * This bounds cumulative automatic retry sleep, never penalizing slow upstream TTFT. */
export const UPSTREAM_RETRY_BUDGET_MS = 8_000;

export function createUpstreamRetryBudget(_now?: () => number) {
  let reservedMs = 0;
  return {
    reserve(delayMs: number): boolean {
      if (
        !Number.isFinite(delayMs) ||
        delayMs < 0 ||
        reservedMs + delayMs > UPSTREAM_RETRY_BUDGET_MS
      )
        return false;
      reservedMs += delayMs;
      return true;
    },
  };
}
