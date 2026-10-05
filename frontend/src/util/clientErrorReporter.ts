/** Bounded, content-free telemetry for caught failures; independent of app boot. */
export type FailureSeverity = 'expected' | 'recoverable' | 'invariant';

/**
 * The one client-error endpoint every emitter in the app posts to.
 *
 * `/api/v2` bypasses the stale-CDN cache for `/api/*` and is rewritten to
 * `/api/*` by nginx in production and by the Express `apiV2Rewrite`
 * middleware locally — same shape as `util/api.js`'s `API_PREFIX`. It is
 * registered before `csrfProtection`, so no token is needed. Keep this a
 * single constant: `app/errorGuard.js` and this module must never drift onto
 * different spellings of the same route.
 */
export const CLIENT_ERROR_PATH = '/api/v2/client-error';

const EXPECTED_REASONS = new Set([
  'user-stop', 'user_stop', 'superseded', 'session-switch', 'session-expired',
  'session-deleted', 'session-purged', 'session-reset', 'archived-session',
  'new-session', 'msg-edit', 'msg-regen', 'signout', 'sign-out',
]);
const SAFE_NAMES = new Set([
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'SecurityError', 'QuotaExceededError', 'NetworkError',
]);

type FailureFields = { name?: unknown; code?: unknown; reason?: unknown; requestId?: unknown };

function failureFields(error: unknown): FailureFields | null {
  return error && typeof error === 'object' ? error as FailureFields : null;
}

function isExpectedFailure(fields: FailureFields | null): boolean {
  if (!fields) return false;
  return fields.name === 'AbortError' || fields.code === 'ABORTED' ||
    (typeof fields.reason === 'string' && EXPECTED_REASONS.has(fields.reason));
}

function safeErrorName(fields: FailureFields | null): string {
  return fields && typeof fields.name === 'string' && SAFE_NAMES.has(fields.name)
    ? fields.name : 'Error';
}

function safeRequestId(fields: FailureFields | null): string | undefined {
  return fields && typeof fields.requestId === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(fields.requestId) ? fields.requestId : undefined;
}

/** A failed beacon must fall back to fetch; neither transport may escape. */
export function sendClientError(body: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        if (navigator.sendBeacon(CLIENT_ERROR_PATH,
          new Blob([body], { type: 'application/json' }))) return;
      } catch (_) { /* empty-catch: intentional — try the fetch fallback */ }
    }
    if (typeof fetch === 'function') {
      void fetch(CLIENT_ERROR_PATH, {
        method: 'POST', body, keepalive: true, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => { /* empty-catch: intentional — telemetry must not recurse */ });
    }
  } catch (_) { /* empty-catch: intentional — telemetry must never throw */ }
}

export function createClientErrorReporter(options: {
  send: (body: string) => void;
  now?: () => number;
  buildId?: string;
}) {
  const now = options.now || Date.now;
  const buildId = (options.buildId || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
  const seen = new Set<string>();
  let windowStart: number | null = null;
  let sent = 0;
  let sequence = 0;

  return (error: unknown, context: string, severity: FailureSeverity = 'recoverable'): void => {
    try {
      if (severity === 'expected') return;
      const fields = failureFields(error);
      if (isExpectedFailure(fields)) return;
      const time = now();
      if (windowStart === null || time - windowStart >= 60_000 || time < windowStart) {
        windowStart = time;
        sent = 0;
        seen.clear();
      }
      // Check the global budget before allocating or inspecting more error fields.
      if (sent >= 10) return;
      const site = context.replace(/[^a-zA-Z0-9_./:# -]/g, '').slice(0, 180);
      const name = safeErrorName(fields);
      const key = severity + ':' + site + ':' + name;
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      sequence += 1;
      const requestId = safeRequestId(fields);
      // Never send message/stack, page URL, prompts, tokens, or session content.
      // Context, category and build are in msg because the existing server logs it.
      // `severity` and `kind` are the machine-readable fields: the server uses
      // severity to keep ~480 best-effort catch sites from logging as hard
      // errors. Keep them in sync with the text above.
      options.send(JSON.stringify({
        kind: 'swallow',
        severity,
        correl: 'sw-' + time.toString(36) + '-' + sequence.toString(36),
        msg: `[swallow][${severity}] ${site} ${name} build=${buildId}` +
          (requestId ? ` request=${requestId}` : ''),
      }));
    } catch (_) { /* empty-catch: intentional — reporter is the last error boundary */ }
  };
}
