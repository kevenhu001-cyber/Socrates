// @ts-check
/**
 * util/reportSwallow.ts — report a deliberately-swallowed error.
 *
 * Many legacy `try { ... } catch (_) {}` blocks intentionally ignore the
 * failure (feature absent in a local-only build, callback side-effect that
 * must not abort the parent flow, cleanup that is best-effort). The cost
 * is that nothing reaches `src/app/errorGuard.js`'s banner / beacon path
 * and nothing surfaces in devtools either, so a regression that turns
 * every previously-fine catch into a real failure is invisible until a
 * user reports it.
 *
 * `reportSwallow(err, context)` is the cheap instrumented bridge: it
 * makes the swallowed event observable without changing control flow
 * (the caller's catch still returns / breaks as before) and without
 * throwing — if its own sink misbehaves, the host page must not crash.
 *
 * Hard requirements:
 *  - Must never throw. The whole body is wrapped in try/catch and the
 *    inner guards short-circuit on any sink failure.
 *  - No per-call heap allocation on the hot path. The production path
 *    is a single dev-guarded `console.warn` — no object literals, no
 *    arrays, no JSON, no stack walks.
 *  - The signature accepts `unknown` (callers are plain `.js`) and
 *    a free-form `context` string the reader can grep.
 *  - Optionally forwards to the existing global guard so its banner /
 *    /api/client-error beacon sees the event, but only if the guard
 *    is already installed AND its seam (`__socratesGlobalErrorHandlerInstalled`
 *    on `src/app/errorGuard.js`) is reachable without a circular import.
 *    Today we do NOT reach into it directly — the early lifecycle boot
 *    that loads reportSwallow.ts happens before `installGlobalErrorGuard`
 *    has run, and a dynamic import inside a guarded error path is the
 *    kind of cleverness that bites during incident response. A guarded
 *    `console.warn` is the documented sink; errorGuard will pick up
 *    a future `unhandledrejection` if one ever does propagate.
 */

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

/**
 * Record that an error was deliberately swallowed at `context`. Always
 * returns void; never throws. The default sink is `console.warn`,
 * gated by `IS_DEV`, so production builds pay one boolean check per
 * call and zero heap allocations on the hot path.
 *
 * @param err      The caught error (typed as `unknown` so plain-JS callers
 *                 can pass anything). Treated as opaque; we don't assume
 *                 `.message` / `.stack` exist.
 * @param context  Free-form, greppable site label (e.g. "chat/stream.foo",
 *                 "session/recents.loadArchived"). The reader of a console
 *                 line or a future telemetry sink uses this to jump to the
 *                 catch site.
 */
export function reportSwallow(err: unknown, context: string): void {
  try {
    if (!IS_DEV) return;
    // Production safety: if `console` itself is missing (some sandboxes),
    // or `err` throws on toString, swallow it. This helper is itself the
    // last line of defence for the caller's control flow.
    if (typeof console === "undefined" || typeof console.warn !== "function") return;
    let msg = "";
    try { msg = err == null ? String(err) : (typeof err === "string" ? err : String(err)); }
    catch (_) { msg = "<unstringifiable>"; }
    console.warn("[swallow]", context, msg);
  } catch (_) { /* reportSwallow MUST never throw */ }
}