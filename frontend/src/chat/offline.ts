// src/chat/offline.ts — Phase C-3.4 extraction
// Universal AI-call retry/offline helpers, shared by chat/stream.js
// and the in-page streaming code paths in main.js.
//
//   STREAM_TIMEOUT_MS / STREAM_HEARTBEAT_MS / STREAM_MAX_ATTEMPTS /
//   STREAM_RETRY_DELAYS / STREAM_RETRYABLE_STATUS — tuning constants.
//   makeAIWatchdog(totalMs, heartbeatMs, onTimeout)
//   offlineGuard()                              — navigator.onLine check
//   sleepBackoff(attempt, retryAfterHeader)     — exponential backoff
//
// Window exposures (window.offlineGuard / sleepBackoff /
// STREAM_TIMEOUT_MS / STREAM_HEARTBEAT_MS / STREAM_MAX_ATTEMPTS /
// STREAM_RETRYABLE_STATUS) live in src/windowExports.js.

export const STREAM_TIMEOUT_MS   = 300000;   /* 5 min — balances reasoning models vs perceived hangs */
export const STREAM_HEARTBEAT_MS = 60000;    /* 60 s silence before we treat as stall */
export const STREAM_MAX_ATTEMPTS = 5;
export const STREAM_RETRY_DELAYS: number[] = [600, 1500, 3500];   /* ms, per attempt index */
/* P_524-no-retry — HTTP 524 is "A Timeout Occurred" (Cloudflare / EdgeOne
   origin timeout). It's structural — the CDN closed the upstream socket
   because the origin exceeded the response-time budget. Retrying within
   600ms–3.5s backoff (the rest of STREAM_RETRY_DELAYS) just opens fresh
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

export interface AIWatchdogHandle {
  ac: AbortController;
  stop: (reason?: string) => void;
  touch: () => void;
  isStopped: () => boolean;
  reason: () => string;
  lastTouch: () => number;
}

export type TimeoutCallback = (type: string, ms: number) => void;

/* Wraps a single fetch + stream read loop with:
     - total budget (kills the request after N ms no matter what)
     - silence heartbeat (kills the request after M ms of no bytes)
     - offline precheck (no point retrying if navigator says we're offline)
   Returns an opaque handle with .stop(reason) and .touch() methods. */
export function makeAIWatchdog(
  totalMs: number,
  heartbeatMs: number,
  onTimeout?: TimeoutCallback
): AIWatchdogHandle {
  let stopped = false;
  let reason = '';
  const ac = new AbortController();
  let tmo: ReturnType<typeof setTimeout> | null = null;
  let hb: ReturnType<typeof setTimeout> | null = null;
  let lastTouch = Date.now();

  function stop(r?: string): void {
    if (stopped) return;
    stopped = true;
    reason = r || 'stopped';
    try { ac.abort(reason); } catch (_) { /* ignore */ }
    if (tmo) { clearTimeout(tmo); tmo = null; }
    if (hb) { clearTimeout(hb); hb = null; }
  }

  if (totalMs > 0) {
    tmo = setTimeout(() => {
      stop('total-timeout-' + totalMs + 'ms');
      if (typeof onTimeout === 'function') {
        try { onTimeout('total', totalMs); } catch (_) { /* ignore */ }
      }
    }, totalMs);
  }

  function armHb(): void {
    if (hb) clearTimeout(hb);
    hb = setTimeout(() => {
      stop('heartbeat-' + heartbeatMs + 'ms');
      if (typeof onTimeout === 'function') {
        try { onTimeout('heartbeat', heartbeatMs); } catch (_) { /* ignore */ }
      }
    }, heartbeatMs);
  }

  function touch(): void {
    lastTouch = Date.now();
    if (heartbeatMs > 0 && !stopped) armHb();
  }

  if (heartbeatMs > 0) armHb();
  return {
    ac,
    stop,
    touch,
    isStopped: () => stopped,
    reason: () => reason,
    lastTouch: () => lastTouch,
  };
}

/* Returns true if we know the network is unreachable. Callers should
   short-circuit their fetch attempts in that case (no point waiting
   for the 1.5s/3.5s retry backoff). */
export function offlineGuard(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

/* Backoff sleep: prefer the Retry-After header if the server sent one
   (capped at 15 s), otherwise fall back to STREAM_RETRY_DELAYS based
   on the attempt index, then add a 0-200 ms jitter to avoid
   thundering-herd retries. */
export function sleepBackoff(attempt: number, retryAfterHeader?: string | null): Promise<void> {
  let delay: number | undefined;
  if (retryAfterHeader) {
    const n = parseFloat(retryAfterHeader);
    if (!isNaN(n) && n > 0) {
      delay = Math.min(n * 1000, 15000);
    }
  }
  if (!delay) {
    delay = STREAM_RETRY_DELAYS[Math.min(attempt - 1, STREAM_RETRY_DELAYS.length - 1)] || 3500;
  }
  /* Add a small random jitter (0-200ms) to avoid thundering-herd. */
  delay += Math.floor(Math.random() * 200);
  return new Promise(r => setTimeout(r, delay));
}
