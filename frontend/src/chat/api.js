/* ── Chat LLM API helpers ──
   Non-streaming LLM call (callAPIChat) extracted from main.js.
   Used for round-1 tool-detection probes where we need the full
   response accumulated but NOT rendered live.
   Streaming logic remains in main.js's addStreamingMessage (deferred
   to a dedicated refactor PR — touches _activeChatCtl/_activeChatAbort
   window globals + ~750 lines of streaming state). */

import { apiFetchRaw } from '../util/api.js';
import { stateStore } from '../state/store.js';
import {
  AI_MAX_ATTEMPTS,
  AI_MAX_RETRIES,
  isUserAbort,
  waitForAIRetry,
} from './retryPolicy.ts';

import { isMiniMaxProvider } from '../config/providers.js';
import { getStoredResponseSpeed } from '../config/chatPreferences.ts';
import { notifySpeedFallbackOnce } from './speedFallback.js';

function setLastCallError(value) {
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: value });
}

function makeAIError(message, status, body) {
  var error = new Error(String(message || 'model request failed'));
  if (status != null) error.status = Number(status);
  if (body != null) error.body = body;
  if (body && body.code) error.code = body.code;
  return error;
}

function errorMessage(error, fallback) {
  return String(error && error.message || error || fallback || 'model request failed');
}

function monthlyLimitMessage(error) {
  var body = error && error.body;
  var code = String(error && error.code || body && body.code || '').toUpperCase();
  if (code !== 'MONTHLY_LIMIT') return '';
  return 'Monthly Beagle usage limit reached. '
    + String(body && body.message || 'Upgrade your plan or wait until next month.');
}

function bindAbortSignal(parent, child) {
  if (!parent) return function () {};
  var onAbort = function () {
    try { child.abort(parent.reason || 'aborted'); } catch (_) {}
  };
  if (parent.aborted) onAbort();
  else parent.addEventListener('abort', onAbort, { once: true });
  return function () { try { parent.removeEventListener('abort', onAbort); } catch (_) {} };
}

async function waitForRetry(attempt, error, options) {
  try { return await waitForAIRetry(attempt, error, options); }
  catch (abortError) {
    if (isUserAbort(abortError, options && options.signal)) return false;
    throw abortError;
  }
}

/* Local copy of the Retry-After formatter — chat/stream.js has the same
   helper but extracting it to a shared util for two callsites is more
   weight than it's worth. Keep them in sync if you change one. The two
   callers use the formatter in different places (sync non-stream error
   surfacing vs. streaming 429 toasts), so unifying them is a future
   refactor rather than a current necessity. */
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
    mode: window.appMode === "tutor" ? "tutor" : "chat",
    response_speed: getStoredResponseSpeed()
  };
  /* P_codex-session-context — the unified workspace agent must be able to
     bind its durable run to the same Socrates session and selected project
     as the ordinary turn. These are context selectors only; the server
     re-checks ownership and chooses the real workspace/policy. */
  try {
    var activeSessionId = stateStore.read('currentSessionId') || null;
    var activeProjectId = stateStore.read('currentProjectId') || null;
    if (activeSessionId) body.sessionId = activeSessionId;
    if (activeProjectId) body.projectId = activeProjectId;
    /* P_rag-context — opt the turn into session-scoped RAG recall.
       The server owner-checks the session, retrieves against the
       chunk index, and injects the hits as an untrusted context
       block. An empty session index degrades to no injection. */
    if (activeSessionId) body.ragSessionId = activeSessionId;
  } catch (_) { /* keep request compatible with isolated test harnesses */ }

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
    if (typeof isMiniMaxProvider === "function" && isMiniMaxProvider()) {
      body.extra_body = { reasoning_split: true };
    }
  }
  return body;
}

/* Non-streaming variant of callAPIStream for round-1 detection.
   Returns the same {text,html,widgets,cancelled} shape (or null on failure).
   Reuses the streaming call but accumulates without rendering. */
