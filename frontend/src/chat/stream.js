/* ── Streaming chat LLM call ──
   SSE consumer for /api/chat/stream and the built-in Beagle proxy.
   Pure network/parsing logic — returns {text, html, widgets, cancelled}
   on success, null on failure. UI rendering, bubble management, and
   _activeChatAbort coordination stay in main.js's addStreamingMessage
   (deferred to a dedicated refactor PR).
   Reads main.js globals via window.* (state, getActiveProvider,
   sleepBackoff, offlineGuard, isReasoningProvider, etc.). */

import { apiFetchRaw } from '../util/api.js';
import { stateStore } from '../state/store.js';
import { buildChatRequestBody } from './api.js';
import {
  AI_MAX_ATTEMPTS,
  isUserAbort,
  waitForAIRetry,
} from './retryPolicy.ts';
import { consumeSseBuffer } from '../../../packages/core/src/index.ts';
import { createChatTurn } from './turnClient.ts';
import { recoverDetachedTurn } from './detachedTurnRecovery.js';
import { createStreamFrameProcessor, makeStreamError } from './streamFrameProcessor.js';
import { reportSwallow } from '../util/reportSwallow.ts';

function setLastCallError(value){
  stateStore.dispatch({type:'state/set',key:'lastCallError',value:value});
}

function bindAbortSignal(parent,child){
  if(!parent)return function(){};
  var onAbort=function(){try{child.abort(parent.reason||"aborted")}catch (e) {reportSwallow(e, 'chat/stream.bindAbortSignal'); }};
  if(parent.aborted)onAbort();
  else parent.addEventListener("abort",onAbort,{once:true});
  return function(){try{parent.removeEventListener("abort",onAbort)}catch (e) {reportSwallow(e, 'chat/stream.bindAbortSignal#2'); }};
}

/* Drop the global abort handle only while it is still the one this call
   installed. A superseded stream unwinds after the next turn has put its
   own handle in place; a marker every call sets alike let the old stream's
   cleanup wipe the new turn's handle, so a later Stop could not reach the
   live request any more. */
function clearActiveChatAbort(handle){
  if(handle&&window._activeChatAbort===handle){
    window._activeChatAbort=null;
  }
}

/* Streaming variant. Calls /api/chat/stream (our backend SSE proxy).
   onDelta(text, full) is called for every text chunk the upstream produces.
   Resolves to {text,html,widgets,cancelled} on success, or null on failure.
   Stability features (in order of importance):
   - No client-side response deadline and no silence watchdog: a reasoning
     model may think for as long as it needs. Retries still cover transient
     5xx/429/network failures, and the server keeps the socket warm with
     SSE keepalives.
   - Five fixed-delay retries on transient 5xx / 429 / network failures.
   - User Stop click returns cancelled:true (not an error). */
