// src/chat/offline.ts — Phase C-3.4 extraction
// Universal AI-call retry/offline helpers, shared by the chat streaming
// code paths.
//
//   STREAM_MAX_ATTEMPTS / STREAM_RETRYABLE_STATUS — retry policy constants.
//   offlineGuard()                              — navigator.onLine check
//   sleepBackoff()                              — fixed five-second delay
//
// There is deliberately no watchdog / heartbeat / total-budget helper here:
// a reasoning model may think for an unbounded amount of time, so the client
// never aborts a response on its own. Only a user stop, a session switch, or
// a transport error ends a request.
//
// Window exposures (window.offlineGuard / sleepBackoff /
// STREAM_MAX_ATTEMPTS / STREAM_RETRYABLE_STATUS) live in src/windowExports.js.

/* Six attempts = the initial request plus five fixed-delay retries. */
export const STREAM_MAX_ATTEMPTS  = 6;
export const STREAM_RETRY_DELAYS  = [5000];              /* legacy export; policy is fixed */
/* P_524-no-retry — HTTP 524 is "A Timeout Occurred" (Cloudflare / EdgeOne
   origin timeout). It's structural — the CDN closed the upstream socket
   because the origin exceeded the response-time budget. Retrying within
   five-second backoff just opens fresh
   connections that hit the same wall, amplifying load on an already-
   overloaded upstream and producing duplicate 524s. Surface it as a
   terminal error so the user sees a clear "upstream timed out" toast
   instead of watching the spinner burn through four useless retries.
   Other 5xx codes (502/503/504/520/522) are upstream-glitchy and DO
   benefit from retry. */
export const STREAM_RETRYABLE_STATUS: Record<number, boolean> = {
  408: true, 425: true, 429: true, 500: true, 502: true,
  503: true, 504: true, 520: true, 522: true,
};

/* Returns true if we know the network is unreachable. Callers should
   short-circuit their fetch attempts in that case (no point waiting
   for the fixed retry delay). */
export function offlineGuard(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

/* Compatibility shim for older window consumers. Model retries now use the
   shared policy, so Retry-After and jitter are intentionally ignored. */
export function sleepBackoff(_attempt?: number, _retryAfterHeader?: string | null, signal?: AbortSignal): Promise<void> {
  return new Promise(function (resolve, reject) {
    if (signal?.aborted) { reject(new Error('retry cancelled')); return; }
    const timer = setTimeout(resolve, 5000);
    signal?.addEventListener('abort', function () {
      clearTimeout(timer);
      reject(new Error('retry cancelled'));
    }, { once: true });
  });
}
