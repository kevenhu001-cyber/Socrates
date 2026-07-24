// chat/api.ts — Non-streaming LLM API helpers.
// Used for round-1 tool-detection probes where we need the full
// response accumulated but NOT rendered live.
// Streaming logic remains in main.js's addStreamingMessage (deferred
// to a dedicated refactor PR — touches _activeChatCtl/_activeChatAbort
// window globals + ~750 lines of streaming state).

import { apiFetchRaw } from '../util/api.js';

/* Local copy of the Retry-After formatter — chat/stream.js has the same
   helper but extracting it to a shared util for two callsites is more
   weight than it's worth. Keep them in sync if you change one. */
function formatMinutesApi(seconds: number | null | undefined): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "a moment";
  if (seconds < 60) return Math.round(seconds) + "s";
  const m = Math.ceil(seconds / 60);
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? (h + "h " + rem + "m") : (h + "h");
}

/* P_reasoning_effort_sync — same intent as chat/stream.js's
   apiBody.reasoning_effort wiring. chat/stream.js already attaches the
   user-selected effort (high/medium/low) when the active provider is a
   reasoning model so the upstream gets a real reasoning_budget / thinking
   knob. The sync path (webSearch, topic-KB nodes, diagnostic generator)
   used to drop it, which meant the round-1 detection probe and any
   non-stream background call silently disagreed with the streamed answer
   about how much thinking the model should do. Centralising the body
   shape here keeps both paths in lock-step. */
function _chatRequestBodyWithEffort(
  messages: unknown[],
  maxTokens: number,
  temperature: number
): Record<string, unknown> {
  const body: Record<string, unknown> = { messages: messages, temperature: temperature, max_tokens: maxTokens };
  const isReasoning = typeof (window as any).isReasoningProvider === "function" && (window as any).isReasoningProvider();
  if (isReasoning) {
    const effort = (typeof (window as any).getReasoningEffort === "function" && (window as any).getReasoningEffort()) || "medium";
    body.reasoning_effort = effort;
    /* P_minimax-reasoning-split — MiniMax-M3 needs reasoning_split in
       extra_body to emit reasoning_content in SSE deltas. Without this
       its thinking is hidden even though adaptive thinking is on by
       default. */
    if (typeof (window as any).isMiniMaxProvider === "function" && (window as any).isMiniMaxProvider()) {
      body.extra_body = { reasoning_split: true };
    }
  }
  return body;
}

/* Non-streaming variant of callAPIStream for round-1 detection.
   Returns the same {text,html,widgets,cancelled} shape (or null on failure).
   Reuses the streaming call but accumulates without rendering. */
export async function callAPIChat(
  messages: unknown[],
  maxTokens: number,
  timeoutMs?: number
): Promise<{ text: string; html: null; widgets: unknown[]; cancelled: boolean } | null> {
  /* state, getActiveProvider live in main.js — read them via window
     so this module stays independent. main.js sets these up at boot
     and they are stable for the page lifetime. */
  const state = (window as any).state;
  const getActiveProvider = (window as any).getActiveProvider as (() => unknown) | undefined;
  if (!getActiveProvider || !getActiveProvider()) { state.lastCallError = "no provider"; return null }
  state.lastCallError = null;
  const ac = new AbortController();
  /* Caller-supplied timeout caps this round's wait. Default 15s —
     long enough for the model to declare "I'll search" or "no I
     won't", short enough that the user doesn't wait minutes for a
     tool-detection phase. */
  const tmo = setTimeout(function () { try { ac.abort("timeout"); } catch (_) { /* ignore */ } }, timeoutMs || 15000);
  let r: Response;
  try {
    /* Use apiFetchRaw so CSRF/credentials/401→handleAuthExpired
     * are handled centrally. Throws on non-2xx. Pass body as an object
     * so apiFetchRaw stringifies it and sets Content-Type: application/json.
     * Pre-stringified bodies cause express.json() to skip parsing. */
    r = await apiFetchRaw("/api/chat/stream", {
      method: "POST",
      body: JSON.stringify(_chatRequestBodyWithEffort(messages, maxTokens, 0.2)),
      signal: ac.signal,
    });
  } catch (e: unknown) {
    clearTimeout(tmo);
    state.lastCallError = (e && (e as { status?: number }).status ? (e as { status: number }).status + " " : "") + ((e as Error).message || e);
    return null;
  }
  clearTimeout(tmo);
  if (!r.body || !r.body.getReader) { state.lastCallError = "no stream body"; return null }
  const reader = r.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = ""; let full = "";
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    buf += decoder.decode(step.value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const lines = frame.split("\n");
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (line.indexOf("data:") !== 0) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
          const d = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
          if (typeof d === "string") full += d;
        } catch (_) { /* ignore parse errors for malformed frames */ }
      }
    }
  }
  return { text: full, html: null, widgets: [], cancelled: false };
}

