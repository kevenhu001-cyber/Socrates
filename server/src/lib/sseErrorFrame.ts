import { ApiError } from './errors.js';

export interface SseErrorFrame {
  error: string;
  message: string;
  status?: number;
  code: string;
  retryable?: boolean;
  upstreamStatus?: number;
  retryAfterMs?: number;
}

/**
 * Build the machine-readable error frame shared by every streaming endpoint.
 *
 * Two rules:
 *
 *  - Never forward a raw upstream provider body. `LlmProviderError` embeds
 *    the provider's response text in its message; that text belongs in the
 *    server log, not in the browser. Any error carrying a numeric `status`
 *    is therefore mapped to a status-only description.
 *  - Always carry `status` and `code`, and carry `retryable` whenever the
 *    server has an opinion. The browser uses it to tell a deterministic
 *    failure (quota exhausted, bad key, unsupported mode) from a transient
 *    one, instead of replaying a whole turn for a request that cannot
 *    succeed.
 *
 * A plain `Error` with no status is one of our own messages, so it is
 * forwarded as-is; upstream failures always arrive as `LlmProviderError`
 * (numeric status) or `ApiError` (curated message).
 */
export function buildSseErrorFrame(err: unknown, options: { fallbackCode?: string } = {}): SseErrorFrame {
  const failure = err as (Error & { status?: number; code?: string; retryable?: boolean; retryAfterMs?: number }) | null | undefined;
  const status = typeof failure?.status === 'number' ? failure.status : undefined;
  const code = failure?.code || (err instanceof ApiError ? err.code : undefined) || options.fallbackCode || 'INTERNAL';

  const curated = err instanceof ApiError;
  const message = curated
    ? (err as ApiError).message
    : status !== undefined
      ? `LLM request failed (upstream ${status}). Try again later or switch model.`
      : (failure?.message ?? 'The model connection failed. Please try again.');

  const frame: SseErrorFrame = {
    error: message,
    message,
    code,
    ...(status !== undefined ? { status } : {}),
  };

  if (typeof failure?.retryable === 'boolean') {
    frame.retryable = failure.retryable;
  } else if (!curated) {
    // An upstream failure that survived the server's own retry budget must
    // not become a fresh whole-turn budget in the browser.
    frame.retryable = status === undefined;
  }
  if (code === 'LLM_UPSTREAM_ERROR' && status !== undefined) frame.upstreamStatus = status;
  if (typeof failure?.retryAfterMs === 'number' && Number.isFinite(failure.retryAfterMs) && failure.retryAfterMs >= 0) {
    frame.retryAfterMs = Math.round(failure.retryAfterMs);
  }
  // A curated ApiError without an explicit opinion keeps the client's
  // status-based default, so a 503 that is worth retrying still is.
  return frame;
}
