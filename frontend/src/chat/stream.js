/* ── Streaming chat LLM call ──
   SSE consumer for /api/chat/stream and the built-in Beagle proxy.
   Pure network/parsing logic — returns {text, html, widgets, cancelled}
   on success, null on failure. UI rendering, bubble management, and
   _activeChatAbort coordination stay in main.js's addStreamingMessage
   (deferred to a dedicated refactor PR).
   Reads main.js globals via window.* (state, getActiveProvider,
   sleepBackoff, offlineGuard, isReasoningProvider,
   STREAM_TIMEOUT_MS, etc.). */

import { apiFetchRaw } from '../util/api.js';
import { stateStore } from '../state/store.js';
import { buildChatRequestBody } from './api.js';
import {
  AI_MAX_ATTEMPTS,
  isUserAbort,
  waitForAIRetry,
} from './retryPolicy.ts';
import { consumeSseBuffer } from '../../../packages/core/src/index.ts';

import { pickStreamBudgets } from '../config/providers.js';

function setLastCallError(value){
  stateStore.dispatch({type:'state/set',key:'lastCallError',value:value});
}

/* P_log-gating — DEV-only diagnostics. Tool-event frames used to be
   parsed inside bare `catch(_){}` blocks, so a malformed tool_use /
   tool_call_delta frame vanished without a trace and the tool card
   simply never updated. Surface those parse failures in development;
   production stays quiet (the predicate is a build-time constant, so
   the warn path tree-shakes out of the bundle). */
var DEV=(typeof import.meta!=='undefined'&&import.meta.env&&import.meta.env.DEV)===true;
function warnBadFrame(evName,err){
  if(!DEV)return;
  try{console.warn('[stream] failed to handle '+evName+' frame:',err&&err.message||err)}catch(_){}
}

/* Format a Retry-After-seconds value as a short human phrase.
   Used by the 429 toast so the message reads "Try again in 2 min"
   rather than the raw 178s. Anything below 60s collapses to seconds
   so a sub-minute cooldown doesn't read as "0 min". */
function makeStreamError(message,status,body) {
  var error=new Error(String(message||'stream request failed'));
  if(status!=null)error.status=Number(status);
  if(body!=null)error.body=body;
  if(body&&body.code)error.code=body.code;
  return error;
}

function bindAbortSignal(parent,child){
  if(!parent)return function(){};
  var onAbort=function(){try{child.abort(parent.reason||"aborted")}catch(_) {}};
  if(parent.aborted)onAbort();
  else parent.addEventListener("abort",onAbort,{once:true});
  return function(){try{parent.removeEventListener("abort",onAbort)}catch(_) {}};
}

function clearActiveChatAbort(){
  if(window._activeChatAbort&&window._activeChatAbort._fromThisCall){
    window._activeChatAbort=null;
  }
}

/* Streaming variant. Calls /api/chat/stream (our backend SSE proxy).
   onDelta(text, full) is called for every text chunk the upstream produces.
   Resolves to {text,html,widgets,cancelled} on success, or null on failure.
   Stability features (in order of importance):
   - Acks on every chunk via watchdog.touch() so a stalled stream aborts
     after STREAM_HEARTBEAT_MS, not after STREAM_TIMEOUT_MS.
   - Five fixed-delay retries on transient 5xx/429/heartbeat/total-timeout.
   - User Stop click returns cancelled:true (not an error). */