/* Main non-streaming chat API call. Routes to either:
   - /api/minimax/v1/chat/completions for built-in Beagle (server can't route there)
   - /api/chat for non-built-in providers
   Both paths use the same retry/timeout pattern. */
export async function callAPI(
  messages: { role: string; content: string }[],
  maxTokens: number,
  timeoutMs?: number
): Promise<string | null> {
  /* state, apiConfig, getActiveProvider, getCustomInstructionsString,
     makeAIWatchdog, STREAM_TIMEOUT_MS, STREAM_HEARTBEAT_MS,
     getCsrfToken, STREAM_RETRYABLE_STATUS, sleepBackoff live in
     main.js — read them via window so this module stays independent. */
  const state = (window as any).state;
  const getActiveProvider = (window as any).getActiveProvider as (() => { isBuiltIn?: boolean; key?: string } | null) | undefined;
  const getCustomInstructionsString = (window as any).getCustomInstructionsString as (() => string) | undefined;
  const makeAIWatchdog = (window as any).makeAIWatchdog as ((total: number, hb: number, onTimeout: () => void) => {
    ac: AbortController; stop: (reason?: string) => void; reason: () => string;
    isStopped: () => boolean; touch: () => void;
  }) | undefined;
  const getCsrfToken = (window as any).getCsrfToken as (() => string) | undefined;
  const sleepBackoff = (window as any).sleepBackoff as ((attempt: number, retryAfter?: string | null) => Promise<void>) | undefined;
  const STREAM_TIMEOUT_MS = (window as any).STREAM_TIMEOUT_MS as number | undefined;
  const STREAM_HEARTBEAT_MS = (window as any).STREAM_HEARTBEAT_MS as number | undefined;
  const STREAM_RETRYABLE_STATUS = (window as any).STREAM_RETRYABLE_STATUS as Record<number, boolean> | undefined;

  /* U-H3 — optional per-call total-timeout override. Diagnostic
     generation passes a shorter budget for the first question so the
     user isn't left staring at a spinner for the full STREAM_TIMEOUT_MS.
     Falls back to the shared streaming budget when omitted. */
  const EFFECTIVE_TIMEOUT_MS = (typeof timeoutMs === "number" && timeoutMs > 0) ? timeoutMs : (STREAM_TIMEOUT_MS || 300000);

  const provider = getActiveProvider ? getActiveProvider() : null;
  if (!provider) {
    state.lastCallError = "no provider";
    return null; /* fall back to mock */
  }
  state.lastCallError = null;
  /* Prepend the user's Custom Instructions to the system-context block.
     Loaded fresh on every call so changes from another tab (or a future
     Android device that syncs the same /api/users/me.customInstructions)
     are visible immediately. */
  let customInst: string | undefined;
  if (getCustomInstructionsString) customInst = getCustomInstructionsString();
  if (customInst) {
    messages = messages.slice();
    messages.unshift({ role: "system", content: "[User custom instructions]\n" + customInst });
  }
  /* Built-in Beagle: call MiniMax directly (server proxy can't route there). */
  if (provider.isBuiltIn) {
    const beagleMsgs = messages.slice();
    beagleMsgs.unshift({
      role: "system",
      content: "Your name is Beagle. You are an AI assistant developed by Topodrive company. " +
        "You are helpful, knowledgeable, and precise. Never identify as MiniMax or any other model.",
    });
    /* Reasoning models (MiniMax-M2.7, DeepSeek R1, QwQ) regularly
       take 2-4 minutes to think before producing the answer. The
       previous 90s hard timeout cut off the call mid-think and the
       caller fell back to mock — visible to the user as a sudden
       truncation. Use the same 10-minute total budget + 2-retry
       pattern as the streaming path so a slow first attempt has a
       chance to recover. */
    const BEAGLE_NONSTREAM_MAX = 4;
    let beagleAttempt = 0;
    let lastBeagleErr: string | null = null;
    while (beagleAttempt < BEAGLE_NONSTREAM_MAX) {
      beagleAttempt++;
      const wdB = makeAIWatchdog
        ? makeAIWatchdog(EFFECTIVE_TIMEOUT_MS, STREAM_HEARTBEAT_MS || 60000, function () { try { wdB && wdB.stop("beagle-watchdog"); } catch (_) { /* ignore */ } })
        : { ac: new AbortController(), stop: function () { /* noop */ }, reason: function () { return ""; }, isStopped: function () { return false; }, touch: function () { /* noop */ } };
      try {
        /* Make sure a fresh csrf cookie exists before we read it.
           The boot path calls /api/auth/csrf-token once, but if the
           cookie has since expired (30-day max-age) or was cleared
           by a server restart, document.cookie will be empty and
           /api/minimax will reject the POST with 403
           "CSRF token required for authenticated requests". */
        try { await fetch("/api/v2/auth/csrf-token", { credentials: "include" }); } catch (_) { /* ignore */ }
        const csrfBeagle = getCsrfToken ? getCsrfToken() : "";
        const resp = await fetch("/api/v2/minimax/v1/chat/completions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + provider.key, "X-CSRF-Token": csrfBeagle || "" },
          body: JSON.stringify(_chatRequestBodyWithEffort(beagleMsgs, maxTokens, 0.7) as Record<string, unknown>),
          signal: wdB.ac.signal,
        });
        /* Read the response body BEFORE stopping the watchdog.
           Chrome's fetch implementation propagates signal.abort() to the
           underlying response body stream — calling ac.abort() in
           wdB.stop("done") right after fetch resolves causes the very
           next body read (resp.text/resp.json) to throw AbortError
           with "The user aborted a request.", which our catch path then
           mis-reports as "request aborted". Reading the body as text
           first and then stopping the watchdog avoids touching the
           aborted body stream. */
        let respText = "";
        try { respText = await resp.text(); } catch (_) { /* ignore */ }
        wdB.stop("done");
        if (!resp.ok) {
          lastBeagleErr = resp.status + " " + (respText || "").slice(0, 200);
          if (STREAM_RETRYABLE_STATUS && STREAM_RETRYABLE_STATUS[resp.status] && beagleAttempt < BEAGLE_NONSTREAM_MAX) {
            await (sleepBackoff ? sleepBackoff(beagleAttempt, resp.headers.get("Retry-After")) : Promise.resolve());
            continue;
          }
          state.lastCallError = lastBeagleErr;
          return null;
        }
        let json: { choices?: Array<{ message?: { content?: string } }> } | null = null;
        try { json = JSON.parse(respText); } catch (_) { /* ignore */ }
        if (!json || !json.choices || !json.choices[0] || !json.choices[0].message) {
          state.lastCallError = "malformed response";
          return null;
        }
        return json.choices[0].message.content || null;
      } catch (e: unknown) {
        const wdReason = wdB.reason() || "";
        wdB.stop("error");
        const err = e as Error & { code?: number };
        const isAbort = !!(e && (err.name === "AbortError" || err.code === 20));
        const isHeartbeat = wdReason.indexOf("heartbeat") >= 0;
        const isTotal = wdReason.indexOf("total-timeout") >= 0;
        lastBeagleErr = isAbort
          ? (isHeartbeat ? "request stalled (no data for " + ((STREAM_HEARTBEAT_MS || 60000) / 1000) + "s)" :
             isTotal ? "request timed out after " + (EFFECTIVE_TIMEOUT_MS / 1000) + "s" :
             "request aborted")
          : String(err && err.message || e);
        const userCancelled = isAbort && !wdB.isStopped();
        if (!userCancelled && (isHeartbeat || isTotal) && beagleAttempt < BEAGLE_NONSTREAM_MAX) {
          await (sleepBackoff ? sleepBackoff(beagleAttempt, null) : Promise.resolve());
          continue;
        }
        state.lastCallError = lastBeagleErr;
        return null;
      }
    }
    state.lastCallError = lastBeagleErr || "Beagle non-stream request failed";
    return null;
  }
  /* Non-built-in provider: same retry logic, same timeouts. */
  const NONSTREAM_MAX = 4;
  let nsAttempt = 0;
  let lastNsErr: string | null = null;
  while (nsAttempt < NONSTREAM_MAX) {
    nsAttempt++;
    const wdN = makeAIWatchdog
      ? makeAIWatchdog(EFFECTIVE_TIMEOUT_MS, STREAM_HEARTBEAT_MS || 60000, function () { try { wdN && wdN.stop("non-builtin-watchdog"); } catch (_) { /* ignore */ } })
      : { ac: new AbortController(), stop: function () { /* noop */ }, reason: function () { return ""; }, isStopped: function () { return false; }, touch: function () { /* noop */ } };
    try {
      const resp = await apiFetchRaw("/api/chat", {
        method: "POST",
        body: JSON.stringify(_chatRequestBodyWithEffort(messages, maxTokens, 0.7)),
        signal: wdN.ac.signal,
      });
      wdN.stop("done");
      const respText = await resp.text();
      let json: { content?: string } | null = null;
      try { json = JSON.parse(respText); } catch (_) { /* ignore */ }
      if (!json || typeof json.content !== "string") {
        state.lastCallError = "malformed response";
        return null;
      }
      return json.content;
    } catch (e: unknown) {
      const wdReasonN = wdN.reason() || "";
      wdN.stop("error");
      const err = e as Error & { status?: number; code?: string; body?: { code?: string; message?: string; retryAfterSeconds?: number; headers?: { get?: (k: string) => string | null } } };
      const isAbortN = !!(e && (err.name === "AbortError" || wdN.ac.signal.aborted));
      const isHbN = wdReasonN.indexOf("heartbeat") >= 0;
      const isTotN = wdReasonN.indexOf("total-timeout") >= 0;
      const eStatus = err.status;
      lastNsErr = isAbortN
        ? (isHbN ? "request stalled (no data for " + ((STREAM_HEARTBEAT_MS || 60000) / 1000) + "s)" :
           isTotN ? "request timed out after " + (EFFECTIVE_TIMEOUT_MS / 1000) + "s" :
           "request aborted")
        : (eStatus ? eStatus + " " : "network: ") + (err && err.message || e);
      const userCancelledN = isAbortN && !wdN.isStopped();
      if (eStatus === 429) {
        /* Check for monthly quota before generic rate-limit message */
        const code429 = err.code;
        const body429 = err.body;
        if (code429 === 'MONTHLY_LIMIT' || (body429 && body429.code === 'MONTHLY_LIMIT')) {
          state.lastCallError = 'Monthly Beagle usage limit reached. ' + (body429 && body429.message || 'Upgrade your plan or wait until next month.');
          try { (window as any).showToast && (window as any).showToast(state.lastCallError, 8000); } catch (_) { /* ignore */ }
          return null;
        }
        /* Regular rate limit — retry up to NONSTREAM_MAX times before
           showing the error. */
        const retryAfterN = err.body && typeof err.body.retryAfterSeconds === "number" ? err.body.retryAfterSeconds : null;
        lastNsErr = "Rate limited (429). Try again in " + formatMinutesApi(retryAfterN) + ".";
        /* Fall through to the retry check below. */
      }
      if (!userCancelledN && (isHbN || isTotN || (STREAM_RETRYABLE_STATUS && STREAM_RETRYABLE_STATUS[eStatus as number])) && nsAttempt < NONSTREAM_MAX) {
        await (sleepBackoff ? sleepBackoff(nsAttempt, null) : Promise.resolve());
        continue;
      }
      console.error("[API] call failed:", e);
      state.lastCallError = lastNsErr;
      return null;
    }
  }
  state.lastCallError = lastNsErr || "non-stream request failed";
  return null;
}
