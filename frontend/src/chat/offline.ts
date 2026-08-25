// src/chat/offline.ts — Phase C-3.4 extraction
// Universal AI-call retry/offline helpers, shared by chat/stream.ts
// and the in-page streaming code paths in main.js.
//
//   STREAM_TIMEOUT_MS / STREAM_HEARTBEAT_MS / STREAM_MAX_ATTEMPTS /
//   STREAM_RETRYABLE_STATUS — compatibility constants.
//   makeAIWatchdog(totalMs, heartbeatMs, onTimeout)
//   offlineGuard()                              — navigator.onLine check
//   sleepBackoff()                              — fixed five-second delay
//
// Window exposures (window.offlineGuard / sleepBackoff /
// STREAM_TIMEOUT_MS / STREAM_HEARTBEAT_MS / STREAM_MAX_ATTEMPTS /
// STREAM_RETRYABLE_STATUS) live in src/windowExports.js.

export const STREAM_TIMEOUT_MS    = 300000;   /* 5 min — balances reasoning models vs perceived hangs */
export const STREAM_HEARTBEAT_MS  = 60000;    /* 60 s silence before we treat as stall */
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

export interface AIWatchdog {
  ac: AbortController;
  stop: (reason?: string) => void;
  touch: () => void;
  isStopped: () => boolean;
  reason: () => string;
  lastTouch: () => number;
}

/* Wraps a single fetch + stream read loop with:
     - total budget (kills the request after N ms no matter what)
     - silence heartbeat (kills the request after M ms of no bytes)
     - offline precheck (no point retrying if navigator says we're offline)
   Returns an opaque handle with .stop(reason) and .touch() methods. */
export function makeAIWatchdog(totalMs: number, heartbeatMs: number, onTimeout?: (type: string, ms: number) => void): AIWatchdog {
  let stopped = false;
  let reason = '';
  const ac = new AbortController();
  let tmo: ReturnType<typeof setTimeout> | null = null;
  let hb: ReturnType<typeof setTimeout> | null = null;
  let lastTouch = Date.now();

  function stop(r?: string) {
    if (stopped) return;
    stopped = true;
    reason = r || 'stopped';
    try { ac.abort(reason); } catch (_) { /* ignore */ }
    if (tmo) { clearTimeout(tmo); tmo = null; }
    if (hb) { clearTimeout(hb); hb = null; }
  }
  if (totalMs > 0) {
    tmo = setTimeout(function () {
      stop('total-timeout-' + totalMs + 'ms');
      if (typeof onTimeout === 'function') {
        try { onTimeout('total', totalMs); } catch (_) { /* ignore */ }
      }
    }, totalMs);
  }
  function armHb() {
    if (hb) clearTimeout(hb);
    hb = setTimeout(function () {
      stop('heartbeat-' + heartbeatMs + 'ms');
      if (typeof onTimeout === 'function') {
        try { onTimeout('heartbeat', heartbeatMs); } catch (_) { /* ignore */ }
      }
    }, heartbeatMs);
  }
  function touch() {
    lastTouch = Date.now();
    if (heartbeatMs > 0 && !stopped) armHb();
  }
  if (heartbeatMs > 0) armHb();
  return {
    ac,
    stop,
    touch,
    isStopped: function () { return stopped; },
    reason: function () { return reason; },
    lastTouch: function () { return lastTouch; },
  };
}

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
