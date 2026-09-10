/** Shared retry policy for all provider-backed model calls. */

export const AI_MAX_RETRIES = 5;
export const AI_MAX_ATTEMPTS = AI_MAX_RETRIES + 1;
export const AI_RETRY_DELAY_MS = 5000;

export type AIRetrySource = 'chat' | 'probe' | 'codex';

export interface AIRetryNotice {
  retryNumber: number;
  maxRetries: number;
  delayMs: number;
  source: AIRetrySource;
  reason: string;
}

export interface AIRequestOptions {
  onRetry?: (notice: AIRetryNotice) => void;
  signal?: AbortSignal;
  /** Test-only seam; production callers use the fixed five-second delay. */
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  /** Test-only seam; production callers use five retries. */
  maxRetries?: number;
  /** Test-only seam; production callers use five seconds. */
  delayMs?: number;
  source?: AIRetrySource;
}

const RETRYABLE_STATUS = new Set([408, 425, 429]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function errorBody(error: unknown): Record<string, unknown> | null {
  const record = asRecord(error);
  return asRecord(record?.body) || asRecord(record?.response) || null;
}

export function errorStatus(error: unknown): number | null {
  const record = asRecord(error);
  const body = errorBody(error);
  const value = record?.status ?? record?.statusCode ?? body?.status;
  const status = Number(value);
  return Number.isFinite(status) && status > 0 ? status : null;
}

function errorCode(error: unknown): string {
  const record = asRecord(error);
  const body = errorBody(error);
  return String(record?.code ?? body?.code ?? '').toUpperCase();
}

function errorMessage(error: unknown): string {
  const record = asRecord(error);
  const body = errorBody(error);
  const value = record?.message ?? body?.message ?? error;
  return String(value || 'model request failed');
}

export function isUserAbort(error: unknown, signal?: AbortSignal): boolean {
  const record = asRecord(error);
  const reason = String(record?.reason ?? signal?.reason ?? '').trim().toLowerCase();
  if (reason === 'user-stop'
    || reason === 'user_stop'
    || reason === 'user stop'
    || reason === 'cancelled'
    || reason === 'canceled') return true;
  /* P_session-abort — lifecycle aborts issued by the SPA itself
     (auth expiry, session switch/delete/reset, turn superseded,
     message edit/regen) are intentional control flow, not errors.
     They must unwind the in-flight stream as a quiet cancel:
     no retry, no error bubble, no global-error banner. Without
     this, handleAuthExpired's `_activeChatAbort("session-expired")`
     surfaced as `AbortError: session-expired` in an
     unhandledrejection with a red banner. */
  if (reason === 'session-expired'
    || reason === 'session-switch'
    || reason === 'session-switching'
    || reason === 'session-deleted'
    || reason === 'session-purged'
    || reason === 'session-reset'
    || reason === 'archived-session'
    || reason === 'new-session'
    || reason === 'superseded'
    || reason === 'msg-edit'
    || reason === 'msg-regen'
    || reason === 'signout'
    || reason === 'sign-out'
    || reason === 'first-delta-timeout') return true;
  /* AbortController.abort() without an explicit reason is how the Codex
     Stop button cancels its turn. The client never aborts on a timer, so
     an unnamed DOM abort is safe to classify as user intent. */
  return !!signal?.aborted
    && (!reason
      || reason === 'abort'
      || reason.startsWith('aborterror')
      || reason.includes('operation was aborted'));
}

/**
 * Full model turns can only be replayed before visible or side-effectful
 * output reaches the caller. Deterministic provider/configuration failures
 * are also terminal; transient transport and upstream failures are safe.
 */
export function isRetryableAIError(
  error: unknown,
  semanticActivity = false,
  signal?: AbortSignal,
): boolean {
  if (semanticActivity || isUserAbort(error, signal)) return false;

  const code = errorCode(error);
  if (/MONTHLY_LIMIT|QUOTA|INVALID[_ -]?API[_ -]?KEY|AUTH|UNAUTHORIZED|FORBIDDEN|INVALID[_ -]?REQUEST|CONTENT[_ -]?POLICY|BAD[_ -]?REQUEST/.test(code)) {
    return false;
  }

  const status = errorStatus(error);
  if (status !== null) {
    if (RETRYABLE_STATUS.has(status)) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }

  const message = errorMessage(error).toLowerCase();
  if (/monthly limit|quota exhausted|invalid api key|authentication failed|unauthorized|forbidden|invalid request|content policy/.test(message)) {
    return false;
  }

  /* A bare AbortError is retryable here because the stream callers annotate
     user-stop separately; heartbeat/timeout aborts are transport failures. */
  return true;
}

function abortError(reason?: unknown): Error {
  const error = new Error(String(reason || 'Operation aborted'));
  error.name = 'AbortError';
  return error;
}

export function sleepForAIRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      signal?.removeEventListener('abort', onAbort);
    };
    const onTimer = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError(signal?.reason));
    };
    timer = setTimeout(onTimer, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function reasonFor(error: unknown): string {
  const status = errorStatus(error);
  const message = errorMessage(error).replace(/\s+/g, ' ').trim();
  return status ? `${status} ${message}`.slice(0, 240) : message.slice(0, 240);
}

/** Notify the UI and wait before the next attempt. */
export async function waitForAIRetry(
  attempt: number,
  error: unknown,
  options: AIRequestOptions = {},
): Promise<boolean> {
  const maxRetries = Math.max(0, options.maxRetries ?? AI_MAX_RETRIES);
  const maxAttempts = maxRetries + 1;
  if (attempt >= maxAttempts || !isRetryableAIError(error, false, options.signal)) return false;

  const notice: AIRetryNotice = {
    retryNumber: attempt,
    maxRetries,
    delayMs: options.delayMs ?? AI_RETRY_DELAY_MS,
    source: options.source ?? 'chat',
    reason: reasonFor(error),
  };
  try { options.onRetry?.(notice); } catch (_) { /* UI callbacks are non-critical. */ }
  const sleep = options.sleep ?? sleepForAIRetry;
  await sleep(notice.delayMs, options.signal);
  return true;
}