export async function callAPIChat(messages,maxTokens,options){
  /* Non-streaming probe calls share the same six-attempt policy as the
     visible chat stream. A probe never exposes partial text, so each
     attempt accumulates into a private buffer and is committed only after
     a complete response. No client-side deadline: the probe may wait as
     long as the model needs to think. */
  var getActiveProvider=window.getActiveProvider;
  var retryOptions=Object.assign({},options||{}, { source:'probe' });
  if(!getActiveProvider()){setLastCallError("no provider");return null}
  setLastCallError(null);
  var maxAttempts=(retryOptions.maxRetries==null?AI_MAX_RETRIES:Math.max(0,retryOptions.maxRetries))+1;
  var lastErr=null;

  for(var attempt=1;attempt<=maxAttempts;attempt++){
    var ac=new AbortController();
    var unbind=bindAbortSignal(retryOptions.signal,ac);
    var reader=null;
    var full="";
    var semanticActivity=false;
    var streamError=null;
    try{
      var response=await apiFetchRaw("/api/chat/stream",{
        method:"POST",
        body:buildChatRequestBody(messages,maxTokens,0.2),
        signal:ac.signal
      });
      if(!response.body||!response.body.getReader){
        throw makeAIError('no stream body');
      }
      reader=response.body.getReader();
      var decoder=new TextDecoder("utf-8");
      var buf="";
      var processFrame=function(frame){
        var lines=frame.split(/\r?\n/);
        var data=[];
        var eventName='';
        for(var i=0;i<lines.length;i++){
          if(lines[i].indexOf('event:')===0) eventName=lines[i].slice(6).trim();
          if(lines[i].indexOf('data:')===0) data.push(lines[i].slice(5).trim());
        }
        if(eventName==='error'&&data.length){
          var payload=data.join('\n');
          try{
            var errorData=JSON.parse(payload);
            streamError=makeAIError(errorData.error||errorData.message||payload,errorData.status,errorData);
          }catch(_){ streamError=makeAIError(payload); }
          return;
        }
        if(eventName==='tool_use'||eventName==='tool_result'||eventName==='tool_progress'||eventName==='execution_start'||eventName==='tool_call_delta'||eventName==='agent_step'||eventName==='agent_plan'){
          semanticActivity=true;
          return;
        }
        for(var j=0;j<data.length;j++){
          var raw=data[j];
          if(!raw||raw==='[DONE]')continue;
          try{
            var obj=JSON.parse(raw);
            if(obj&&obj.error){
              streamError=makeAIError(typeof obj.error==='string'?obj.error:(obj.error.message||'upstream error'),obj.status,obj);
              continue;
            }
            var choice=obj&&obj.choices&&obj.choices[0];
            var delta=choice&&choice.delta;
            var content=delta&&delta.content;
            var reasoning=delta&&delta.reasoning_content;
            if(typeof content==='string'&&content){full+=content;semanticActivity=true;}
            if(typeof reasoning==='string'&&reasoning){semanticActivity=true;}
          }catch(_){
            /* Ignore keep-alive/unknown frames; a response with no usable
               payload is handled as a retryable malformed response below. */
          }
        }
      };
      while(true){
        var step=await reader.read();
        if(step.done)break;
        buf+=decoder.decode(step.value,{stream:true});
        var split;
        while((split=buf.indexOf('\n\n'))>=0){
          processFrame(buf.slice(0,split));
          buf=buf.slice(split+2);
        }
      }
      buf+=decoder.decode();
      if(buf&&buf.indexOf('data:')>=0)processFrame(buf);
      try{reader.releaseLock()}catch(_){}
      reader=null;
      if(streamError){
        lastErr=streamError;
        if(!semanticActivity&&await waitForRetry(attempt,streamError,retryOptions))continue;
        throw streamError;
      }
      if(!full){
        lastErr=makeAIError('empty or malformed stream');
        if(!semanticActivity&&await waitForRetry(attempt,lastErr,retryOptions))continue;
        throw lastErr;
      }
      return{text:full,html:null,widgets:[],cancelled:false};
    }catch(e){
      lastErr=e;
      if(isUserAbort(e,retryOptions.signal)||isUserAbort(e,ac.signal)){
        setLastCallError('request cancelled');
        return null;
      }
      if(!semanticActivity&&await waitForRetry(attempt,e,retryOptions))continue;
      setLastCallError(errorMessage(e,'probe request failed'));
      return null;
    }finally{
      unbind();
      try{if(reader)await reader.cancel()}catch(_){}
    }
  }
  setLastCallError(errorMessage(lastErr,'probe request failed'));
  return null;
}

