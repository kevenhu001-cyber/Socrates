/* ── Streaming chat LLM call ──
   SSE consumer for /api/chat/stream and the built-in Beagle proxy.
   Pure network/parsing logic — returns {text, html, widgets, cancelled}
   on success, null on failure. UI rendering, bubble management, and
   _activeChatAbort coordination stay in main.js's addStreamingMessage
   (deferred to a dedicated refactor PR).
   Reads main.js globals via window.* (state, getActiveProvider,
   makeAIWatchdog, sleepBackoff, offlineGuard, isReasoningProvider,
   STREAM_TIMEOUT_MS, etc.). */

import { apiFetchRaw } from '../util/api.js';

/* Streaming variant. Calls /api/chat/stream (our backend SSE proxy).
   onDelta(text, full) is called for every text chunk the upstream produces.
   Resolves to {text,html,widgets,cancelled} on success, or null on failure.
   Stability features (in order of importance):
   - Acks on every chunk via watchdog.touch() so a stalled stream aborts
     after STREAM_HEARTBEAT_MS, not after STREAM_TIMEOUT_MS.
   - 1 retry on transient 5xx/429/heartbeat/total-timeout.
   - User Stop click returns cancelled:true (not an error). */
export async function callAPIStream(messages,maxTokens,onDelta,onThinking){
  /* Read main.js globals via window — this module stays independent. */
  var state=window.state;
  var getActiveProvider=window.getActiveProvider;
  var getCsrfToken=window.getCsrfToken;
  var makeAIWatchdog=window.makeAIWatchdog;
  var sleepBackoff=window.sleepBackoff;
  var offlineGuard=window.offlineGuard;
  var isReasoningProvider=window.isReasoningProvider;
  var STREAM_TIMEOUT_MS=window.STREAM_TIMEOUT_MS;
  var STREAM_HEARTBEAT_MS=window.STREAM_HEARTBEAT_MS;
  var STREAM_RETRYABLE_STATUS=window.STREAM_RETRYABLE_STATUS;
  var STREAM_MAX_ATTEMPTS=window.STREAM_MAX_ATTEMPTS;

  var provider=getActiveProvider();
  if(!provider){
    state.lastCallError="no provider";
    return null;
  }
  state.lastCallError=null;

  /* Built-in Beagle: call MiniMax through the nginx reverse proxy at
     /api/minimax/ (same origin, no CORS/CSP issues). */
  if(provider.isBuiltIn){
    var beagleMsgs=messages.slice();
    /* Append identity as the LAST system message so it takes precedence. */
    var hasIdentity=false;
    for(var bi=0;bi<beagleMsgs.length;bi++){
      if(beagleMsgs[bi].role==="system"&&beagleMsgs[bi].content.indexOf("Beagle A")>=0)hasIdentity=true;
    }
    if(!hasIdentity){
      beagleMsgs.unshift({role:"system",
        content:"Your name is Beagle A. You are an AI assistant developed by Topodrive company. "+
          "You are helpful, knowledgeable, and precise. Never identify as MiniMax or any other model."});
    }
    var body=JSON.stringify({messages:beagleMsgs,model:provider.model,temperature:0.7,max_tokens:maxTokens,stream:true});
    /* Built-in Beagle path: previously had only a single 120s total
       timeout and no heartbeat / retry, so a MiniMax stall would hang
       the chat forever. Now uses the universal watchdog + 1 retry. */
    if(offlineGuard()){
      state.lastCallError="offline: you appear to be offline";
      return null;
    }
    var beagleAttempts=0;
    var BEAGLE_MAX=2;
    var lastBeagleErr=null;
    while(beagleAttempts<BEAGLE_MAX){
      beagleAttempts++;
      var wdBeagle=makeAIWatchdog(STREAM_TIMEOUT_MS,STREAM_HEARTBEAT_MS,function(){try{wdBeagle&&wdBeagle.stop("beagle-watchdog")}catch(_){}});
      var acDirect=wdBeagle.ac;
      window._activeChatAbort=function(reason){try{acDirect.abort(reason||"superseded")}catch(_){}};
      try{
        var csrfDirect=getCsrfToken();
        var respDirect=await fetch("/api/minimax/v1/chat/completions",{
          method:"POST",
          credentials:"include",
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+provider.key,"X-CSRF-Token":csrfDirect||""},
          body:body,
          signal:acDirect.signal
        });
        wdBeagle.touch();
        if(!respDirect.ok){
          var errBody="";try{errBody=await respDirect.text()}catch(_){}
          lastBeagleErr=respDirect.status+" "+(errBody||respDirect.statusText||"").slice(0,200);
          /* Retry on transient 5xx / 429 only. */
          if(STREAM_RETRYABLE_STATUS[respDirect.status]&&beagleAttempts<BEAGLE_MAX){
            wdBeagle.stop("retryable-http");
            await sleepBackoff(beagleAttempts,respDirect.headers.get("Retry-After"));
            continue;
          }
          state.lastCallError=lastBeagleErr;
          wdBeagle.stop("done");
          return null;
        }
        if(!respDirect.body||!respDirect.body.getReader){
          state.lastCallError="no stream body";
          wdBeagle.stop("done");
          return null;
        }
        var readerDirect=respDirect.body.getReader();
        var decoderDirect=new TextDecoder("utf-8");
        var bufDirect="";var fullDirect="";
        var gotAny= false;
        while(true){
          var stepDirect=await readerDirect.read();
          if(stepDirect.done)break;
          wdBeagle.touch();
          if(stepDirect.value&&stepDirect.value.byteLength>0)gotAny=true;
          bufDirect+=decoderDirect.decode(stepDirect.value,{stream:true});
          var idxDirect;
          while((idxDirect=bufDirect.indexOf("\n\n"))>=0){
            var frameDirect=bufDirect.slice(0,idxDirect);bufDirect=bufDirect.slice(idxDirect+2);
            var linesDirect=frameDirect.split("\n");
            for(var liD=0;liD<linesDirect.length;liD++){
              var lineD=linesDirect[liD];
              if(lineD.indexOf("data:")!==0)continue;
              var payloadD=lineD.slice(5).trim();
              if(!payloadD||payloadD==="[DONE]")continue;
              try{
                var objD=JSON.parse(payloadD);
                var deltaD=objD.choices&&objD.choices[0]&&objD.choices[0].delta&&objD.choices[0].delta.content;
                var reasoningD=objD.choices&&objD.choices[0]&&objD.choices[0].delta&&objD.choices[0].delta.reasoning_content;
                if(typeof reasoningD==="string"&&reasoningD.length>0&&typeof onThinking==="function"){
                  try{onThinking(reasoningD)}catch(_){}
                }
                if(typeof deltaD==="string"){
                  fullDirect+=deltaD;
                  try{onDelta(deltaD,fullDirect)}catch(_){}
                }
              }catch(_){}
            }
          }
        }
        bufDirect+=decoderDirect.decode();
        wdBeagle.stop("done");
        return {text:fullDirect,html:null,widgets:[],cancelled:false};
      }catch(e){
        wdBeagle.stop("error");
        var isAbort=(e&&(e.name==="AbortError"||e.code===20));
        var reason=wdBeagle.reason()||"";
        var isHeartbeat=reason.indexOf("heartbeat")>=0;
        var isTotal=reason.indexOf("total-timeout")>=0;
        lastBeagleErr=isAbort
          ?(isHeartbeat?"stream stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)":
             isTotal?"request timed out after "+(STREAM_TIMEOUT_MS/1000)+"s":
             "cancelled (timeout or user)")
          :String(e&&e.message||e);
        /* Retriable: heartbeat (silence) or total timeout. The user
           cancellation path (window._activeChatAbort("superseded"))
           has reason="" so watchdog.isStopped() is true, and we don't
           retry in that case. */
        var userCancelled=isAbort&&!wdBeagle.isStopped();
        if(!userCancelled&&(isHeartbeat||isTotal)&&beagleAttempts<BEAGLE_MAX){
          await sleepBackoff(beagleAttempts,null);
          continue;
        }
        if(userCancelled){
          /* Explicit user Stop click (the Stop button on the send
             button morphed into a red square). The fetch was aborted
             by _activeChatAbort, not by the watchdog — do NOT show
             an error bubble and do NOT fall back to mock. Return a
             cancelled result so the caller can clean up the bubble
             silently. Partial text already streamed into `fullDirect`
             is preserved so the bubble can render whatever the user
             saw up to the click. */
          return {text:fullDirect||"",html:null,widgets:[],cancelled:true};
        }
        state.lastCallError=lastBeagleErr;
        return null;
      }
    }
    state.lastCallError=lastBeagleErr||"Beagle request failed";
    return null;
  }

  var attempt=0;
  var lastErr=null;
  /* Offline precheck — fail fast (don't waste the 1.5s + 3.5s backoff
     if the OS already knows we have no network). */
  if(offlineGuard()){
    state.lastCallError="offline: you appear to be offline";
    return null;
  }

  while(attempt<STREAM_MAX_ATTEMPTS){
    attempt++;
    var ac=new AbortController();
    window._activeChatAbort=function(reason){try{ac.abort(reason||"superseded")}catch(_){}};
    var tmo=setTimeout(function(){try{ac.abort("timeout")}catch(_){}},STREAM_TIMEOUT_MS);
    var hbTmo=null;
    var resp=null;
    try{
      /* P0.3 — use apiFetchRaw so credentials / CSRF / 401 → handleAuthExpired /
       * 403 → refresh+yield+replay are all handled centrally. It throws
       * an ApiError on non-2xx, which we catch below to decide whether
       * to retry (transient 5xx/429) or fail terminally.
       * Pass body as an object so apiFetchRaw stringifies it and sets
       * Content-Type: application/json — pre-stringified bodies are skipped. */
      var apiBody={messages:messages,temperature:0.7,max_tokens:maxTokens};
      if(isReasoningProvider()){
        apiBody.reasoning_effort="high";
        apiBody.extra_body={thinking:{type:"enabled"}};
      }
      resp=await apiFetchRaw("/api/chat/stream",{
        method:"POST",
        body:apiBody,
        signal:ac.signal,
        timeoutMs:STREAM_TIMEOUT_MS
      });
    }catch(e){
      clearTimeout(tmo);
      if(hbTmo)clearTimeout(hbTmo);
      var eStatus=e&&e.status;
      var isAbort=(e&&(e.name==="AbortError"||ac.signal.aborted));
      if(isAbort){
        lastErr="request timed out after "+(STREAM_TIMEOUT_MS/1000)+"s";
        /* Total budget exhausted — stop retrying. */
        break;
      }
      if(eStatus===401){
        /* 401 was already surfaced via handleAuthExpired by apiFetchRaw
         * (gated on the grace window). Set lastCallError and exit. */
        state.lastCallError="401: session expired";
        return null;
      }
      if(STREAM_RETRYABLE_STATUS[eStatus]&&attempt<STREAM_MAX_ATTEMPTS){
        lastErr=eStatus+" "+(e.message||"error");
        var retryAfterHdr=e&&e.body&&e.body.headers?e.body.headers.get("Retry-After"):null;
        await sleepBackoff(attempt,retryAfterHdr);
        continue;
      }
      lastErr=(eStatus?eStatus+" ":"network: ")+(e&&e.message||e);
      console.error("[API stream] request failed:",e);
      state.lastCallError=lastErr;
      return null;
    }
    clearTimeout(tmo);

    if(!resp.body||!resp.body.getReader){
      state.lastCallError="no stream body";
      return null;
    }

    var reader=resp.body.getReader();
    var decoder=new TextDecoder("utf-8");
    var buf="";
    var full="";
    var formattedHtml=null;
    var cancelled=false;
    var bytesReceived=0;
    var gotAnyData=false;
    var heartbeatFired=false;   /* used instead of e.message to detect heartbeat abort */
    try{
      while(true){
        var step=await reader.read();
        if(step.done)break;
        /* Heartbeat: every chunk we receive resets the silence timer. */
        if(hbTmo)clearTimeout(hbTmo);
        hbTmo=setTimeout(function(){
          /* No data for STREAM_HEARTBEAT_MS — treat as a hang. */
          heartbeatFired=true;
          try{ac.abort("heartbeat")}catch(_){}
        },STREAM_HEARTBEAT_MS);
        bytesReceived+=step.value.byteLength;
        gotAnyData=gotAnyData||step.value.byteLength>0;
        /* Decode with stream:true so multi-byte chars split across chunks
           are buffered properly. The decoder remembers the trailing bytes. */
        buf+=decoder.decode(step.value,{stream:true});
        var idx;
        while((idx=buf.indexOf("\n\n"))>=0){
          var frame=buf.slice(0,idx);
          buf=buf.slice(idx+2);
          var lines=frame.split("\n");
          var dataParts=[];
          for(var li=0;li<lines.length;li++){
            var line=lines[li];
            if(line.indexOf("data:")===0){
              dataParts.push(line.slice(5).trim());
            }else if(line.indexOf("event:")===0){
              /* event: error surfaces failures */
              if(/error/i.test(line))state.lastCallError="upstream error event";
            }
          }
          if(dataParts.length===0)continue;
          var payload=dataParts.join("\n");
          if(!payload||payload==="[DONE]")continue;
          /* Backend sends __FORMATTED__ as the final event with server-rendered HTML */
          if(payload==="__FORMATTED__"){
            /* The next frame's first data: line contains the JSON */
            continue;
          }
          if(formattedHtml===null&&payload.indexOf("{")===0&&payload.indexOf("html")>=0){
            try{formattedHtml=JSON.parse(payload);continue}catch(_){}
          }
          /* Some upstreams send "event: error" frames; surface them. */
          try{
            var obj=JSON.parse(payload);
            if(obj.error){throw new Error(typeof obj.error==="string"?obj.error:(obj.error.message||"upstream error"))}
            var delta=obj.choices&&obj.choices[0]&&obj.choices[0].delta&&obj.choices[0].delta.content;
            /* Reasoning field (DeepSeek R1 / QwQ / o1-style): some
               upstreams surface the chain-of-thought as a separate
               `reasoning_content` field on the delta. Route it to the
               thinking pill (if the caller subscribed). */
            var reasoning=obj.choices&&obj.choices[0]&&obj.choices[0].delta&&obj.choices[0].delta.reasoning_content;
            if(typeof reasoning==="string"&&reasoning.length>0&&typeof onThinking==="function"){
              try{onThinking(reasoning)}catch(_){}
            }
            if(typeof delta==="string"&&delta.length>0){
              full+=delta;
              try{if(onDelta){onDelta(delta,full)}}catch(deltaErr){
                /* Swallow render errors so the stream survives a bad formatMsg. */
                console.warn("[API stream] onDelta threw:",deltaErr&&deltaErr.message);
              }
            }
          }catch(parseErr){
            /* Could be a final [DONE] or unknown frame; ignore unless it
               looks like an error event. */
            if(/error/i.test(payload)){
              state.lastCallError=payload.slice(0,200);
              try{reader.cancel()}catch(_){}
              cancelled=true;
              break;
            }
          }
        }
        if(cancelled)break;
      }
      /* Clear heartbeat — stream ended naturally. */
      if(hbTmo){clearTimeout(hbTmo);hbTmo=null}
      /* Flush any trailing UTF-8 bytes that didn't have a closing chunk. */
      buf+=decoder.decode();
    }catch(e){
      console.error("[API stream] read error:",e);
      if(hbTmo){clearTimeout(hbTmo);hbTmo=null}
      if(e&&(e.name==="AbortError"||e.code===20)){
        cancelled=true;
        /* Heartbeat-timeouts are retriable; total-timeout is not. */
        var isHeartbeat=heartbeatFired;
        if(isHeartbeat&&attempt<STREAM_MAX_ATTEMPTS){
          lastErr="stream stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)";
          console.warn("[API stream]",lastErr+", retrying");
          await sleepBackoff(attempt);
          continue;
        }
        /* User Stop click — return a cancelled result with whatever
           text already streamed, so the bubble cleans up silently
           instead of showing an error. */
        if(!isHeartbeat&&!ac.signal.reason){
          /* No reason means the abort wasn't from a watchdog timer;
             it was from _activeChatAbort (user Stop). */
          return {text:full||"",html:formattedHtml&&formattedHtml.html||null,widgets:formattedHtml&&formattedHtml.widgets||[],cancelled:true};
        }
        state.lastCallError=isHeartbeat?lastErr:"cancelled (timeout or user)";
      }else{
        state.lastCallError=String(e&&e.message||e);
      }
      return null;
    }
    if(cancelled){
      if(!state.lastCallError)state.lastCallError="Stream cancelled (parse error)";
      return null;
    }
    /* Empty stream — server returned 200 but no body. Treat as
       retriable (rare, but happens on flaky upstreams). */
    if(!gotAnyData&&!full&&!formattedHtml){
      lastErr="empty stream ("+bytesReceived+" bytes received)";
      if(attempt<STREAM_MAX_ATTEMPTS){
        console.warn("[API stream]",lastErr+", retrying");
        await sleepBackoff(attempt);
        continue;
      }
      state.lastCallError=lastErr;
      return null;
    }
    if(!full&&!formattedHtml){
      state.lastCallError="empty stream";
      return null;
    }
    return {text:full,html:formattedHtml&&formattedHtml.html||null,widgets:formattedHtml&&formattedHtml.widgets||[],cancelled:false};
  }
  /* Both attempts failed with the same retryable condition.
     Ensure lastCallError is always set even if lastErr is
     falsy — otherwise the caller (generateFollowUpStream /
     askChatTurn) falls through to a mock response, silently
     replacing the AI reply with a generic question. */
  state.lastCallError=lastErr||"Stream failed after all retries";
  return null;
}