export async function callAPIStream(messages,maxTokens,onDelta,onThinking,opts){
  /* Read main.js globals via window — this module stays independent. */
  var getActiveProvider=window.getActiveProvider;
  var offlineGuard=window.offlineGuard;
  /* P_reasoning_budget — pick the silence/total budget per provider.
     Reasoning models stream 30-90s of sparse thinking tokens; a 60s
     heartbeat on them would falsely trip "stalled" and waste a retry. */
  var _budget=(typeof pickStreamBudgets==="function"
    ? pickStreamBudgets()
    : { timeoutMs: window.STREAM_TIMEOUT_MS||240000, heartbeatMs: window.STREAM_HEARTBEAT_MS||45000 });
  var STREAM_TIMEOUT_MS=_budget.timeoutMs;
  var STREAM_HEARTBEAT_MS=_budget.heartbeatMs;
  /* Provider-specific timeout/heartbeat budgets remain intact, but retry
     count is global: five retries after the initial attempt. A small
     window override is retained for deterministic unit harnesses. */
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
  var finishTurn=function(){
    unbindAttempt();
    unbindExternal();
    clearActiveChatAbort();
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

  while(attempt<STREAM_MAX_ATTEMPTS){
    attempt++;
    var ac=new AbortController();
    unbindAttempt=bindAbortSignal(turnAbort.signal,ac);
    window._activeChatAbort=function(reason){
      try{turnAbort.abort(reason)}catch(_){}
      try{ac.abort(reason)}catch(_){}
    };
    window._activeChatAbort._fromThisCall=true;
    var tmo=setTimeout(function(){try{ac.abort("timeout")}catch(_){}},STREAM_TIMEOUT_MS);
    var hbTmo=null;
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
      var requestError=makeStreamError(
        isAbort
          ? (ac.signal.reason==="heartbeat"
            ? "stream stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)"
            : "request timed out or was interrupted")
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
    clearTimeout(tmo);

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
    var full="";
    var formattedHtml=null;
    /* P_inline_think — M3 (the default built-in provider) emits chain-of-
       thought as inline <think>...</think> tags inside delta.content,
       NOT as a separate reasoning_content field. Without this parser
       the thinking pill would never light up for the default provider.
       The state machine holds a tail buffer (thinkTail) so a tag split
       across two chunks ("<th" + "ink>...") is reassembled before
       we decide where the content belongs. */
    var thinkOpen=false;        // currently inside a <think> block
    var thinkTail="";           // unflushed tail of the current delta
    var thinkBuf="";            // accumulated think content since the last flush
    var hasWarnedMissingThinking=false;  // one-shot warn when onThinking is missing
    var cancelled=false;
    var bytesReceived=0;
    var gotAnyData=false;
    /* A retry is safe only before anything semantically visible reaches the
       caller. Retrying after text/reasoning/tool events have already mutated
       the bubble replays the whole turn and duplicates both prose and tools. */
    var semanticActivity=false;
    var streamError=null;
    var heartbeatFired=false;   /* used instead of e.message to detect heartbeat abort */
    /* Parse ONE SSE frame (the text between two "\n\n" delimiters, or the
       leftover buffer flushed at stream end). Extracted so the same logic
       runs for both the delimited frames in the read loop AND the final
       frame the upstream may close without a trailing "\n\n". Frame-level
       early-exits use `return`; the inner <think> scanner keeps its own
       continue/break. */
    var processFrame=function(frame){
          var lines=frame.split("\n");
          var dataParts=[];
          var evName=null;
          for(var li=0;li<lines.length;li++){
            var line=lines[li];
            if(line.indexOf("data:")===0){
              dataParts.push(line.slice(5).trim());
            }else if(line.indexOf("event:")===0){
              /* Capture the named event so we can route tool_use / tool_result
                 frames to the caller's callbacks. */
              var ev=line.slice(6).trim();
              if(ev)evName=ev;
            }
          }
          /* Route tool-calling events before touching the data: payload.
             The backend emits `event: tool_use` and `event: tool_result`
             with a single JSON data: line per frame. */
          if(evName==="tool_use"){
            semanticActivity=true;
            if(opts&&typeof opts.onToolUse==="function"&&dataParts.length){
              try{opts.onToolUse(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("tool_use",e)}
            }
            return;
          }
          if(evName==="tool_result"){
            semanticActivity=true;
            if(opts&&typeof opts.onToolResult==="function"&&dataParts.length){
              try{opts.onToolResult(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("tool_result",e)}
            }
            return;
          }
          /* P_codex-approval — the unified runtime projects Codex's
             server-initiated approval request into the same chat stream.
             Keep it separate from tool_result so the inline card can stay
             actionable while the backend turn is paused. */
          if(evName==="tool_approval"){
            semanticActivity=true;
            if(opts&&typeof opts.onToolApproval==="function"&&dataParts.length){
              try{opts.onToolApproval(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("tool_approval",e)}
            }
            return;
          }
          /* P_codex-steps — the workspace agent streams its own activity:
             one `agent_step` per Codex thread item (command run, file
             edited, file read, web search, MCP call) and `agent_plan` for
             its todo list. They are routed separately from tool_progress so
             the chat can render a step list in the reading flow while the
             legacy progress channel stays byte-compatible for older
             clients. */
          if(evName==="agent_step"){
            semanticActivity=true;
            if(opts&&typeof opts.onAgentStep==="function"&&dataParts.length){
              try{opts.onAgentStep(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("agent_step",e)}
            }
            return;
          }
          if(evName==="agent_plan"){
            semanticActivity=true;
            if(opts&&typeof opts.onAgentPlan==="function"&&dataParts.length){
              try{opts.onAgentPlan(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("agent_plan",e)}
            }
            return;
          }
          /* P_error_event — retain the structured upstream error until the
             attempt has closed. If no semantic output was emitted, the
             shared retry policy can replay the request safely. */
          if(evName==="error"&&dataParts.length){
            try{
              var errData=JSON.parse(dataParts.join("\n"));
              streamError=makeStreamError(errData.error||errData.message||JSON.stringify(errData),errData.status,errData);
            }catch(_){
              streamError=makeStreamError(dataParts.join(" ").slice(0,200));
            }
            return;
          }
          /* P_progress — incremental tool events. The backend emits
             these between tool_use and tool_result to stream
             stdout/stderr and phase markers. Routing is per-call so
             the caller can update the matching .agent-tool-card
             with a spinner + live text. */
          if(evName==="tool_progress"){
            semanticActivity=true;
            if(opts&&typeof opts.onToolProgress==="function"&&dataParts.length){
              try{opts.onToolProgress(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("tool_progress",e)}
            }
            return;
          }
          /* P_execution_sse — execution_start carries the executionId
             that the frontend uses to connect to the independent
             execution SSE endpoint for real-time progress. */
          if(evName==="execution_start"){
            semanticActivity=true;
            if(opts&&typeof opts.onExecutionStart==="function"&&dataParts.length){
              try{opts.onExecutionStart(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("execution_start",e)}
            }
            return;
          }
          /* P_tool_stream — forward the live tool_call_delta frames
             from the backend to the caller's onToolCallDelta. The
             backend emits these as the upstream streams
             delta.tool_calls — typically the in-progress JSON for
             the tool's arguments (e.g. Python source). The frontend
             uses them to render the code in the tool card
             progressively, not as a single reveal at finish_reason. */
          if(evName==="tool_call_delta"){
            semanticActivity=true;
            if(opts&&typeof opts.onToolCallDelta==="function"&&dataParts.length){
              try{opts.onToolCallDelta(JSON.parse(dataParts.join("\n")))}catch(e){warnBadFrame("tool_call_delta",e)}
            }
            return;
          }
          if(dataParts.length===0)return;
          var payload=dataParts.join("\n");
          if(!payload||payload==="[DONE]")return;
          /* Backend sends __FORMATTED__ as the final event with server-rendered HTML */
          if(payload==="__FORMATTED__"){
            /* The next frame's first data: line contains the JSON */
            return;
          }
          /* Server-side pre-formatted HTML response detection. Only
             match when the parsed JSON object actually has a STRING
             `html` key — not when the substring "html" happens to
             appear in the message content (e.g. a ```html fenced
             canvas block whose JSON-serialised delta contains the
             literal characters "html" inside the content string).
             The previous indexOf-based check falsely routed those
             frames through the formattedHtml path, leaving `text`
             empty and the user staring at "response interrupted".
             Parse the JSON and look for an actual `html` property. */
          if(formattedHtml===null&&payload.indexOf("{")===0){
            try{
              var probe=JSON.parse(payload);
              if(probe&&typeof probe.html==="string"){
                formattedHtml=probe;
                semanticActivity=true;
                return;
              }
            }catch(_){}
          }
          /* Some upstreams send "event: error" frames; surface them. */
          try{
            var obj=JSON.parse(payload);
            if(obj.error){
              streamError=makeStreamError(typeof obj.error==="string"?obj.error:(obj.error.message||"upstream error"),obj.status,obj);
              return;
            }
            var delta=obj.choices&&obj.choices[0]&&obj.choices[0].delta&&obj.choices[0].delta.content;
            /* Reasoning field (DeepSeek R1 / QwQ / o1-style): some
               upstreams surface the chain-of-thought as a separate
               `reasoning_content` field on the delta. Route it to the
               thinking pill (if the caller subscribed). */
            var reasoning=obj.choices&&obj.choices[0]&&obj.choices[0].delta&&obj.choices[0].delta.reasoning_content;
            if(typeof reasoning==="string"&&reasoning.length>0){
              semanticActivity=true;
              if(typeof onThinking==="function"){
                try{onThinking(reasoning)}catch(_){}
              }
            }
            /* P_inline_think — split delta on <think>/</think> boundaries.
               The default built-in provider (M3) puts its chain-of-thought
               inside the content stream as inline <think>...</think>
               tags. We scan the accumulated delta (thinkTail + delta)
               for these tags and route only the content OUTSIDE the
               tags to onDelta. Inside-tag content goes to onThinking so
               the thinking pill lights up on every device, not just
               ones that happen to use DeepSeek-style reasoning_content. */
            if(typeof delta==="string"&&delta.length>0){
              semanticActivity=true;
              if(!thinkOpen){
                /* Not currently inside a think block. Look for the
                   opening tag. thinkTail holds any partial tag that
                   might be split between this chunk and the next. */
                var probe=thinkTail+delta;
                var openIdx=probe.indexOf("<think>");
                if(openIdx===-1){
                  /* No opening tag in sight. Flush probe-minus-tail
                     to onDelta and shrink tail to the last 7 chars
                     ("<think>" is 7 chars — anything shorter cannot
                     start a tag in the next chunk). */
                  var safeLen=Math.max(0,probe.length-7);
                  var safeStr=probe.slice(0,safeLen);
                  thinkTail=probe.slice(safeLen);
                  if(safeStr.length>0){
                    full+=safeStr;
                    try{if(onDelta){onDelta(safeStr,full)}}catch(deltaErr){
                      console.warn("[API stream] onDelta threw:",deltaErr&&deltaErr.message);
                    }
                  }
                }else{
                  /* Found <think>. Flush everything BEFORE it via
                     onDelta, then mark thinkOpen and start buffering
                     the content AFTER <think> for onThinking. */
                  var before=probe.slice(0,openIdx);
                  var afterOpen=probe.slice(openIdx+"<think>".length);
                  thinkTail="";
                  if(before.length>0){
                    full+=before;
                    try{if(onDelta){onDelta(before,full)}}catch(deltaErr){
                      console.warn("[API stream] onDelta threw:",deltaErr&&deltaErr.message);
                    }
                  }
                  thinkOpen=true;
                  thinkBuf="";
                  /* Now process the afterOpen tail through the
                     thinkOpen branch below by re-entering with
                     thinkOpen=true. We do that by appending
                     afterOpen to thinkBuf and falling through. */
                  delta=afterOpen;
                  /* Fall through to the thinkOpen block. */
                }
              }
              if(thinkOpen){
                /* Inside a think block. Scan for the closing tag,
                   flushing thinkBuf to onThinking in slices between
                   tags. */
                var probe2=thinkTail+delta;
                var closeIdx=probe2.indexOf("</think>");
                while(closeIdx!==-1){
                  var inside=probe2.slice(0,closeIdx);
                  thinkBuf+=inside;
                  if(thinkBuf.length>0&&typeof onThinking==="function"){
                    try{onThinking(thinkBuf)}catch(_){}
                  }
                  thinkBuf="";
                  thinkOpen=false;
                  /* Everything after </think> is normal content. */
                  var after=probe2.slice(closeIdx+"</think>".length);
                  /* Keep a 7-char tail in case <think> starts again
                     in the same chunk (unusual but possible). */
                  var keepLen=Math.min(after.length,7);
                  thinkTail=after.slice(after.length-keepLen);
                  var bodyStr=after.slice(0,after.length-keepLen);
                  if(bodyStr.length>0){
                    full+=bodyStr;
                    try{if(onDelta){onDelta(bodyStr,full)}}catch(deltaErr){
                      console.warn("[API stream] onDelta threw:",deltaErr&&deltaErr.message);
                    }
                  }
                  /* Check whether the remaining tail also opens a
                     new think block. If so, loop again. Otherwise
                     break. */
                  if(thinkTail.indexOf("<think>")!==-1||bodyStr.indexOf("<think>")!==-1){
                    /* Re-enter the outer if-block by appending tail+body
                       to a fresh probe. Simpler: just keep going. */
                    var remaining=thinkTail+bodyStr;
                    thinkTail="";
                    if(remaining.length>0){
                      /* Recurse into the "not in think" branch. */
                      var oi2=remaining.indexOf("<think>");
                      if(oi2===-1){
                        var sl2=Math.max(0,remaining.length-7);
                        var sf2=remaining.slice(0,sl2);
                        thinkTail=remaining.slice(sl2);
                        if(sf2.length>0){
                          full+=sf2;
                          try{if(onDelta){onDelta(sf2,full)}}catch(deltaErr){
                            console.warn("[API stream] onDelta threw:",deltaErr&&deltaErr.message);
                          }
                        }
                      }else{
                        var bf=remaining.slice(0,oi2);
                        var ao=remaining.slice(oi2+"<think>".length);
                        if(bf.length>0){
                          full+=bf;
                          try{if(onDelta){onDelta(bf,full)}}catch(deltaErr){
                            console.warn("[API stream] onDelta threw:",deltaErr&&deltaErr.message);
                          }
                        }
                        thinkOpen=true;
                        thinkBuf="";
                        delta=ao;
                        probe2=thinkTail+delta;
                        closeIdx=probe2.indexOf("</think>");
                        continue;
                      }
                    }
                  }
                  break;
                }
                if(thinkOpen){
                  /* No closing tag yet in this chunk. Buffer the
                     full probe into thinkBuf but keep a 7-char
                     tail in case </think> arrives split.
                     Flush thinkBuf to onThinking every ~200 chars
                     so the user sees live progress instead of
                     waiting for the full think block to close. */
                  thinkBuf+=probe2.slice(0,Math.max(0,probe2.length-7));
                  thinkTail=probe2.slice(Math.max(0,probe2.length-7));
                  if(typeof onThinking==="function"&&thinkBuf.length>=200){
                    try{onThinking(thinkBuf)}catch(_){}
                    thinkBuf="";
                  }
                }
              }
            }
            /* P_fix_think_warn — surface misconfigured callers. The
               main chat path passes onThinking to light up the
               thinking pill; if it is missing while we are clearly
               receiving reasoning content, warn once per stream so
               the bug shows up in the console without flooding it. */
            if(!hasWarnedMissingThinking&&typeof delta==="string"&&(thinkOpen||thinkBuf.length>0)&&typeof onThinking!=="function"){
              hasWarnedMissingThinking=true;
              try{console.warn("[API stream] inline <think> detected but caller did not provide onThinking; thinking pill will not light up. Pass an onThinking callback in callAPIStream(...,onThinking,opts).")}catch(_){}
            }
          }catch {
            /* Could be a final [DONE] or unknown frame; ignore unless the
               payload looks like a truncated JSON error event (has "error"
               as a JSON key, not just the word "error" in prose). */
            if((payload.indexOf('"error"')>=0||payload.indexOf("'error'")>=0)
               && /error|fail|unavailable/i.test(payload)){
              streamError=makeStreamError(payload.slice(0,200));
              return;
            }
          }
    };
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
        /* Keep framing identical to the native clients. Web-specific
           parsing remains inside processFrame for <think>, HTML, widgets,
           and tool-card rendering. */
        buf=consumeSseBuffer(buf,function(frame){
          if(!cancelled)processFrame(frame);
        });
        if(cancelled)break;
      }
      /* Clear heartbeat — stream ended naturally. */
      if(hbTmo){clearTimeout(hbTmo);hbTmo=null}
      /* P_tmo_cleanup — also clear the total-timeout watchdog on the
         happy path. Without this, `tmo` keeps a closure (capturing
         `ac`, the abort listener, and STREAM_TIMEOUT_MS) alive for
         up to the full budget AFTER the stream completed. Over many
         turns this pins the previous AbortController + Response
         state, increasing GC pressure and — on some browsers — the
         chance that a stale watchdog fires during the next call. */
      if(tmo){clearTimeout(tmo);tmo=null}
      /* P_reader_release — explicitly release the reader so the
         underlying HTTP/2 stream can be returned to the connection
         pool. Without this, the browser keeps the stream counted
         against its per-host concurrent-stream limit (Chrome 256,
         Firefox 100), and a long chat session can exhaust it. */
      try{reader.releaseLock()}catch(_){}
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
      /* P_inline_think — if the stream ended mid-think (e.g. truncated
         by max_tokens), flush whatever thinking content we accumulated
         so the user at least sees the partial reasoning rather than
         silently dropping it. */
      if(thinkOpen&&typeof onThinking==="function"){
        var remainingThink=thinkBuf+thinkTail;
        if(remainingThink.length>0){
          semanticActivity=true;
          try{onThinking(remainingThink)}catch(_){}
        }
        thinkBuf="";
        thinkTail="";
        thinkOpen=false;
      }else if(!thinkOpen&&thinkTail.length>0){
        /* P_truncation_fix — when the stream ends and we're NOT inside
           a think block, thinkTail holds up to 7 unflushed chars
           (held back so a split <think> across chunks would still be
           reassembled). With no think block to flush into, those chars
           are real response content that would otherwise be silently
           dropped — and they compound across every chunk, so a long
           non-thinking response can lose its last 7 chars. Forward
           them to full + onDelta so the saved message + UI bubble
           both contain the complete answer. */
        full+=thinkTail;
        try{if(onDelta){onDelta(thinkTail,full)}}catch(_){}
        thinkTail="";
      }
    }catch(e){
      console.error("[API stream] read error:",e);
      if(hbTmo){clearTimeout(hbTmo);hbTmo=null}
      if(e&&(e.name==="AbortError"||e.code===20)){
        var isHeartbeat=heartbeatFired;
        var attemptError=makeStreamError(isHeartbeat
          ?"stream stalled (no data for "+(STREAM_HEARTBEAT_MS/1000)+"s)"
          :"stream request timed out or was interrupted");
        attemptError.reason=ac.signal.reason;
        if(!isUserAbort(e,ac.signal)&&!isUserAbort(e,turnAbort.signal)
           &&!semanticActivity&&await waitForRetry(attempt,attemptError)){
          lastErr=attemptError;
          console.warn("[API stream]",attemptError.message+", retrying before visible output");
          try{await reader.cancel()}catch(_){}
          try{reader.releaseLock()}catch(_){}
          unbindAttempt();
          continue;
        }
        if(isHeartbeat&&semanticActivity){
          lastErr=attemptError.message+" after partial output; automatic replay suppressed";
        }
        /* User Stop click — return a cancelled result with whatever
           text already streamed, so the bubble cleans up silently
           instead of showing an error. */
        if(isUserAbort(e,ac.signal)||isUserAbort(e,turnAbort.signal)
           ||(!isHeartbeat&&!semanticActivity&&(!ac.signal.reason||ac.signal.reason==="user-stop"))){
          /* A named user stop is preferred. The no-reason fallback keeps
             compatibility with browsers that expose AbortError without the
             custom reason attached. */
          finishTurn();
          return {text:full||"",html:formattedHtml&&formattedHtml.html||null,widgets:formattedHtml&&formattedHtml.widgets||[],cancelled:true};
        }
        setLastCallError(lastErr||attemptError.message);
      }else{
        setLastCallError(String(e&&e.message||e));
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
    try{resp.body&&resp.body.cancel&&resp.body.cancel().catch(function(){})}catch(_){}
    resp=null;
    reader=null;
    if(streamError){
      if(!semanticActivity&&await waitForRetry(attempt,streamError)){
        lastErr=streamError;
        unbindAttempt();
        continue;
      }
      if(retryWasCancelled()){
        finishTurn();
        return {text:"",html:null,widgets:[],cancelled:true};
      }
      setLastCallError(streamError.message||'stream request failed');
      finishTurn();
      return null;
    }
    /* Empty stream — server returned 200 but no body. Treat as
       retriable (rare, but happens on flaky upstreams).
       P_silence_fix — preserve any real error already captured from
       event:error SSE frames instead of overwriting with generic
       "empty stream". Without this, the user always sees
       "response interrupted: empty stream" even when the real
       cause was "LLM stream stalled: no data for 60s". */
    if(!gotAnyData&&!full&&!formattedHtml){
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
    if(!full&&!formattedHtml){
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
       a closure that pins this call's AbortController for the
       remaining watchdog window. */
    finishTurn();
    return {text:full,html:formattedHtml&&formattedHtml.html||null,widgets:formattedHtml&&formattedHtml.widgets||[],cancelled:false};
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