/* Main non-streaming chat API call. Routes to either:
   - /api/minimax/v1/chat/completions for built-in Beagle (server can't route there)
   - /api/chat for non-built-in providers
   Both paths use the same retry pattern, and neither imposes a
   client-side deadline: a reasoning model may think for as long as it
   needs. Only a user stop / session switch (options.signal) or a
   transport error ends a request. */
export async function callAPI(messages,maxTokens,options){
  /* getActiveProvider / apiFetch live on window so this module stays
     independent. CSRF/credentials go through apiFetchRaw, so no direct
     getCsrfToken read is needed. */
  var getActiveProvider=window.getActiveProvider;
  var apiFetch=window.apiFetch;
  var retryOptions=Object.assign({},options||{}, { source:(options&&options.source)||'chat' });

  var provider=getActiveProvider();
  if(!provider){
    setLastCallError("no provider");
    return null; /* fall back to mock */
  }
  setLastCallError(null);
  /* Built-in identity + custom-instructions prepending is handled centrally
    inside buildChatRequestBody, so the built-in branch here only has to
    deal with the direct MiniMax API hop (the proxy can't route to it). */
  if(provider.isBuiltIn){
    var beagleBody=buildChatRequestBody(messages,maxTokens,0.7);
    var beagleRequestedSpeed=beagleBody.response_speed;
    /* Reasoning models (MiniMax-M2.7, DeepSeek R1, QwQ) regularly
       take 2-4 minutes to think before producing the answer. The
       previous 90s hard timeout cut off the call mid-think and the
       caller fell back to mock — visible to the user as a sudden
       truncation. Use the same total budget and five fixed-delay
       retries as the streaming path so a slow first attempt has a
       chance to recover. */
    var BEAGLE_NONSTREAM_MAX=(retryOptions.maxRetries==null?AI_MAX_ATTEMPTS:Math.max(0,retryOptions.maxRetries)+1);
    var beagleAttempt=0;
    var lastBeagleErr=null;
    while(beagleAttempt<BEAGLE_NONSTREAM_MAX){
      beagleAttempt++;
      var beagleAc=new AbortController();
      var unbindBeagle=bindAbortSignal(retryOptions.signal,beagleAc);
      try{
        /* Route through apiFetchRaw so the call gets the shared
           credentials/CSRF/401-hook/403-refresh behaviour instead of a
           hand-rolled fetch that can send an empty X-CSRF-Token and
           bypass the auth hooks. apiFetchRaw attaches X-CSRF-Token only
           when the cookie exists and replays once after a CSRF refresh. */
        var resp=await apiFetchRaw("/api/v2/minimax/v1/chat/completions",{
          method:"POST",
          headers:{"Content-Type":"application/json","Authorization":"Bearer "+provider.key},
          body:JSON.stringify(beagleBody),
          signal:beagleAc.signal
        });
        /* Chrome's fetch implementation propagates signal.abort() to the
           underlying response body stream, so read the body as text
           before any abort is possible and parse it afterwards. */
        var respText="";
        try{respText=await resp.text()}catch(_){}
        if(!resp.ok){
          var beagleBody=null;
          try{beagleBody=JSON.parse(respText)}catch(_){}
          lastBeagleErr=makeAIError(resp.status+" "+(respText||"").slice(0,200),resp.status,beagleBody);
          var beagleQuota=monthlyLimitMessage(lastBeagleErr);
          if(beagleQuota){setLastCallError(beagleQuota);return null;}
          if(await waitForRetry(beagleAttempt,lastBeagleErr,retryOptions))continue;
          setLastCallError(errorMessage(lastBeagleErr,'Beagle request failed'));
          return null;
        }
        var json=null;
        try{json=JSON.parse(respText)}catch(_){}
        if(!json||!json.choices||!json.choices[0]||!json.choices[0].message||typeof json.choices[0].message.content!=='string'){
          lastBeagleErr=makeAIError("malformed response");
          if(await waitForRetry(beagleAttempt,lastBeagleErr,retryOptions))continue;
          setLastCallError(errorMessage(lastBeagleErr,'malformed response'));
          return null;
        }
        if(json.meta&&json.meta.response_speed_applied==="standard"&&beagleRequestedSpeed==="fast")notifySpeedFallbackOnce();
        return json.choices[0].message.content;
      }catch(e){
        var acReason=String(beagleAc.signal.reason||"");
        var isAbort=(e&&(e.name==="AbortError"||e.code===20));
        var beagleMessage=isAbort
          ?(isUserAbort(e,beagleAc.signal)?"request cancelled":"request interrupted")
          :String(e&&e.message||e);
      lastBeagleErr=makeAIError(beagleMessage,e&&e.status,e&&e.body);
      lastBeagleErr.code=e&&e.code;
      lastBeagleErr.reason=acReason;
      var caughtBeagleQuota=monthlyLimitMessage(lastBeagleErr);
      if(caughtBeagleQuota){setLastCallError(caughtBeagleQuota);return null;}
      var userCancelled=isUserAbort(e,retryOptions.signal)
          ||isUserAbort(e,beagleAc.signal);
        if(!userCancelled&&await waitForRetry(beagleAttempt,lastBeagleErr,retryOptions))continue;
        setLastCallError(errorMessage(lastBeagleErr,'Beagle request failed'));
        return null;
      }finally{
        unbindBeagle();
      }
    }
    setLastCallError(lastBeagleErr||"Beagle non-stream request failed");
    return null;
  }
  /* Non-built-in provider: same retry logic, no client-side deadline. */
  var NONSTREAM_MAX=(retryOptions.maxRetries==null?AI_MAX_ATTEMPTS:Math.max(0,retryOptions.maxRetries)+1);
  var nsAttempt=0;
  var lastNsErr=null;
  while(nsAttempt<NONSTREAM_MAX){
    nsAttempt++;
    var nsAc=new AbortController();
    var unbindNonBuiltin=bindAbortSignal(retryOptions.signal,nsAc);
    try{
      var nsBody=buildChatRequestBody(messages,maxTokens,0.7);
      var nsRequestedSpeed=nsBody.response_speed;
      var resp=await apiFetch("/api/chat",{method:"POST",body:nsBody,signal:nsAc.signal});
      if(!resp||typeof resp.content!=="string"){
        lastNsErr=makeAIError("malformed response");
        if(await waitForRetry(nsAttempt,lastNsErr,retryOptions))continue;
        setLastCallError(errorMessage(lastNsErr,'malformed response'));
        return null;
      }
      if(resp.meta&&resp.meta.response_speed_applied==="standard"&&nsRequestedSpeed==="fast")notifySpeedFallbackOnce();
      return resp.content;
    }catch(e){
      var nsReason=String(nsAc.signal.reason||"");
      var isAbortN=(e&&(e.name==="AbortError"||nsAc.signal.aborted));
      var eStatus=e&&e.status;
      var nsMessage=isAbortN
        ?(isUserAbort(e,nsAc.signal)?"request cancelled":"request interrupted")
        :(eStatus?eStatus+" ":"network: ")+(e&&e.message||e);
      lastNsErr=makeAIError(nsMessage,eStatus,e&&e.body);
      lastNsErr.code=e&&e.code;
      lastNsErr.reason=nsReason;
      var caughtNsQuota=monthlyLimitMessage(lastNsErr);
      if(caughtNsQuota){setLastCallError(caughtNsQuota);return null;}
      var userCancelledN=isUserAbort(e,retryOptions.signal)
        ||isUserAbort(e,nsAc.signal);
      if(!userCancelledN&&await waitForRetry(nsAttempt,lastNsErr,retryOptions))continue;
      console.error("[API] call failed:",e);
      setLastCallError(errorMessage(lastNsErr,'non-stream request failed'));
      return null;
    }finally{
      unbindNonBuiltin();
    }
  }
  setLastCallError(errorMessage(lastNsErr,'non-stream request failed'));
  return null;
}