export async function callAPIStream(messages,maxTokens,onDelta,onThinking,opts){
  /* Read main.js globals via window — this module stays independent. */
  var getActiveProvider=window.getActiveProvider;
  var offlineGuard=window.offlineGuard;
  /* P_no-response-timeout — the per-provider total/silence budgets were
     removed. Long reasoning is legitimate, so the only ways out of this
     loop are: user Stop, session switch/supersede, a transport error, or
     a completed response. Retry count is global: five retries after the
     initial attempt, with a small window override for unit harnesses. */
  var configuredAttempts=opts&&typeof opts.maxAttempts==='number'
    ? opts.maxAttempts
    : window.STREAM_MAX_ATTEMPTS;
  var STREAM_MAX_ATTEMPTS=(typeof configuredAttempts==='number'&&configuredAttempts>0)
    ? configuredAttempts
    : AI_MAX_ATTEMPTS;
  var retryOptions=Object.assign({},opts||{}, {
    source:'chat',
    maxRetries:STREAM_MAX_ATTEMPTS-1,
  });

  var provider=getActiveProvider();
  if(!provider){
    setLastCallError("no provider");
    return null;
  }
  setLastCallError(null);

  /* Built-in identity + custom-instructions prepending + reasoning
     knobs are all centralized in buildChatRequestBody (chat/api.js),
     so this streaming path does not duplicate that logic and cannot
     drift from the sync /api/chat path. The body returned below
     already carries the correct messages array. */

  var attempt=0;
  var lastErr=null;
  var turnAbort=new AbortController();
  var unbindExternal=bindAbortSignal(retryOptions.signal,turnAbort);
  var unbindAttempt=function(){};
  var activeAbortHandle=null;
  var finishTurn=function(){
    unbindAttempt();
    unbindExternal();
    clearActiveChatAbort(activeAbortHandle);
  };
  var retryWaitOptions=Object.assign({},retryOptions,{signal:turnAbort.signal});
  var waitForRetry=async function(retryAttempt,error){
    try{return await waitForAIRetry(retryAttempt,error,retryWaitOptions)}
    catch(e){
      if(isUserAbort(e,turnAbort.signal)||isUserAbort(e,retryOptions.signal))return false;
      throw e;
    }
  };
  var retryWasCancelled=function(){
    return turnAbort.signal.aborted&&isUserAbort(null,turnAbort.signal);
  };
  /* Offline precheck — fail fast (don't waste the fixed retry delay
     if the OS already knows we have no network). */
  if(offlineGuard()){
    setLastCallError("offline: you appear to be offline");
    finishTurn();
    return null;
  }

  var activeBoundTurnId=(opts&&typeof opts.turnId==="string")?opts.turnId:null;

  while(attempt<STREAM_MAX_ATTEMPTS){
    attempt++;
    var ac=new AbortController();
    unbindAttempt=bindAbortSignal(turnAbort.signal,ac);
    activeAbortHandle=function(reason){
      try{turnAbort.abort(reason)}catch (e) {reportSwallow(e, 'chat/stream.callAPIStream'); }
      try{ac.abort(reason)}catch (e) {reportSwallow(e, 'chat/stream.callAPIStream#2'); }
    };
    window._activeChatAbort=activeAbortHandle;
    var resp=null;
    try{
      /* P0.3 — use apiFetchRaw so credentials / CSRF / 401 → handleAuthExpired /
       * 403 → refresh+yield+replay are all handled centrally. It throws
       * an ApiError on non-2xx, which we catch below to decide whether
       * to retry (transient 5xx/429) or fail terminally.
       * Pass body as an object so apiFetchRaw stringifies it and sets
       * Content-Type: application/json — pre-stringified bodies are skipped.
       * Reasoning knobs, built-in identity, and custom-instructions
       * prepending are owned by buildChatRequestBody — see chat/api.js. */
      var apiBody=buildChatRequestBody(messages,maxTokens,0.7);
      /* M1 async — bind the stream to a detached turn when the caller
         created one. The server mirrors frames into chat_turn_events
         and keeps running detached on socket close; turnId travels in
         the body (the route also accepts ?turnId=). */
      try{
        if(opts&&typeof opts.turnId==="string"&&opts.turnId)apiBody.turnId=opts.turnId;
        /* P_prep-parallel — let the stream request create the turn itself
           (idempotent on clientTurn.id), instead of a separate POST
           /api/chat-turns round-trip before the stream may start. */
        else if(opts&&opts.clientTurn&&typeof opts.clientTurn.id==="string")apiBody.clientTurn=opts.clientTurn;
      }catch (e) {reportSwallow(e, 'chat/stream.callAPIStream#3'); }
      resp=await apiFetchRaw("/api/chat/stream",{
        method:"POST",
        body:apiBody,
        signal:ac.signal,
        /* P_stream-priority — the stream is the content the user is actively
           waiting on; mark it high so it wins bandwidth over background
           subresources (fonts, images, viz chunks) on constrained links.
           Chromium honours `priority`; other engines ignore the unknown
           option harmlessly. */
        priority:"high"
      });
    }catch(e){
      var eStatus=e&&e.status;
      var isAbort=(e&&(e.name==="AbortError"||ac.signal.aborted));
      var requestError=makeStreamError(
        isAbort
          ? "request was interrupted"
          : (eStatus?eStatus+" ":"network: ")+(e&&e.message||e),
        eStatus,
        e&&e.body,
      );
      requestError.code=e&&e.code;
      requestError.reason=ac.signal.reason;
      if(isUserAbort(e,ac.signal)||isUserAbort(e,turnAbort.signal)){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      if(await waitForRetry(attempt,requestError)){
        lastErr=requestError;
        unbindAttempt();
        continue;
      }
      if(retryWasCancelled()){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      lastErr=requestError;
      console.error("[API stream] request failed:",e);
      setLastCallError(requestError.message);
      finishTurn();
      return null;
    }
    if(!resp.body||!resp.body.getReader){
      lastErr=makeStreamError("no stream body");
      if(await waitForRetry(attempt,lastErr)){
        unbindAttempt();
        continue;
      }
      if(retryWasCancelled()){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      setLastCallError(lastErr.message);
      finishTurn();
      return null;
    }

    var reader=resp.body.getReader();
    var decoder=new TextDecoder("utf-8");
    var buf="";
    var cancelled=false;
    var bytesReceived=0;
    var gotAnyData=false;
    var frameProcessor=createStreamFrameProcessor({
      opts:opts,
      onDelta:onDelta,
      onThinking:onThinking,
      onActiveTurnBound:function(turnId){activeBoundTurnId=turnId;},
    });
    var processFrame=frameProcessor.processFrame;
    try{
      while(true){
        var step=await reader.read();
        if(step.done)break;
        bytesReceived+=step.value.byteLength;
        gotAnyData=gotAnyData||step.value.byteLength>0;
        /* Decode with stream:true so multi-byte chars split across chunks
           are buffered properly. The decoder remembers the trailing bytes. */
        buf+=decoder.decode(step.value,{stream:true});
        /* Keep framing identical to the native clients. Web-specific
           parsing remains inside processFrame for <think>, HTML, widgets,
           and tool-card rendering. */
        buf=consumeSseBuffer(buf,function(frame){
          if(!cancelled)processFrame(frame);
        });
        if(cancelled)break;
      }
      /* P_reader_release — explicitly release the reader so the
         underlying HTTP/2 stream can be returned to the connection
         pool. Without this, the browser keeps the stream counted
         against its per-host concurrent-stream limit (Chrome 256,
         Firefox 100), and a long chat session can exhaust it. */
      try{reader.releaseLock()}catch (e) {reportSwallow(e, 'chat/stream.callAPIStream#9'); }
      /* Flush any trailing UTF-8 bytes that didn't have a closing chunk. */
      buf+=decoder.decode();
      /* P_final_frame_flush — upstream may close the connection without a
         trailing "\n\n" delimiter, leaving the last SSE frame unparsed in
         buf. That dropped frame is exactly the "occasional last few chars
         truncated" symptom. Parse the leftover buffer as one final frame so
         its content delta reaches full + onDelta. Guard on "data:" so we
         don't re-run parsing on empty/keepalive residue. */
      if(!cancelled&&buf&&buf.indexOf("data:")>=0){
        var _finalFrame=buf;
        buf="";
        processFrame(_finalFrame);
      }
      frameProcessor.finish();
    }catch(e){
      console.error("[API stream] read error:",e);
      if(e&&(e.name==="AbortError"||e.code===20)){
        /* A transport-level interruption (connection dropped, proxy
           closed the socket) is retryable only before anything visible
           reached the caller. There is no client-side deadline and no
           silence watchdog: a slow-but-healthy reasoning stream is
           never aborted from here. */
        var attemptError=makeStreamError("stream was interrupted before it completed");
        attemptError.reason=ac.signal.reason;
        if(!isUserAbort(e,ac.signal)&&!isUserAbort(e,turnAbort.signal)
           &&!frameProcessor.semanticActivity&&await waitForRetry(attempt,attemptError)){
          lastErr=attemptError;
          console.warn("[API stream]",attemptError.message+", retrying before visible output");
          try{await reader.cancel()}catch (e) {reportSwallow(e, 'chat/stream.callAPIStream#11'); }
          try{reader.releaseLock()}catch (e) {reportSwallow(e, 'chat/stream.callAPIStream#12'); }
          unbindAttempt();
          continue;
        }
        /* User Stop click — return a cancelled result with whatever
           text already streamed, so the bubble cleans up silently
           instead of showing an error. */
        if(isUserAbort(e,ac.signal)||isUserAbort(e,turnAbort.signal)
           ||(!frameProcessor.semanticActivity&&(!ac.signal.reason||ac.signal.reason==="user-stop"))){
          /* A named user stop is preferred. The no-reason fallback keeps
             compatibility with browsers that expose AbortError without the
             custom reason attached. */
          finishTurn();
          return {text:frameProcessor.full||"",html:frameProcessor.formattedHtml&&frameProcessor.formattedHtml.html||null,widgets:frameProcessor.formattedHtml&&frameProcessor.formattedHtml.widgets||[],cancelled:true};
        }
        setLastCallError(lastErr||attemptError.message);
      }else{
        setLastCallError(String(e&&e.message||e));
      }

      // P_detached_recovery: if the socket closed mid-stream (network drop, proxy timeout),
      // the backend keeps running detached. Attempt to recover the turn so the dialogue is never dropped!
      if(!isUserAbort(e,ac.signal) && !isUserAbort(e,turnAbort.signal)){
        var turnToRecover = activeBoundTurnId;
        if(!turnToRecover && opts && opts.clientTurn && typeof opts.clientTurn.id === "string"){
          try {
            var existingTurn = await createChatTurn({ clientTurnId: opts.clientTurn.id });
            if(existingTurn && existingTurn.turn && existingTurn.turn.id){
              turnToRecover = existingTurn.turn.id;
            }
          } catch (e) { reportSwallow(e, 'chat/stream.createChatTurn'); }
        }
        if(turnToRecover){
          try {
            console.info("[API stream] connection dropped, recovering from detached turn:", turnToRecover);
            var recovered = await recoverDetachedTurn(turnToRecover, {
              currentFull: frameProcessor.full,
              onDelta: onDelta,
              onThinking: onThinking,
              opts: opts,
              signal: turnAbort.signal,
            });
            if(recovered){
              finishTurn();
              return recovered;
            }
          } catch(recErr){
            console.warn("[API stream] detached recovery failed:", recErr);
          }
        }
      }

      finishTurn();
      return null;
    }
    if(cancelled){
      if(!stateStore.read('lastCallError'))setLastCallError("Stream cancelled (parse error)");
      finishTurn();
      return null;
    }
    /* P_final_cleanup — drop refs to the read-side resources so the
       per-turn HTTP/2 stream and underlying buffers can be GC'd
       promptly. This is the path that runs on a clean DONE; the
       earlier `releaseLock` is for the path where the reader is
       still bound to a writable variable. */
    try{resp.body&&resp.body.cancel&&resp.body.cancel().catch(function(e){ reportSwallow(e, 'chat/stream.callAPIStream.cancelReject'); })}catch (e) {reportSwallow(e, 'chat/stream.callAPIStream.cancelGuard'); }
    resp=null;
    reader=null;
    if(frameProcessor.streamError){
      if(!frameProcessor.semanticActivity&&await waitForRetry(attempt,frameProcessor.streamError)){
        lastErr=frameProcessor.streamError;
        unbindAttempt();
        continue;
      }
      if(retryWasCancelled()){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      setLastCallError(frameProcessor.streamError.message||'stream request failed');
      finishTurn();
      return null;
    }
    /* Empty stream — server returned 200 but no body. Treat as
       retriable (rare, but happens on flaky upstreams).
       P_silence_fix — preserve any real error already captured from
       event:error SSE frames instead of overwriting it with the
       generic "empty stream". */
    if(!gotAnyData&&!frameProcessor.full&&!frameProcessor.formattedHtml){
      lastErr=makeStreamError("empty stream ("+bytesReceived+" bytes received)");
      if(await waitForRetry(attempt,lastErr)){
        console.warn("[API stream]",lastErr.message+", retrying");
        unbindAttempt();
        continue;
      }
      if(retryWasCancelled()){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      setLastCallError(lastErr.message);
      finishTurn();
      return null;
    }
    if(!frameProcessor.full&&!frameProcessor.formattedHtml){
      lastErr=makeStreamError("empty stream (server returned no content)");
      if(await waitForRetry(attempt,lastErr)){
        console.warn("[API stream]",lastErr.message+", retrying");
        unbindAttempt();
        continue;
      }
      if(retryWasCancelled()){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      setLastCallError(lastErr.message);
      finishTurn();
      return null;
    }
    /* P_global_handle_cleanup — drop the global abort handle so
       a future "session-switch" or "user-stop" call doesn't fire
       a closure that pins this call's AbortController. */
    finishTurn();
    return {text:frameProcessor.full,html:frameProcessor.formattedHtml&&frameProcessor.formattedHtml.html||null,widgets:frameProcessor.formattedHtml&&frameProcessor.formattedHtml.widgets||[],cancelled:false};
  }
  /* All six attempts failed with the same retryable condition.
     Ensure lastCallError is always set even if lastErr is
     falsy — otherwise the caller (generateFollowUpStream /
     askChatTurn) falls through to a mock response, silently
     replacing the AI reply with a generic question. */
  setLastCallError(lastErr&&lastErr.message||"Stream failed after all retries");
  finishTurn();
  return null;
}
