/**
 * middleware/clientError.ts — severity policy for /api/client-error.
 *
 * The SPA instruments ~480 deliberately-swallowed catch sites
 * (frontend/src/util/reportSwallow.ts). Almost all are documented
 * best-effort/optional, so logging them at `console.error` made a real
 * uncaught error indistinguishable from noise. The reporter sends an explicit
 * `severity`; this module owns the mapping and the validation of it.
 *
 * Kept out of app.ts so the policy is unit-testable without booting the
 * server (no env, no DB, no listeners).
 */

export const CLIENT_ERROR_SEVERITIES = ['invariant', 'recoverable', 'expected'] as const;

export type ClientErrorSeverity = (typeof CLIENT_ERROR_SEVERITIES)[number];

const SEVERITY_SET: ReadonlySet<string> = new Set(CLIENT_ERROR_SEVERITIES);

/**
 * Validate a client-supplied severity.
 *
 * Returns null for anything absent or unrecognized. The caller uses `kind` to
 * decide whether an unclassified report is a swallowed catch or an uncaught
 * error; an unknown severity is never promoted to `invariant`.
 */
export function normalizeClientErrorSeverity(raw: unknown): ClientErrorSeverity | null {
  return typeof raw === 'string' && SEVERITY_SET.has(raw) ? (raw as ClientErrorSeverity) : null;
}

/**
 * Log level for one report.
 *
 * Only reports explicitly identified as swallowed catches may be downgraded.
 * The global error guard does not send `kind: 'swallow'`, so its reports stay
 * at error level even if a client supplies a recoverable severity by mistake.
 * Missing or unrecognized severity on a swallowed catch is treated as
 * unclassified best-effort noise rather than as an invariant.
 */
export function clientErrorLogLevel(
  kind: unknown,
  severity: ClientErrorSeverity | null,
): 'error' | 'warn' {
  if (kind !== 'swallow') return 'error';
  return severity === 'invariant' ? 'error' : 'warn';
}

/** Short label for the log line, so grep can separate the classes. */
export function clientErrorLabel(
  kind: unknown,
  severity: ClientErrorSeverity | null,
): string {
  if (kind !== 'swallow') return 'invariant-or-uncaught';
  if (severity === 'expected') return 'suppressed-expected';
  if (severity === 'recoverable') return 'recoverable';
  if (severity === 'invariant') return 'invariant-or-uncaught';
  return 'swallow-unclassified';
}
