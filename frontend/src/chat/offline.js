// src/chat/offline.js — Phase C-3.4 extraction
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

export const STREAM_TIMEOUT_MS    = 300000;   /* 5 min — balances reasoning models vs perceived hangs */
export const STREAM_HEARTBEAT_MS  = 60000;    /* 60 s silence before we treat as stall */
export const STREAM_MAX_ATTEMPTS  = 2;
export const STREAM_RETRY_DELAYS  = [600, 1500, 3500];   /* ms, per attempt index */
export const STREAM_RETRYABLE_STATUS = {
  408: true, 425: true, 429: true, 500: true, 502: true,
  503: true, 504: true, 520: true, 522: true, 524: true,
};

/* Wraps a single fetch + stream read loop with:
     - total budget (kills the request after N ms no matter what)
     - silence heartbeat (kills the request after M ms of no bytes)
     - offline precheck (no point retrying if navigator says we're offline)
   Returns an opaque handle with .stop(reason) and .touch() methods. */
export function makeAIWatchdog(totalMs, heartbeatMs, onTimeout){
  let stopped = false;
  let reason = "";
  const ac = new AbortController();
  let tmo = null, hb = null;
  let lastTouch = Date.now();

  function stop(r){
    if(stopped) return;
    stopped = true;
    reason = r || "stopped";
    try{ ac.abort(reason); }catch(_){}
    if(tmo){ clearTimeout(tmo); tmo = null; }
    if(hb){ clearTimeout(hb); hb = null; }
  }
  if(totalMs > 0){
    tmo = setTimeout(function(){
      stop("total-timeout-" + totalMs + "ms");
      if(typeof onTimeout === "function"){
        try{ onTimeout("total", totalMs); }catch(_){}
      }
    }, totalMs);
  }
  function armHb(){
    if(hb) clearTimeout(hb);
    hb = setTimeout(function(){
      stop("heartbeat-" + heartbeatMs + "ms");
      if(typeof onTimeout === "function"){
        try{ onTimeout("heartbeat", heartbeatMs); }catch(_){}
      }
    }, heartbeatMs);
  }
  function touch(){
    lastTouch = Date.now();
    if(heartbeatMs > 0 && !stopped) armHb();
  }
  if(heartbeatMs > 0) armHb();
  return {
    ac,
    stop,
    touch,
    isStopped: function(){ return stopped; },
    reason: function(){ return reason; },
    lastTouch: function(){ return lastTouch; },
  };
}

/* Returns true if we know the network is unreachable. Callers should
   short-circuit their fetch attempts in that case (no point waiting
   for the 1.5s/3.5s retry backoff). */
export function offlineGuard(){
  if(typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

/* Backoff sleep: prefer the Retry-After header if the server sent one
   (capped at 15 s), otherwise fall back to STREAM_RETRY_DELAYS based
   on the attempt index, then add a 0-200 ms jitter to avoid
   thundering-herd retries. */
export function sleepBackoff(attempt, retryAfterHeader){
  let delay;
  if(retryAfterHeader){
    const n = parseFloat(retryAfterHeader);
    if(!isNaN(n) && n > 0){
      delay = Math.min(n * 1000, 15000);
    }
  }
  if(!delay){
    delay = STREAM_RETRY_DELAYS[Math.min(attempt - 1, STREAM_RETRY_DELAYS.length - 1)] || 3500;
  }
  /* Add a small random jitter (0-200ms) to avoid thundering-herd. */
  delay += Math.floor(Math.random() * 200);
  return new Promise(function(r){ setTimeout(r, delay); });
}