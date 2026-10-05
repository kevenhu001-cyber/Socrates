/** Report caught failures without changing caller control flow or opening a banner.
 * Production telemetry is bounded, deduplicated and excludes original error content.
 * Development retains console diagnostics; neither sink is allowed to throw.
 */
import { createClientErrorReporter, sendClientError, type FailureSeverity } from './clientErrorReporter.ts';

declare const __SOCRATES_BUILD_ID__: string;

const IS_DEV = (() => {
  // Vite injects `import.meta.env.DEV` at build time; default to `true`
  // in non-Vite contexts (vitest, jsdom) so tests can still observe the
  // helper. This is a one-time module-init expression, not a per-call
  // allocation. The cast stands in for `vite/client` types, which this
  // package does not pull in.
  try {
    const env = (import.meta as unknown as {
      env?: { DEV?: unknown; MODE?: unknown };
    }).env;
    if (env && typeof env.DEV === "boolean") return env.DEV;
    if (env && typeof env.MODE === "string") return env.MODE !== "production";
  } catch (_) { /* fall through */ }
  return true;
})();

const reportProduction = createClientErrorReporter({
  send: sendClientError,
  buildId: typeof __SOCRATES_BUILD_ID__ === 'string' ? __SOCRATES_BUILD_ID__ : undefined,
});

/** Expected-by-design swallows seen in this dev session. */
let devExpectedCount = 0;

/** How many optional/best-effort catches fired in dev. Exposed for debugging. */
export function expectedSwallowCount(): number {
  return devExpectedCount;
}

/**
 * Report a caught failure without changing caller control flow or opening a banner.
 *
 * Three severities, and the choice matters because there are ~480 call sites:
 *
 *  - `expected` — the failure is part of normal operation (feature absent
 *    locally, storage blocked, a user-initiated abort, an optional cache).
 *    Silent in production and in dev; nothing is sent.
 *  - `recoverable` — the app kept running but a feature degraded. Sent to the
 *    server, which logs it at warn under `[client-error] recoverable`.
 *  - `invariant` — a control-flow contract was violated; this should never
 *    happen. Sent and logged at error.
 *
 * The default is `recoverable`, NOT `invariant`: the overwhelming majority of
 * instrumented catches are best-effort by design, and promoting them to error
 * level is what buried the real uncaught-error signal. Sites whose own comments
 * say "optional" / "best-effort" / "feature absent locally" pass `'expected'`
 * so they neither spend the reporting budget nor reach the log.
 *
 * Neither sink is allowed to throw.
 */
export function reportSwallow(
  err: unknown, context: string, severity: FailureSeverity = 'recoverable',
): void {
  try {
    if (!IS_DEV) {
      reportProduction(err, context, severity);
      return;
    }
    /* Development keeps the reported classes visible; expected ones are only
       counted, so their volume stays measurable without shipping it. */
    if (severity !== 'expected') {
      if (typeof console === 'undefined' || typeof console.warn !== 'function') return;
      let msg = '';
      try { msg = String(err); }
      catch (_) { msg = '<unstringifiable>'; }
      console.warn('[swallow]', context, msg);
    } else {
      devExpectedCount += 1;
    }
  } catch (_) { /* empty-catch: intentional — reportSwallow MUST never throw */ }
}
