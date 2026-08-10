/* ── Chat LLM API helpers ──
   Non-streaming LLM call (callAPIChat) extracted from main.js.
   Used for round-1 tool-detection probes where we need the full
   response accumulated but NOT rendered live.
   Streaming logic remains in main.js's addStreamingMessage (deferred
   to a dedicated refactor PR — touches _activeChatCtl/_activeChatAbort
   window globals + ~750 lines of streaming state). */

import { apiFetchRaw } from '../util/api.js';

/* Local copy of the Retry-After formatter — chat/stream.js has the same
   helper but extracting it to a shared util for two callsites is more
   weight than it's worth. Keep them in sync if you change one. The two
   callers use the formatter in different places (sync non-stream error
   surfacing vs. streaming 429 toasts), so unifying them is a future
   refactor rather than a current necessity. */
function formatMinutesApi(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "a moment";
  if (seconds < 60) return Math.round(seconds) + "s";
  var m = Math.ceil(seconds / 60);
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60);
  var rem = m % 60;
  return rem ? (h + "h " + rem + "m") : (h + "h");
}

/* P_request_body_singleton — single source of truth for the chat request
   payload. Shared by callAPI (sync, built-in + custom providers) and
   callAPIStream so the two paths cannot drift on reasoning knobs,
   built-in identity, or custom-instructions prepending.

   Inputs:
     messages      conversation array (caller owns ordering)
     maxTokens      max_tokens for the upstream call
     temperature     sampling temperature

   Side effects (window reads):
     isReasoningProvider / getReasoningEffort / isMiniMaxProvider
     getCustomInstructionsString        (user-saved preferences)

   Provider identity and server-owned behavior are injected at the server
   boundary. Keeping them out of this client builder prevents the built-in
   Beagle identity from being sent once by the browser and once by the proxy. */
export function buildChatRequestBody(messages, maxTokens, temperature) {
  var body = {
    messages: messages.slice(),
    temperature: temperature,
    max_tokens: maxTokens,
    mode: window.appMode === "tutor" ? "tutor" : "chat"
  };

  var customInst = (typeof window.getCustomInstructionsString === "function") ? window.getCustomInstructionsString() : "";
  if (customInst) {
    body.messages.unshift({
      role: "system",
      content: "[User custom instructions]\n" + customInst
    });
  }

  var isReasoning = (typeof window.isReasoningProvider === "function" && window.isReasoningProvider());
  if (isReasoning) {
    var effort = (typeof window.getReasoningEffort === "function" && window.getReasoningEffort()) || "medium";
    body.reasoning_effort = effort;
    /* P_minimax-reasoning_split — MiniMax-M3 needs reasoning_split in
       extra_body to emit reasoning_content in SSE deltas. Without
       this its thinking is hidden even though adaptive thinking is on
       by default. */
    if (typeof window.isMiniMaxProvider === "function" && window.isMiniMaxProvider()) {
      body.extra_body = { reasoning_split: true };
    }
  }
  return body;
}

/* Non-streaming variant of callAPIStream for round-1 detection.
   Returns the same {text,html,widgets,cancelled} shape (or null on failure).
   Reuses the streaming call but accumulates without rendering. */
export async function callAPIChat(messages,maxTokens,timeoutMs){
  /* state, getActiveProvider live in main.js — read them via window
     so this module stays independent. main.js sets these up at boot
     and they are stable for the page lifetime. */
  var state=window.state;
  var getActiveProvider=window.getActiveProvider;
  if(!getActiveProvider()){state.lastCallError="no provider";return null}
  state.lastCallError=null;
  var ac=new AbortController();
  /* Caller-supplied timeout caps this round's wait. Default 15s —
     long enough for the model to declare "I'll search" or "no I
     won't", short enough that the user doesn't wait minutes for a
     tool-detection phase. */
  var tmo=setTimeout(function(){try{ac.abort("timeout")}catch(_){}},timeoutMs||15000);
  var r;
  try{
    /* Use apiFetchRaw so CSRF/credentials/401→handleAuthExpired
     * are handled centrally. Throws on non-2xx. Pass body as an object
     * so apiFetchRaw stringifies it and sets Content-Type: application/json.
     * Pre-stringified bodies cause express.json() to skip parsing. */
    r=await apiFetchRaw("/api/chat/stream",{
      method:"POST",
      body:buildChatRequestBody(messages,maxTokens,0.2),
      signal:ac.signal
    });
  }catch(e){
    clearTimeout(tmo);
    state.lastCallError=(e&&e.status?e.status+" ":"")+(e&&e.message||e);
    return null;
  }
  clearTimeout(tmo);
  if(!r.body||!r.body.getReader){state.lastCallError="no stream body";return null}
  var reader=r.body.getReader();
  var decoder=new TextDecoder("utf-8");
  var buf="";var full="";
  while(true){
    var step=await reader.read();
    if(step.done)break;
    buf+=decoder.decode(step.value,{stream:true});
    var idx;
    while((idx=buf.indexOf("\n\n"))>=0){
      var frame=buf.slice(0,idx);buf=buf.slice(idx+2);
      var lines=frame.split("\n");
      for(var li=0;li<lines.length;li++){
        var line=lines[li];
        if(line.indexOf("data:")!==0)continue;
        var payload=line.slice(5).trim();
        if(!payload||payload==="[DONE]")continue;
        try{
          var obj=JSON.parse(payload);
          var d=obj.choices&&obj.choices[0]&&obj.choices[0].delta&&obj.choices[0].delta.content;
          if(typeof d==="string")full+=d;
        }catch(_){}
      }
    }
  }
  return{text:full,html:null,widgets:[],cancelled:false};
}

