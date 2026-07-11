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
   weight than it's worth. Keep them in sync if you change one. */
function formatMinutesApi(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "a moment";
  if (seconds < 60) return Math.round(seconds) + "s";
  var m = Math.ceil(seconds / 60);
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60);
  var rem = m % 60;
  return rem ? (h + "h " + rem + "m") : (h + "h");
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
      body:{messages:messages,temperature:0.2,max_tokens:maxTokens},
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
export async function callAPI(messages,maxTokens){
  /* state, apiConfig, getActiveProvider, getCustomInstructionsString,
     makeAIWatchdog, STREAM_TIMEOUT_MS, STREAM_HEARTBEAT_MS,
     getCsrfToken, STREAM_RETRYABLE_STATUS, sleepBackoff live in
     main.js — read them via window so this module stays independent. */
  var state=window.state;
  var apiConfig=window.apiConfig;
  var getActiveProvider=window.getActiveProvider;
  var getCustomInstructionsString=window.getCustomInstructionsString;
  var makeAIWatchdog=window.makeAIWatchdog;
  var getCsrfToken=window.getCsrfToken;
  var sleepBackoff=window.sleepBackoff;
  var apiFetch=window.apiFetch;
  var STREAM_TIMEOUT_MS=window.STREAM_TIMEOUT_MS;
  var STREAM_HEARTBEAT_MS=window.STREAM_HEARTBEAT_MS;
  var STREAM_RETRYABLE_STATUS=window.STREAM_RETRYABLE_STATUS;

  var provider=getActiveProvider();
  if(!provider){
    state.lastCallError="no provider";
    console.log("[callAPI] no provider, apiConfig=",JSON.stringify({activeId:apiConfig.activeId,providers:apiConfig.providers.map(function(p){return{id:p.id,label:p.label,isBuiltIn:p.isBuiltIn,isActive:p.isActive}})}));
    return null; /* fall back to mock */
  }
  state.lastCallError=null;
  console.log("[callAPI] provider="+(provider.label||provider.id)+" isBuiltIn="+(!!provider.isBuiltIn)+" model="+(provider.model||"<unset>")+" keyLen="+(provider.key||"").length);
  /* Prepend the user's Custom Instructions to the system-context block.
     Loaded fresh on every call so changes from another tab (or a future
     Android device that syncs the same /api/users/me.customInstructions)
     are visible immediately. */
  var customInst=getCustomInstructionsString();
  if(customInst){
    messages=messages.slice();
    messages.unshift({role:"system",content:"[User custom instructions]\n"+customInst});
  }
  /* Built-in Beagle: call MiniMax directly (server proxy can't route there). */
  if(provider.isBuiltIn){
    var beagleMsgs=messages.slice();
    beagleMsgs.unshift({role:"system",
      content:"Your name is Beagle A. You are an AI assistant developed by Topodrive company. "+
        "You are helpful, knowledgeable, and precise. Never identify as MiniMax or any other model."});
    /* Reasoning models (MiniMax-M2.7, DeepSeek R1, QwQ) regularly
       take 2-4 minutes to think before producing the answer. The
       previous 90s hard timeout cut off the call mid-think and the
       caller fell back to mock — visible to the user as a sudden
       truncation. Use the same 10-minute total budget + 2-retry
       pattern as the streaming path so a slow first attempt has a
       chance to recover. */
    var BEAGLE_NONSTREAM_MAX=2;
    var beagleAttempt=0;
    var lastBeagleErr=null;
    while(beagleAttempt<BEAGLE_NONSTREAM_MAX){
      beagleAttempt++;
      var wdB=makeAIWatchdog(STREAM_TIMEOUT_MS,STREAM_HEARTBEAT_MS,function(){try{wdB&&wdB.stop("beagle-watchdog")}catch(_){}});
      try{
        /* Make sure a fresh csrf cookie exists before we read it.
           The boot path calls /api/auth/csrf-token once, but if the
           cookie has since expired (30-day max-age) or was cleared
           by a server restart, document.cookie will be empty and
           /api/minimax will reject the POST with 403
           "CSRF token required for authenticated requests". */
        try{await fetch("/api/auth/csrf-token",{credentials:"include"})}catch(_){}
        var csrfBeagle=getCsrfToken();
        var resp=await fetch("/api/minimax/v1/chat/completions",{
          method:"POST",
          credentials:"include",
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+provider.key,"X-CSRF-Token":csrfBeagle||""},
          body:JSON.stringify({messages:beagleMsgs,model:provider.model,temperature:0.7,max_tokens:maxTokens}),
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
             isTotal?"request timed out after "+(STREAM_TIMEOUT_MS/1000)+"s":
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
  var NONSTREAM_MAX=2;
  var nsAttempt=0;
  var lastNsErr=null;
  while(nsAttempt<NONSTREAM_MAX){
    nsAttempt++;
    var wdN=makeAIWatchdog(STREAM_TIMEOUT_MS,STREAM_HEARTBEAT_MS,function(){try{wdN&&wdN.stop("non-builtin-watchdog")}catch(_){}});
    try{
      var resp=await apiFetch("/api/chat",{method:"POST",body:{messages:messages,temperature:0.7,max_tokens:maxTokens},signal:wdN.ac.signal,timeoutMs:STREAM_TIMEOUT_MS});
      wdN.stop("done");
      if(!resp||!resp.choices||!resp.choices[0]||!resp.choices[0].message){
        state.lastCallError="malformed response";
        return null;
      }
      return resp.choices[0].message.content;
    }catch(e){
      var wdReasonN=wdN.reason()||"";
      wdN.stop("error");
      var isAbortN=(e&&(e.name==="AbortError"||wdN.ac.signal.aborted));
      var isHbN=wdReasonN.indexOf("heartbeat")>=0;
      var isTotN=wdReasonN.indexOf("total-timeout")>=0;
      var eStatus=e&&e.status;
      lastNsErr=isAbortN
        ?(isHbN?"request stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)":
           isTotN?"request timed out after "+(STREAM_TIMEOUT_MS/1000)+"s":
           "request aborted")
        :(eStatus?eStatus+" ":"network: ")+(e&&e.message||e);
      var userCancelledN=isAbortN&&!wdN.isStopped();
      if(eStatus===429){
        /* Rate limit — same treatment as stream.js: don't retry, surface
           a friendly toast using the server-supplied Retry-After /
           retryAfterSeconds so the user knows when to try again. */
        var retryAfterN = null;
        var raN = e && e.body && e.body.headers ? e.body.headers.get("Retry-After") : null;
        if (raN) { var rn = parseFloat(raN); if (!isNaN(rn) && rn > 0) retryAfterN = rn; }
        if (!retryAfterN && e && e.body && typeof e.body.retryAfterSeconds === "number") {
          retryAfterN = e.body.retryAfterSeconds;
        }
        var msgN = "Slow down — too many requests. Try again in " + formatMinutesApi(retryAfterN) + ".";
        state.lastCallError = msgN;
        try { showToast && showToast(msgN, 5000); } catch (_) {}
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