/* Main non-streaming chat API call. Routes to either:
   - /api/minimax/v1/chat/completions for built-in Beagle (server can't route there)
   - /api/chat for non-built-in providers
   Both paths use the same retry/timeout pattern. */
export async function callAPI(messages,maxTokens,timeoutMs){
  /* state, getActiveProvider, makeAIWatchdog, STREAM_TIMEOUT_MS,
     STREAM_HEARTBEAT_MS, getCsrfToken, STREAM_RETRYABLE_STATUS,
     sleepBackoff live in main.js — read them via window so this module
     stays independent. Built-in identity + custom-instructions
     prepending is centralized in buildChatRequestBody. */
  var state=window.state;
  var getActiveProvider=window.getActiveProvider;
  var makeAIWatchdog=window.makeAIWatchdog;
  var getCsrfToken=window.getCsrfToken;
  var sleepBackoff=window.sleepBackoff;
  var apiFetch=window.apiFetch;
  var STREAM_TIMEOUT_MS=window.STREAM_TIMEOUT_MS;
  var STREAM_HEARTBEAT_MS=window.STREAM_HEARTBEAT_MS;
  var STREAM_RETRYABLE_STATUS=window.STREAM_RETRYABLE_STATUS;

  /* U-H3 — optional per-call total-timeout override. Diagnostic
     generation passes a shorter budget for the first question so the
     user isn't left staring at a spinner for the full STREAM_TIMEOUT_MS.
     Falls back to the shared streaming budget when omitted. */
  var EFFECTIVE_TIMEOUT_MS=(typeof timeoutMs==="number"&&timeoutMs>0)?timeoutMs:STREAM_TIMEOUT_MS;

  var provider=getActiveProvider();
  if(!provider){
    state.lastCallError="no provider";
    return null; /* fall back to mock */
  }
  state.lastCallError=null;
  /* Built-in identity + custom-instructions prepending is handled centrally
    inside buildChatRequestBody, so the built-in branch here only has to
    deal with the direct MiniMax API hop (the proxy can't route to it). */
  if(provider.isBuiltIn){
    var beagleBody=buildChatRequestBody(messages,maxTokens,0.7);
    /* Reasoning models (MiniMax-M2.7, DeepSeek R1, QwQ) regularly
       take 2-4 minutes to think before producing the answer. The
       previous 90s hard timeout cut off the call mid-think and the
       caller fell back to mock — visible to the user as a sudden
       truncation. Use the same 10-minute total budget + 2-retry
       pattern as the streaming path so a slow first attempt has a
       chance to recover. */
    var BEAGLE_NONSTREAM_MAX=4;
    var beagleAttempt=0;
    var lastBeagleErr=null;
    while(beagleAttempt<BEAGLE_NONSTREAM_MAX){
      beagleAttempt++;
      var wdB=makeAIWatchdog(EFFECTIVE_TIMEOUT_MS,STREAM_HEARTBEAT_MS,function(){try{wdB&&wdB.stop("beagle-watchdog")}catch(_){}});
      try{
        /* Make sure a fresh csrf cookie exists before we read it.
           The boot path calls /api/auth/csrf-token once, but if the
           cookie has since expired (30-day max-age) or was cleared
           by a server restart, document.cookie will be empty and
           /api/minimax will reject the POST with 403
           "CSRF token required for authenticated requests". */
        try{await fetch("/api/v2/auth/csrf-token",{credentials:"include"})}catch(_){}
        var csrfBeagle=getCsrfToken();
        var resp=await fetch("/api/v2/minimax/v1/chat/completions",{
          method:"POST",
          credentials:"include",
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+provider.key,"X-CSRF-Token":csrfBeagle||""},
          body:JSON.stringify(beagleBody),
          signal:wdB.ac.signal
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
        var respText="";
        try{respText=await resp.text()}catch(_){}
        wdB.stop("done");
        if(!resp.ok){
          lastBeagleErr=resp.status+" "+(respText||"").slice(0,200);
          if(STREAM_RETRYABLE_STATUS[resp.status]&&beagleAttempt<BEAGLE_NONSTREAM_MAX){
            await sleepBackoff(beagleAttempt,resp.headers.get("Retry-After"));
            continue;
          }
          state.lastCallError=lastBeagleErr;
          return null;
        }
        var json=null;
        try{json=JSON.parse(respText)}catch(_){}
        if(!json||!json.choices||!json.choices[0]||!json.choices[0].message){
          state.lastCallError="malformed response";
          return null;
        }
        return json.choices[0].message.content;
      }catch(e){
        var wdReason=wdB.reason()||"";
        wdB.stop("error");
        var isAbort=(e&&(e.name==="AbortError"||e.code===20));
        var isHeartbeat=wdReason.indexOf("heartbeat")>=0;
        var isTotal=wdReason.indexOf("total-timeout")>=0;
        lastBeagleErr=isAbort
          ?(isHeartbeat?"request stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)":
             isTotal?"request timed out after "+(EFFECTIVE_TIMEOUT_MS/1000)+"s":
             "request aborted")
          :String(e&&e.message||e);
        var userCancelled=isAbort&&!wdB.isStopped();
        if(!userCancelled&&(isHeartbeat||isTotal)&&beagleAttempt<BEAGLE_NONSTREAM_MAX){
          await sleepBackoff(beagleAttempt,null);
          continue;
        }
        state.lastCallError=lastBeagleErr;
        return null;
      }
    }
    state.lastCallError=lastBeagleErr||"Beagle non-stream request failed";
    return null;
  }
  /* Non-built-in provider: same retry logic, same timeouts. */
  var NONSTREAM_MAX=4;
  var nsAttempt=0;
  var lastNsErr=null;
  while(nsAttempt<NONSTREAM_MAX){
    nsAttempt++;
    var wdN=makeAIWatchdog(EFFECTIVE_TIMEOUT_MS,STREAM_HEARTBEAT_MS,function(){try{wdN&&wdN.stop("non-builtin-watchdog")}catch(_){}});
    try{
      var resp=await apiFetch("/api/chat",{method:"POST",body:buildChatRequestBody(messages,maxTokens,0.7),signal:wdN.ac.signal,timeoutMs:EFFECTIVE_TIMEOUT_MS});
      wdN.stop("done");
      if(!resp||typeof resp.content!=="string"){
        state.lastCallError="malformed response";
        return null;
      }
      return resp.content;
    }catch(e){
      var wdReasonN=wdN.reason()||"";
      wdN.stop("error");
      var isAbortN=(e&&(e.name==="AbortError"||wdN.ac.signal.aborted));
      var isHbN=wdReasonN.indexOf("heartbeat")>=0;
      var isTotN=wdReasonN.indexOf("total-timeout")>=0;
      var eStatus=e&&e.status;
      lastNsErr=isAbortN
        ?(isHbN?"request stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)":
           isTotN?"request timed out after "+(EFFECTIVE_TIMEOUT_MS/1000)+"s":
           "request aborted")
        :(eStatus?eStatus+" ":"network: ")+(e&&e.message||e);
      var userCancelledN=isAbortN&&!wdN.isStopped();
      if(eStatus===429){
        /* Check for monthly quota before generic rate-limit message */
        var code429 = e && e.code;
        var body429 = e && e.body;
        if (code429 === 'MONTHLY_LIMIT' || (body429 && body429.code === 'MONTHLY_LIMIT')) {
          state.lastCallError = 'Monthly Beagle usage limit reached. ' + (body429 && body429.message || 'Upgrade your plan or wait until next month.');
          try { showToast && showToast(state.lastCallError, 8000); } catch (_) {}
          return null;
        }
        /* Regular rate limit — surface the server cooldown immediately.
           Replaying the same request inside this loop only amplifies the
           shared bucket. */
        var retryAfterN = e && e.body && typeof e.body.retryAfterSeconds === "number" ? e.body.retryAfterSeconds : null;
        lastNsErr = "Rate limited (429). Try again in " + formatMinutesApi(retryAfterN) + ".";
        /* P_chat-429-no-storm — a server rate limit is a shared bucket,
           not a transient transport failure. Retrying four times here
           only amplifies the limit and makes background callers such as
           title/search rewriting compete with the user's turn. */
        state.lastCallError=lastNsErr;
        return null;
      }
      if(!userCancelledN&&(isHbN||isTotN||STREAM_RETRYABLE_STATUS[eStatus])&&nsAttempt<NONSTREAM_MAX){
        var raHdr=e&&e.body&&e.body.headers?e.body.headers.get("Retry-After"):null;
        await sleepBackoff(nsAttempt,raHdr);
        continue;
      }
      console.error("[API] call failed:",e);
      state.lastCallError=lastNsErr;
      return null;
    }
  }
  state.lastCallError=lastNsErr||"non-stream request failed";
  return null;
}
