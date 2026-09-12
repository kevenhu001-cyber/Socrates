/* chat/streamingTurn.js — streaming turn factory (addStreamingMessage).
 * React owns the bubble: prose paints from `rawText`, tool rows from
 * `toolCalls[].textOffset`, and the turn chrome from `_liveStatus`.
 * This module owns the data those render from (full/fullReasoning,
 * status stamps, tool runtime wiring), plus session guards, viewport
 * anchoring, persistence (save/session stats) and retry/resend.
 * It never paints message content itself.
 */
import { stateStore } from '../state/store.js';
import { getActiveProvider } from '../pickers.js';
import { turnState, streamRetryViewport } from './turnState.js';
import { quietTurn, markTurnInProgress, markTurnEnded, resendLastUserMessage, setChatStopState } from './turnUi.js';
import { claimLiveRetry, registerLiveTurnRuntime, claimLiveSearchRetry } from './liveTurn.js';
import { generateId } from '../util/ids.js';
import { hideNewReplyPill } from '../ui/scrollPill.js';
import { isMsgListMounted } from '../react/message-list/MessageList.tsx';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { combineThinkingText, extractThinkText } from './thinkExtract.ts';
import {
  publishThinkingPanelEvent,
  setReactLiveStatus,
  updateMessageSnapshot,
} from '../ui/messageSnapshot.js';
import { createStreamScheduler } from '../render/streamScheduler.js';
import { scheduleActiveTurnToTop, removeSupersededStub } from './turnAnchor.ts';
import { createToolRuntime } from './toolRuntime.js';
import { esc } from '../render/helpers.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { findInlineToolBoundary } from '../render/streaming.js';
import { formatMsgProgressive } from '../render/markdown.js';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { appendLocalMemory } from '../storage/localMemory.js';
import { scrollContainer, isPinnedToBottom } from '../ui/scroll.js';
import { saveCurrentSession } from '../session/persistence.js';
import { updateChatStats } from './stats.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
}
function _appMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (_) {}
  return 'chat';
}

export function addStreamingMessage(opts){
  opts=opts||{};
  var onRetry=opts.onRetry;
  void onRetry; /* referenced by the retry-button wiring further down
    (replaceWithError closure); the unused-var guard would otherwise
    flag the assignment because the closure captures it via typeof. */
  var retryViewport=streamRetryViewport.consumeViewport();
  /* P1.4 — a new bubble starts with the user "at bottom" again.
     Suppress the pill for this stream and let the scroll listener
     re-enable it only if the user moves away during streaming. */
  stateStore.dispatch({type:"state/set",key:"_userScrolledAway",value:false});
  hideNewReplyPill();
  var list=document.getElementById("msgList");
  /* P_react-live-turn — captured once for this turn: the runtime cannot be
     released mid-stream without the session (and this bubble) going away, and
     a value that flipped halfway through would leave the answer rendered by
     neither surface. */
  var reactLive=isMsgListMounted();
  /* The bubble is mounted by React from the streaming entry below. This
     detached shell is never inserted into the document; it only carries
     the clientId for viewport anchoring (scheduleActiveTurnToTop falls
     back to it when the message entry is not yet readable). */
  var div=document.createElement("div");
  div.className="msg assistant";
  div.style.contentVisibility="visible";
  var body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  /* P1.1/P1.2 — push a placeholder into the authoritative
     stateStore.read("messages") list. While streaming, `rawText` is updated on
     every delta and `html` is set to null. At finish() time we
     do a single formatMsg pass and write `html`. The DOM bubble
     is the rendered view, not the source. */
  var clientId="msg-"+generateId();
  div.dataset.clientId=clientId;
  /* P_message-usage — carry the active model onto the live entry so the
     finalized turn's usage footer can name it. addMessage() does the
     same for non-streaming assistant rows. */
  var _modelInfo=null;
  try{
    var _mp=getActiveProvider();
    if(_mp)_modelInfo={label:_mp.label||_mp.model||'',model:_mp.model||''};
  }catch(_){}
  var msgIdx=stateStore.dispatch({type:"session/append-message",payload:{
    clientId:clientId,
    role:"assistant",
    rawText:"",
    html:null,
    type:"streaming",
    actions:null,
    modelInfo:_modelInfo
  }});
  publishReactChatRuntime({type:"stream-started",messageId:clientId});
  var full="";
  /* P_message-usage — turn timing for the finalized usage footer:
     startedAt is stamped before any network work, firstTokenAt when the
     first content delta lands (TTFT), and the usage event supplies the
     server's token totals right before [DONE]. */
  var startedAt=Date.now();
  var firstTokenAt=0;
  var turnUsage=null;
  /* P_reasoning-persist — accumulate reasoning_content deltas so we
     can save them to stateStore.read("messages") at finish() and include them in
     the session-save payload. Without this, chain-of-thought text
     from DeepSeek / QwQ / o1-style models is rendered in the DOM
     during streaming but lost on reload. */
  var fullReasoning="";
  var finished=false;
  /* P_thinking-panel — the right drawer shows both reasoning_content
     deltas and inline <think> blocks. These helpers keep the panel's
     text snapshot in sync with the live stream without slowing the
     markdown renderer (the bridge throttles + dedupes commits). */
  function _extractThinkText(raw){
    return extractThinkText(raw);
  }
  function _combinedThinkingText(){
    return combineThinkingText(fullReasoning, full);
  }
  function _publishThinkingPanelLive(){
    try{
      var bridge=window.__socratesThinkingPanelBridge;
      if(bridge&&typeof bridge.publishThinkingDelta==="function"){
        bridge.publishThinkingDelta(clientId,_combinedThinkingText());
      }
    }catch(_){}
  }
  function _publishThinkingPanelEnd(){
    publishThinkingPanelEvent({type:"thinking-end",messageId:clientId});
  }
  function _publishThinkingPanelStart(){
    publishThinkingPanelEvent({type:"thinking-start",messageId:clientId});
  }
  /* P_session-stream-dispose — when resetApp() or loadSession() aborts
     an in-flight stream, already-queued delta chunks from the response
     body can still reach append()/finish() callbacks via stream.js's
     ReadableStream reader (AbortController only aborts the fetch, not
     chunks already buffered in the reader's queue). Without this flag,
     those stale callbacks would write `stateStore.read("messages")[msgIdx].rawText =
     full` into whatever object now sits at the same numeric index in
     the cleared/replaced array — polluting the new session's slot
     ("会话串台": AI answers based on the previous session's content).

     abort() and finish() flip this to true; every public entry point
     and every `stateStore.read("messages")[msgIdx]` write site checks it before
     touching state. _disposed is sticky (no resurrection) so even if
     abort races with a late finish callback, the writes stay inert. */
  var _disposed=false;
  /* P_session-cross-talk — capture the session identity at the moment
     this streaming bubble is created (synchronously, before any await).
     All async callbacks (onDelta / onThinking / doRender / finish /
     recordToolUse ...) hold this closure; if the user switches sessions
     mid-stream, stateStore.read("currentSessionId") flips to the new session
     while the old stream's reader is still draining its SSE buffer.
     _disposed blocks most late writes, but abort() and the natural
     [DONE] frame can race: a finish() that already passed its _disposed
     check, or an abort()'s splice, can still land on stateStore.read("messages")[msgIdx]
     — and msgIdx is a numeric index that the new session may now reuse
     for a different message. stillOwnsSlot() verifies BOTH that we're
     still on the same session AND that the slot at msgIdx still holds
     OUR placeholder (by clientId), so no cross-session pollution is
     possible even in the race window. */
  var ownerSessionId=stateStore.read("currentSessionId")||null;
  function ownsMessageSlot(){
    if(stateStore.read("currentSessionId")!==ownerSessionId)return false;
    if(msgIdx<0||!stateStore.read("messages")[msgIdx])return false;
    if(stateStore.read("messages")[msgIdx].clientId!==clientId)return false;
    return true;
  }
  function stillOwnsSlot(){
    if(_disposed||finished)return false;
    return ownsMessageSlot();
  }
  function patchOwnedMessage(patch,deferNotify){
    if(!ownsMessageSlot())return null;
    return stateStore.dispatch({
      type:"session/update-message",index:msgIdx,clientId:clientId,
      patch:patch,deferNotify:deferNotify===true
    });
  }
  var pendingRender=null;
  var pendingRenderTimer=null;
  function cancelScheduledRender(){
    if(pendingRender){cancelAnimationFrame(pendingRender);pendingRender=null}
    if(pendingRenderTimer){clearTimeout(pendingRenderTimer);pendingRenderTimer=null}
    /* Task 2.4 — clear the coalescing scheduler's internal "scheduled"
       latch too, so a frame cancelled here doesn't leave the scheduler
       believing a flush is still pending (which would drop the next
       push). Guarded because cancelScheduledRender() can run during the
       first delta before _streamScheduler is assigned. */
    if(typeof _streamScheduler!=="undefined"&&_streamScheduler){_streamScheduler.dispose()}
  }
  /* Thinking pill (for chat-mode reasoning_content). Data-only: the status
     line is written to `message._liveStatus` and drawn by TurnStatus. */
  var thinkCtl=null;
  var suppressedThinkCtl={append:function(){},finalize:function(){},remove:function(){}};
  /* The React surface of the same controller: every mutation is a write to
     `message._liveStatus`, never a node. TurnStatus draws it. */
  var reactThinkCtl={
    append:function(){},
    finalize:function(){clearLiveStatus()},
    remove:function(){clearLiveStatus()},
    setLabel:function(text,state){
      if(statusIsBusy())return;
      setLiveStatus({phase:"thinking",label:String(text||""),
        state:state||"",clickable:_appMode()==="chat"});
    }
  };
  function hideThinkCtl(){
    if(thinkCtl&&typeof thinkCtl.remove==="function"){
      try{thinkCtl.remove()}catch(_){/* status may already be detached */}
    }
    thinkCtl=null;
  }
  /* P_declarative-tool-run — where in `full` the answer was when each tool_use
     landed. inlineToolRows is the {id,name,offset} ledger finish() stamps
     onto toolCalls[] as `textOffset`, which is the sole input react/tool-run
     needs to lay the rows out. */
  var segBase=0;
  var inlineToolRows=[];
  function ensureThinkCtl(){
    /* Tool activity owns the single live status line. Keep the reasoning
       buffer in memory, but do not mount a second loading indicator while
       a tool is running. The next reasoning delta after all tools
       settle can create the pill again. */
    if(toolRuntime&&typeof toolRuntime.hasActiveTools==="function"&&toolRuntime.hasActiveTools()){
      return suppressedThinkCtl;
    }
    /* The status line is data drawn by TurnStatus — there is no pill DOM. */
    thinkCtl=reactThinkCtl;
    stampThinking();
    return reactThinkCtl;
  }
  /* Unique ID for the retry button so we can attach a click handler after
     setting innerHTML (innerHTML wipes previous listeners). */
  var retryBtnId="retry-"+Math.random().toString(36).slice(2,10);
  /* The waiting line is data drawn by TurnStatus. stampWaiting(0) paints
     the first frame immediately so a fast first delta still had a visible
     predecessor state in the status history. There is deliberately no
     first-delta watchdog: a reasoning model may think for as long as it
     needs, so the waiting line stays up until real content arrives or the
     user stops the turn. */
  stampWaiting(0);
  scheduleActiveTurnToTop(list,div,msgIdx,retryViewport);
  /* Morph the send button into a red Stop so the user can abort
     the stream. setChatStopState(false) on finish/abort. */
  turnState.chatStreaming=true;
  try{setChatStopState(true)}catch(_){}
  /* Task 4.1 — record turn-in-progress + Resend target (latest user msg). */
  try{markTurnInProgress()}catch(_){}
  var thinkStarted=Date.now();
  /* Phase-based reassurance keeps the status line visibly alive without a
     twitchy elapsed-seconds counter that can read like a stalled request. */
  var _elapsedTick=null;
  _elapsedTick=setInterval(function(){
    if(finished||!firstDelta)return;
    stampWaiting(Math.round((Date.now()-thinkStarted)/1000));
  },1000);

  /* Follow the answer as it grows, unless the reader said otherwise. React
     paints the text in its own commit off the delta publish, which can land
     a frame or two AFTER this pass measured. A pinned reader would
     then sit looking at a gap that only closes on the next delta. So keep
     chasing the bottom for a few frames; each write is a no-op once the view
     is already there, and the scroll-away flag (set synchronously by the
     listener) breaks the chain the moment the reader takes over. */
  /* P_zero-delay — scrollTop writing used to live here, but it
     conflicted with chat/turnAnchor.ts's send-time anchor (single
     owner). turnAnchor reserves leading space for the active turn
     and re-converges the viewport on layout settle, so the streaming
     turn itself never needs to write scrollTop mid-stream. The
     `_userScrolledAway` flag still flips the new-reply pill via
     scrollPill.js. */

 function doRender(){
    pendingRender=null;
    /* P_session-stream-dispose — rAF guard. cancelAnimationFrame in
       abort()/finish() usually wins, but a doRender body may already
       be running on this very tick. Bail before touching stateStore.read("messages"). */
    if(finished||_disposed)return;

    /* AssistantTurn paints this turn's prose from `rawText`, so this
       pass only mirrors the data and keeps the thinking panel fed.
       Viewport position is owned by chat/turnAnchor.ts. */
    if(stillOwnsSlot()){
      patchOwnedMessage({rawText:full},true);
    }
    if(fullReasoning||_extractThinkText(full)){
      _publishThinkingPanelLive();
    }
  }
  /* Steady-state coalescing: push(delta) accumulates network deltas and
     rAF-gates a single coalesced doRender() paint. The scheduler's rAF
     seam is bound to the shared `pendingRender` slot so
     cancelScheduledRender() teardown cancels a scheduler-queued frame
     as before. */
  var _streamScheduler=createStreamScheduler(
    function(){doRender()},
    function(){return performance.now()},
    function(cb){pendingRender=requestAnimationFrame(cb)}
  );

  /* First delta renders immediately so the user sees content right away */
  var firstDelta=true;

  /* P_tool_retry_button — Retry buttons on failed inline tool rows
     dispatch a `tool-retry` CustomEvent (toolInline.ts). The delegated
     listener below routes to this handler. Falls back to window scope
     for share/history replay. */
  var _onSearchRetry=function(query){
    const text=String(query||'').trim();
    if(!text)return;
    const retryText='Please retry the search: '+text;
    if(typeof window.addMessage==='function'){
      window.addMessage('user',retryText);
    }
    if(typeof window.askChatTurn==='function'){
      quietTurn(window.askChatTurn(retryText));
    }
  };

  /* ── The live turn's chrome, as data ─────────────────────────────
     The waiting dot, the reasoning pill, the retry notice and the timeout
     error block collapse into one field — `message._liveStatus` — and
     react/tool-run/TurnStatus is the only thing that draws it, so a
     turn cannot show two "working on it" lines. */
  var _pinWanted=true;
  var _waitingLabel=_appMode()==="chat"?_t("think.thinking"):_t("common.generating");
  function liveMessage(){
    return (msgIdx>=0&&stateStore.read("messages")[msgIdx]&&
      stateStore.read("messages")[msgIdx].clientId===clientId)?stateStore.read("messages")[msgIdx]:null;
  }
  function setLiveStatus(status){
    var msg=liveMessage();
    if(msg)setReactLiveStatus(msg,status);
  }
  /* A status line never overwrites a failure or a retry notice, and the
     waiting dot gives up as soon as the turn has real content.
     P_tool-order-defer — tool-running is busy too: while a tool row is
     deferred behind an unfinished sentence, thinking/waiting stamps must
     not overwrite its line (the row itself isn't mounted yet, so this
     line is the only visible proof of work). */
  function statusIsBusy(){
    var msg=liveMessage();
    var prev=msg&&msg._liveStatus;
    return !!(prev&&(prev.phase==="error"||prev.phase==="retrying"||prev.phase==="tool-running"));
  }
  function clearLiveStatus(){
    if(!statusIsBusy())setLiveStatus(null);
  }
  function waitingCopyFor(sec){
    if(sec>=45)return _t("think.stillWorking");
    if(sec>=20)return _t("think.organizingAnswer");
    if(sec>=8)return _t("think.reviewingContext");
    return _waitingLabel;
  }
  function stampWaiting(sec){
    if(!reactLive||statusIsBusy())return;
    /* Reasoning owns the line once it starts. Reasoning deltas re-stamp
       phase "thinking" on every chunk; the 1s elapsed tick would otherwise
       flip the pill back to the waiting shape between deltas. The two
       shapes have different margins/padding, so the label visibly jumped
       for the whole reasoning phase. One-way rule: waiting may not
       overwrite a thinking line — only content (append/tool activity)
       retires it. */
    var _owner=liveMessage();
    var _prev=_owner&&_owner._liveStatus;
    if(_prev&&_prev.phase==="thinking")return;
    /* The elapsed cue is quantized to 5s steps so the pill's width only
       changes rarely and predictably, instead of ticking every second. */
    var _elapsedQ=sec>=12?Math.max(10,Math.floor(sec/5)*5):undefined;
    setLiveStatus({phase:"waiting",label:waitingCopyFor(sec),mode:_appMode(),
      clickable:_appMode()==="chat",elapsedSec:_elapsedQ});
  }
  function stampThinking(){
    if(!reactLive||statusIsBusy())return;
    setLiveStatus({phase:"thinking",label:_t("think.thinking"),
      clickable:_appMode()==="chat"});
  }
  /* React commits the growth in its own rAF, which runs before doRender's
     scroll pass — so "was the reader at the bottom?" has to be answered when
     the delta arrives, not after the DOM already grew. */
  function noteStreamGrowth(){
    if(!reactLive)return;
    var sc=list||scrollContainer();
    if(!sc)return;
    _pinWanted=isPinnedToBottom(
      sc.scrollHeight-sc.scrollTop-sc.clientHeight,96)&&!stateStore.read("_userScrolledAway");
  }

  var toolRuntime=createToolRuntime({
    body:body,
    ownsLiveTurn:function(){return reactLive},
    stillOwnsSlot:stillOwnsSlot,
    getMessage:function(){
      return msgIdx>=0?(stateStore.read("messages")[msgIdx]||null):null;
    },
    /* P_declarative-tool-run — a tool_use landed: record where in `full` the
       answer was, and let the renderer draw the row from that offset.
       `findInlineToolBoundary` rewinds to the last completed paragraph so a
       call that fires mid-sentence never splits it, and segBase always
       advances, which is what keeps two calls firing in the same instant from
       claiming the same offset (buildTurnLayout would drop the duplicate row). */
    onInlineTool:function(entry,_row){
      var _roff=findInlineToolBoundary(full,segBase);
      if(_roff<segBase)_roff=segBase;
      segBase=_roff;
      inlineToolRows.push({id:entry.id,name:entry.name,offset:_roff});
      noteStreamGrowth();
      /* P_tool-textoffset — return the split point so the tool runtime
         can persist it on synthetic rows created from a late tool_result
         (those never pass through the finish() write-back above). */
      return _roff;
    },
    onToolActivity:function(){
      /* P_tool-order-defer — the row may be deferred behind an unfinished
         sentence (it mounts once the sentence completes). Until then this
         status line is the only visible proof of work; AssistantTurn hides
         it again the moment the real row mounts, so the two never appear
         together. Never overwrite a failure or retry notice. */
      noteStreamGrowth();
      var _cur=liveMessage()&&liveMessage()._liveStatus;
      if(!_cur||(_cur.phase!=="error"&&_cur.phase!=="retrying")){
        setLiveStatus({phase:"tool-running",label:_t("tool.running")});
      }
      hideThinkCtl();
      /* A tool call counts as first visible activity, so retire the
         waiting status before execution progress begins. */
      if(firstDelta&&!finished){
        firstDelta=false;
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        pendingRender=requestAnimationFrame(function(){doRender()});
      }
    },
    /* P_tool_retry_button — Retry buttons inside failed tool rows fire a
       `tool-retry` CustomEvent (ui/toolInline.ts, react/tool-run). The
       document-level listener above routes it here so the user can re-run a
       failed search without retyping the query. Non-search failures
       (web_fetch, code_interpreter) fall through; the system prompt teaches
       the model to use a different strategy per errorCode rather than
       blindly re-issuing the same call. */
    onSearchRetry:_onSearchRetry
  });

  /* P_tool_retry_button — claim the route for the delegated `tool-retry`
     listener (registered once, module scope) and hand this turn's runtime to
     the approval bridge, which needs it to outlive finish() when the run is
     paused on a decision. */
  claimLiveSearchRetry(_onSearchRetry);
  registerLiveTurnRuntime(clientId,toolRuntime);
  var ret={
    recordToolUse:toolRuntime.recordToolUse,
    recordToolProgress:toolRuntime.recordToolProgress,
    recordToolCallDelta:toolRuntime.recordToolCallDelta,
    recordExecutionStart:toolRuntime.recordExecutionStart,
    recordToolResult:toolRuntime.recordToolResult,
    recordToolApproval:toolRuntime.recordToolApproval,
    recordAgentStep:toolRuntime.recordAgentStep,
    recordAgentPlan:toolRuntime.recordAgentPlan,
    /* P_message-usage — token totals from the backend `usage` frame.
       Held in the closure until finish() merges them into the finalized
       entry with the client-measured turn duration. */
    recordUsage:function(u){
      if(!u||typeof u!=="object")return;
      var promptTokens=Number(u.promptTokens)||0;
      var completionTokens=Number(u.completionTokens)||0;
      var totalTokens=Number(u.totalTokens)||(promptTokens+completionTokens);
      if(!promptTokens&&!completionTokens&&!totalTokens)return;
      turnUsage={
        promptTokens:promptTokens,
        completionTokens:completionTokens,
        totalTokens:totalTokens
      };
    },
    append:function(delta){
      /* P_session-stream-dispose — primary entry-point guard. The
         stream.js reader keeps draining already-buffered SSE chunks
         for one or two ticks after AbortController.abort(); without
         this check, late append() callbacks would push `full += delta`
         into a stream that no longer owns this `msgIdx` slot, then
         write the polluted text to stateStore.read("messages")[msgIdx].rawText
         (which now belongs to the new session).
         P_session-cross-talk — stillOwnsSlot() supersedes the bare
         _disposed check: it also returns false when the session has
         switched (stateStore.read("currentSessionId") !== ownerSessionId)
         even if abort() hasn't propagated yet, closing the race
         window where a delta lands between session-switch and abort. */
      if(!stillOwnsSlot())return;
      noteStreamGrowth();
      var wasFirst=firstDelta;
      if(wasFirst){
        firstDelta=false;
        if(!firstTokenAt)firstTokenAt=Date.now();
        /* First delta arrived — stop the elapsed counter. */
        if(_elapsedTick)clearInterval(_elapsedTick);
        /* The waiting line is retired with the first real content. */
        clearLiveStatus();
        /* Don't finalize the pill on the FIRST delta — many models emit
           a short preamble ("好的,让我搜一下…") before the tool_use
           event, and removing the pill here would leave the user
           staring at a blank bubble while the search actually runs.
           Defer the pill removal until the streaming text reaches
           PILL_HIDE_MIN_CHARS, so short preambles keep the "Thinking…"
           (or whatever label the upcoming tool_use sets) visible. */
      }
      full+=delta;
      /* React renders from this field when the publish below flushes, so
         the mirror has to happen before it. */
      patchOwnedMessage({rawText:full},true);
      /* Tokens are the proof the retry worked: the notice outlives tool
         activity and thinking stamps by design, so retire it here. */
      var _st=stateStore.read("messages")[msgIdx]._liveStatus;
      if(_st&&_st.phase==="retrying")setLiveStatus(null);
      publishReactChatRuntime({type:"stream-delta",messageId:clientId,textLength:full.length});
      /* Hide the status pill once the streamed text passes a small
         threshold — anything shorter is almost certainly a
         "好的,让我搜一下…" preamble that the model emits before its
         tool_use, and we want the pill to stay so the upcoming
         "Searching" label has a host. 60 chars is well below any
         substantive answer but well above a typical Chinese/English
         transition phrase. */
      if(thinkCtl&&typeof thinkCtl.finalize==="function"&&full.length>=60){
        try{thinkCtl.finalize()}catch(_){}
      }
      if(wasFirst){
        /* Schedule on rAF so the msg element is definitely in the DOM */
        cancelScheduledRender();
        pendingRender=requestAnimationFrame(function(){doRender()});
      }else{
        /* Task 2.4 — coalesce this delta through the shared scheduler
           instead of the old per-chunk scheduleRender(). */
        _streamScheduler.push(delta);
      }
    },
    /* Append reasoning deltas (DeepSeek R1 / QwQ style
       reasoning_content). Accumulated for the thinking panel and the
       session save; the status line is stamped by ensureThinkCtl. */
    appendThinking:function(delta){
      /* P_session-stream-dispose — same guard as append().
         P_session-cross-talk — stillOwnsSlot() closes the race window. */
      if(!stillOwnsSlot())return;
      if(typeof delta==="string"){
        if(!fullReasoning)_publishThinkingPanelStart();
        fullReasoning+=delta;
        _publishThinkingPanelLive();
      }
      if(toolRuntime&&typeof toolRuntime.hasActiveTools==="function"&&toolRuntime.hasActiveTools())return;
      try{ensureThinkCtl().append(delta||"")}catch(_){}
    },
    finalizeThinking:function(){
      if(thinkCtl&&typeof thinkCtl.finalize==="function"){
        try{thinkCtl.finalize()}catch(_){}
      }
    },
    setRetryStatus:function(notice){
      if(!stillOwnsSlot())return;
      var _retryLabel="Retrying · "+notice.retryNumber+"/"+notice.maxRetries+" · 5s";
      noteStreamGrowth();
      setLiveStatus({phase:"retrying",label:_retryLabel,clickable:false});
    },
    finish:function(){
      /* P_session-stream-dispose — once an abort() has fired, never
         let a late natural-finish callback (the LLM may flush a
         final "data: [DONE]" right before ac.abort propagates) write
         to stateStore.read("messages"). Set _disposed=true on natural completion
         too, so any queued microtask racing the close can't sneak in
         a stale write between finish()'s reads of `full` and the
         actual stateStore.read("messages")[msgIdx].html assignment. */
      if(_disposed)return;
      /* P_session-cross-talk — verify slot ownership BEFORE flipping
         _disposed/finished. If the user switched sessions while the
         stream was wrapping up, the natural [DONE] frame would
         otherwise: (1) write the old session's `full` into the new
         session's stateStore.read("messages")[msgIdx].html, (2) call
         saveCurrentSession() which persists the old answer under the
         NEW session's id, and (3) appendLocalMemory("assistant", full)
         polluting the new session's memory. Abandon silently instead.
         We don't call abort() here because loadSession already called
         it; we just refuse to commit the stale write. */
      if(stateStore.read("currentSessionId")!==ownerSessionId
         || msgIdx<0
         || !stateStore.read("messages")[msgIdx]
         || stateStore.read("messages")[msgIdx].clientId!==clientId){
        finished=true;
        _disposed=true;
        /* Still tear down timers / SSE so nothing leaks. */
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        toolRuntime.dispose();
        publishReactChatRuntime({
          type:"stream-aborted",
          messageId:clientId,
          textLength:full.length,
          reason:"session-replaced"
        });
        return;
      }
      if(finished)return;
      /* Task 2.4 — turn end: force the coalescing scheduler to paint the
         final accumulated text synchronously before we flip `finished`
         (which makes doRender bail). This closes the cadence window where
         the last delta was still sitting in the scheduler's rAF queue,
         guaranteeing the live tail is current before finish() runs its
         own single formatMsg pass below. */
      _streamScheduler.flushNow();
      finished=true;
      _disposed=true;
      _publishThinkingPanelEnd();
      toolRuntime.dispose();
      if(_elapsedTick)clearInterval(_elapsedTick);
      cancelScheduledRender();
      /* P1.2 — single formatMsg pass at finish time, written to
         stateStore.read("messages")[i].html. React has painted this turn from
         rawText + toolCalls all along, so the final render is only the
         `html` string that history reload and session save read — nothing
         touches the detached shell. */
      try{
        /* Final render: buildAssistantHtml parses <quiz>/<example>/<practice>
           scaffold blocks (replaces them with slot divs), runs formatMsg,
           then asynchronously mounts interactive widgets in setTimeout(0).
           Without this, no scaffold widgets ever rendered in live mode. */
        var finalHtml;
        try{
          /* P_canvas-mode — seed a stable canvasId on state BEFORE the
             buildAssistantHtml call so the canvas wrapper inside that
             function reuses the same id. */
          if(window._activeTemplate&&window._activeTemplate.outputMode==='canvas'){
            stateStore.dispatch({
              type:"state/set",key:"_canvasPendingId",
              value:'canvas-'+Math.random().toString(36).slice(2,10)
            });
          }
          /* P_declarative-tool-run — the finalized html carries prose only:
             react/tool-run splices the rows in from toolCalls[].textOffset,
             so a second copy baked into `html` would render each row twice.
             The split points captured at tool time are stamped onto the
             entries here — that is what makes the layout survive the
             save/reload round-trip. */
          try{
            var _m=msgIdx>=0?stateStore.read("messages")[msgIdx]:null;
            if(_m&&Array.isArray(_m.toolCalls)){
              for(var _ti=0;_ti<inlineToolRows.length;_ti++){
                for(var _tj=0;_tj<_m.toolCalls.length;_tj++){
                  if(_m.toolCalls[_tj].id===inlineToolRows[_ti].id){
                    _m.toolCalls[_tj].textOffset=inlineToolRows[_ti].offset;
                    break;
                  }
                }
              }
            }
          }catch(_){}
          var visibleFinal=stripChatArtifacts(full)
            .replace(/<think>[\s\S]*?<\/think>/gi,"")
            .replace(/<think>[\s\S]*$/gi,"");
          finalHtml=buildAssistantHtml(visibleFinal);
        }catch {
          console.log("[finish] render error");
          finalHtml="<p>"+esc(stripChatArtifacts(full).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,""))+"</p>";
        }
        /* Finalize the thinking status BEFORE saving it so the spinner
           stops once the response is complete. */
        if(thinkCtl&&typeof thinkCtl.finalize==="function"){
          try{thinkCtl.finalize()}catch(_){}
        }
        if(ownsMessageSlot()){
          /* P_canvas-mode — copy the active template's outputMode + canvasId
             onto the message so React's <CanvasBlock> can branch instead of
             falling through to dangerouslySetInnerHTML. */
          var _om=(window._activeTemplate&&window._activeTemplate.outputMode)||'chat';
          var _finalPatch={
            html:finalHtml,rawText:full,type:"assistant",
            reasoningContent:fullReasoning||null,outputMode:_om
          };
          if(turnUsage){
            var _endedAt=Date.now();
            _finalPatch.usage={
              promptTokens:turnUsage.promptTokens,
              completionTokens:turnUsage.completionTokens,
              totalTokens:turnUsage.totalTokens,
              durationMs:Math.max(0,_endedAt-startedAt),
              ttftMs:firstTokenAt?Math.max(0,firstTokenAt-startedAt):null
            };
          }
          if(_om==='canvas'){
            _finalPatch.canvasId=stateStore.read("_canvasPendingId")||('canvas-'+Math.random().toString(36).slice(2,10));
            _finalPatch._extensionIcon=(window._activeTemplate&&window._activeTemplate.icon)||'';
          }
          patchOwnedMessage(_finalPatch);
          stateStore.dispatch({type:"state/set",key:"_canvasPendingId",value:null});
        }
      }catch {
        console.log("[finish] render error");
        var fb="<p>"+esc(stripChatArtifacts(full).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,""))+"</p>";
        /* Without flipping type here the entry stays "streaming": React
           would filter it out. */
        patchOwnedMessage({
          html:fb,rawText:full,type:"assistant",
          reasoningContent:fullReasoning||null
        });
      }
      finishAfterRender();

      function finishAfterRender(){
        /* Post-render wiring (mermaid, viz, code headers, images) runs in
           MessageItem's useLayoutEffect on the React body after each
           commit — running the same hooks here would re-render them on a
           throwaway detached shell. */
        /* Streaming AI bubbles skip addMessage(). React owns #msgList and the
           React MessageToolbar component renders the same action buttons
           from the snapshot, so the legacy toolbar path is unreachable. */
        try{appendLocalMemory("assistant",full)}catch(_){}
        if(stateStore.read("phase")==="chat"||(stateStore.read("topic")&&stateStore.read("kbNodes").length)){
          saveCurrentSession();
        }
        updateChatStats();
        /* P0.0 — only reset the global streaming flags if THIS
         * controller is still the active one. When the user
         * interrupts a stream with a new message, a fresh
         * addStreamingMessage has already flipped turnState.chatStreaming
         * back to true; the old controller's teardown must not
         * clobber that, or the next "Stop" click would think no
         * stream is running. */
        if(turnState.activeChatCtl===ret){
          turnState.chatStreaming=false;
          try{setChatStopState(false)}catch(_){}
          try{markTurnEnded()}catch(_){}
          /* P1.4 — clearing the global abort handle on natural finish
             keeps the closure (and DOM refs) eligible for GC. */
          turnState.activeChatCtl=null;
        }
        /* The final pass changes the answer's height (a running row folds
           into its group, the status line retires, KaTeX resolves), and
           neither scrollTop nor distance-from-bottom survives that. Capture
           row identity + viewport offset instead, and re-assert it below. */
        var _finishViewport=null;
        if(reactLive&&list){
          try{
            var _fvRect=list.getBoundingClientRect();
            var _fvRows=list.querySelectorAll('.msg[data-client-id]');
            var _fvAnchor=null;
            var _fvStreamRowOffset=null;
            var _fvStreamRowNearTop=false;
            /* If the answer that is finishing is actually visible, it is the
               unambiguous anchor. Scanning from the top can accidentally pick
               the previous assistant row when its margin/border overlaps the
               viewport by a pixel, which shifts the current answer during the
               legacy-to-React swap. Keep an explicit row-level snapshot too:
               inner nodes may be transplanted and stay connected, masking the
               fact that the outer answer row itself moved. */
            if(div&&div.isConnected){
              var _fvLiveRect=div.getBoundingClientRect();
              if(_fvLiveRect.bottom>_fvRect.top+1&&_fvLiveRect.top<_fvRect.bottom-1){
                _fvAnchor=div;
                _fvStreamRowOffset=_fvLiveRect.top-_fvRect.top;
                _fvStreamRowNearTop=Math.abs(_fvStreamRowOffset)<=96;
              }
            }
            /* Otherwise prefer an assistant (non-user) message as the anchor
               so the viewport stays on the answer the reader is looking at. A
               user message partially visible at the top of the viewport would
               otherwise drag the scroll position back to the question after
               the React handoff changes layout. */
            for(var _fvi=0;!_fvAnchor&&_fvi<_fvRows.length;_fvi++){
              var _fvr=_fvRows[_fvi].getBoundingClientRect();
              if(_fvr.bottom>_fvRect.top+1){
                if(!_fvRows[_fvi].classList.contains('user')){_fvAnchor=_fvRows[_fvi];break;}
              }
            }
            if(!_fvAnchor){
              for(var _fvi=0;_fvi<_fvRows.length;_fvi++){
                var _fvr=_fvRows[_fvi].getBoundingClientRect();
                if(_fvr.bottom>_fvRect.top+1){_fvAnchor=_fvRows[_fvi];break;}
              }
            }
            /* Prefer an exact visible node inside the message body. The old
               row-level anchor could preserve the bubble's top while still
               moving the paragraph the user was reading by hundreds of
               pixels after async content and tool rows were transplanted. */
            var _fvInnerAnchor=null;
            if(_fvAnchor){
              var _fvCandidates=_fvAnchor.querySelectorAll(
                '.stream-settled-content > *,.stream-live-content > *,'+
                '.think-prefix > *,.think-suffix > *,.tool-inline,'+
                '.visualization-card,.exec-artifact,.msg-body > *'
              );
              for(var _fvni=0;_fvni<_fvCandidates.length;_fvni++){
                var _fvnr=_fvCandidates[_fvni].getBoundingClientRect();
                if(_fvnr.bottom>_fvRect.top+1){_fvInnerAnchor=_fvCandidates[_fvni];break;}
              }
            }
            /* When the answer row itself begins at the viewport top, anchor
               the row rather than its first paragraph. Streaming-only chrome
               above that paragraph disappears during the React handoff; an
               inner anchor would preserve the paragraph but visibly pull the
               whole answer upward by exactly that chrome height. Once the row
               starts well above the viewport, the reader is genuinely in the
               middle of a long answer and the inner paragraph is the better
               anchor. */
            var _fvRowOffset=_fvAnchor
              ?_fvAnchor.getBoundingClientRect().top-_fvRect.top
              :0;
            var _fvMeasuredAnchor=(_fvAnchor&&Math.abs(_fvRowOffset)<=96)
              ?_fvAnchor
              :(_fvInnerAnchor||_fvAnchor);
            _finishViewport={
              scroller:list,
              pinned:!stateStore.read("_userScrolledAway")&&
                list.scrollHeight-list.scrollTop-list.clientHeight<=96,
              /* Freeze the reader-intent flag NOW: layout churn during the
                 handoff fires scroll events that can flip the live flag
                 without any user input. */
              scrolledAway:!!stateStore.read("_userScrolledAway"),
              scrollTop:list.scrollTop,
              streamRowId:_fvStreamRowNearTop?clientId:null,
              streamRowOffset:_fvStreamRowNearTop?_fvStreamRowOffset:null,
              anchorNode:_fvMeasuredAnchor,
              anchorId:_fvAnchor?_fvAnchor.getAttribute('data-client-id'):null,
              anchorOffset:_fvMeasuredAnchor?_fvMeasuredAnchor.getBoundingClientRect().top-_fvRect.top:0
            };
          }catch(_){}
        }
        publishReactChatRuntime({
          type:"stream-finished",
          messageId:clientId,
          textLength:full.length
        });
        /* P_react-live-turn — the bubble React has been painting this whole
           turn IS the finalized one: there is no transplant, no reveal, and
           no duplicate legacy node to drop. What still changes at finish is
           the content height — the running row folds into its group, the
           status line retires, KaTeX resolves — so re-assert the anchor
           captured above for a bounded number of frames. A one-shot restore
           taken mid-flux strands the reader above the answer ("jumped back
           to my own message"), and the churn fires scroll events the
           scrollPill listener misreads as the user scrolling away. */
        if(reactLive){
          if(_finishViewport&&_finishViewport.scroller){
            var _fvScroller=_finishViewport.scroller;
            var _fvUserIntent=false;
            var _fvMarkIntent=function(){_fvUserIntent=true;};
            var _fvIntentEvents=["wheel","touchstart","pointerdown","keydown"];
            for(var _fvei=0;_fvei<_fvIntentEvents.length;_fvei++){
              window.addEventListener(_fvIntentEvents[_fvei],_fvMarkIntent,
                {passive:true,capture:true});
            }
            var _fvDetachIntent=function(){
              for(var _fvej=0;_fvej<_fvIntentEvents.length;_fvej++){
                window.removeEventListener(_fvIntentEvents[_fvej],_fvMarkIntent,
                  {capture:true});
              }
            };
            var _fvApply=function(){
              if(_finishViewport.pinned){
                /* A short answer can be both at the physical bottom and
                   aligned near the viewport top. If completion removes
                   streaming-only chrome, blindly staying at bottom moves
                   the whole answer downward. Restore the lost row height
                   first, then snap to the new bottom so both invariants
                   remain true. */
                if(_finishViewport.streamRowId&&
                  Number.isFinite(_finishViewport.streamRowOffset)){
                  var _fvPinnedRow=list.querySelector(
                    '.msg[data-client-id="'+_finishViewport.streamRowId+'"][data-react-owned]'
                  );
                  if(_fvPinnedRow){
                    var _fvPinnedRect=_fvPinnedRow.getBoundingClientRect();
                    var _fvPinnedNow=_fvPinnedRect.top-
                      _fvScroller.getBoundingClientRect().top;
                    var _fvPinnedDelta=Math.ceil(
                      _fvPinnedNow-_finishViewport.streamRowOffset
                    );
                    if(_fvPinnedDelta>1){
                      var _fvPinnedMin=Math.ceil(
                        _fvPinnedRect.height+_fvPinnedDelta
                      );
                      _fvPinnedRow.style.minHeight=_fvPinnedMin+"px";
                      var _fvPinnedMsg=msgIdx>=0?stateStore.read("messages")[msgIdx]:null;
                      if(_fvPinnedMsg){
                        updateMessageSnapshot(_fvPinnedMsg,{
                          _turnAnchorMinHeight:Math.max(
                            Number(_fvPinnedMsg._turnAnchorMinHeight)||0,
                            _fvPinnedMin
                          )
                        },true);
                      }
                    }
                  }
                }
                _fvScroller.scrollTop=_fvScroller.scrollHeight;
                /* Layout-shift scroll events during the handoff may
                   have flipped this flag; the reader never left the
                   bottom, so undo the corruption. */
                stateStore.dispatch({type:"state/set",key:"_userScrolledAway",value:false});
              }else if(_finishViewport.scrolledAway&&_finishViewport.scrollTop<=2){
                /* At the absolute transcript top, preserving scrollTop
                   is the user's explicit intent. Mid-answer reading is
                   different: React/legacy height deltas move the visible
                   paragraph even when scrollTop itself is unchanged, so
                   let the row-anchor branches below preserve content. */
                _fvScroller.scrollTop=_finishViewport.scrollTop;
              }else if(_finishViewport.streamRowId&&
                Number.isFinite(_finishViewport.streamRowOffset)){
                var _fvStreamRow=list.querySelector(
                  '.msg[data-client-id="'+_finishViewport.streamRowId+'"][data-react-owned]'
                );
                if(_fvStreamRow){
                  var _fvStreamRect=_fvStreamRow.getBoundingClientRect();
                  var _fvStreamNow=_fvStreamRect.top-
                    _fvScroller.getBoundingClientRect().top;
                  var _fvStreamDelta=_fvStreamNow-_finishViewport.streamRowOffset;
                  if(_fvStreamDelta>1){
                    var _fvMaxTop=Math.max(0,
                      _fvScroller.scrollHeight-_fvScroller.clientHeight);
                    var _fvNeededTop=_fvScroller.scrollTop+_fvStreamDelta;
                    var _fvShortfall=Math.ceil(_fvNeededTop-_fvMaxTop);
                    if(_fvShortfall>0){
                      /* The reader is already at the physical scroll
                         limit, so create only the missing answer reserve
                         before applying the row correction. This blank
                         tail is the same turn viewport anchor used while
                         streaming and is cleared when the next user turn
                         begins. */
                      var _fvRequiredMin=Math.ceil(
                        _fvStreamRect.height+_fvShortfall
                      );
                      _fvStreamRow.style.minHeight=_fvRequiredMin+"px";
                      var _fvStreamMsg=msgIdx>=0?stateStore.read("messages")[msgIdx]:null;
                      if(_fvStreamMsg){
                        updateMessageSnapshot(_fvStreamMsg,{
                          _turnAnchorMinHeight:Math.max(
                            Number(_fvStreamMsg._turnAnchorMinHeight)||0,
                            _fvRequiredMin
                          )
                        },true);
                      }
                    }
                  }
                  _fvScroller.scrollTop+=_fvStreamDelta;
                }
              }else if(_finishViewport.anchorNode&&_finishViewport.anchorNode.isConnected){
                var _fvExactNow=_finishViewport.anchorNode.getBoundingClientRect().top-
                  _fvScroller.getBoundingClientRect().top;
                _fvScroller.scrollTop+=_fvExactNow-_finishViewport.anchorOffset;
              }else if(_finishViewport.anchorId){
                var _fvCurrent=null;
                var _fvCurrentRows=list.querySelectorAll('.msg[data-client-id]');
                for(var _fvci=0;_fvci<_fvCurrentRows.length;_fvci++){
                  if(_fvCurrentRows[_fvci].getAttribute('data-client-id')===_finishViewport.anchorId){
                    _fvCurrent=_fvCurrentRows[_fvci];break;
                  }
                }
                if(_fvCurrent){
                  var _fvNow=_fvCurrent.getBoundingClientRect().top-
                    _fvScroller.getBoundingClientRect().top;
                  _fvScroller.scrollTop+=_fvNow-_finishViewport.anchorOffset;
                }else{
                  _fvScroller.scrollTop=_finishViewport.scrollTop;
                }
              }else{
                _fvScroller.scrollTop=_finishViewport.scrollTop;
              }
            };
            var _fvFrames=0;
            var _fvSettle=function(){
              if(_fvUserIntent){_fvDetachIntent();return;}
              try{_fvApply()}catch(_){}
              if(++_fvFrames<30){requestAnimationFrame(_fvSettle);}
              else{_fvDetachIntent();}
            };
            _fvSettle();
          }
        }
      }
    },
    abort:function(){
      /* P_session-stream-dispose — flip the sticky flag FIRST so any
         in-flight append()/recordToolUse()/finish() callbacks that
         are already scheduled in the microtask queue (the stream.js
         reader keeps draining the SSE buffer for one or two ticks
         after AbortController.abort()) will short-circuit on their
         own _disposed checks and never touch stateStore.read("messages"). */
      if(_disposed)return;
      if(finished)return;
      finished=true;
      _disposed=true;
      _publishThinkingPanelEnd();
      if(_elapsedTick)clearInterval(_elapsedTick);
      cancelScheduledRender();
      /* Restore the send button — but only if no new stream has
       * already taken over (the new wrapper cancels the OLD
       * controller when the user sends a follow-up, and the new
       * addStreamingMessage has already raised turnState.chatStreaming). */
      if(turnState.activeChatCtl===ret){
        turnState.chatStreaming=false;
        try{setChatStopState(false)}catch(_){}
        try{markTurnEnded()}catch(_){}
      }
      /* Stop the independent execution stream and any queued delta
         frame before this message can lose ownership of its slot. */
      toolRuntime.cancel();
      /* A user stop is an intentional end state. Keep any visible text as a
       * normal assistant message so it remains on screen and can be saved.
       * P_session-cross-talk — verify the slot still holds OUR placeholder
       * (by clientId) before splicing. If the user switched sessions,
       * stateStore.read("messages") was replaced and msgIdx now points at the new
       * session's message — splicing here would delete the new session's
       * message. The abandoned placeholder is harmless (it's not in the
       * new session's array), so just skip the splice. */
      var abortedMessage=(msgIdx>=0&&stateStore.read("messages")[msgIdx]&&
        stateStore.read("messages")[msgIdx].clientId===clientId)?stateStore.read("messages")[msgIdx]:null;
      var stoppedRaw=abortedMessage?String(full||abortedMessage.rawText||""):String(full||"");
      var visibleStoppedRaw=stoppedRaw
        .replace(/<think>[\s\S]*?<\/think>/gi,"")
        .replace(/<think>[\s\S]*$/gi,"")
        .trim();
      var hasPartial=!!(abortedMessage&&visibleStoppedRaw);
      if(abortedMessage&&!hasPartial&&abortedMessage.type==="streaming"){
        /* P_supersede-stable — removing the empty placeholder also removes
           the turn's viewport reserve, collapsing the scroll range on the
           send frame. Keep the entry as an invisible stub that still holds
           its reserve; the new turn's anchor glides past it and retires it
           off-screen (removeSupersededStub is the no-new-turn fallback). */
        abortedMessage=patchOwnedMessage({
          rawText:"",
          html:'<span data-turn-stub="1"></span>',
          type:"assistant",
          _supersededStub:true
        })||abortedMessage;
        setTimeout(function(){
          try{removeSupersededStub(clientId)}catch(_){/* already gone */}
        },700);
      }
      /* Finalize the partial text before publishing the aborted state. A
         complete scaffold becomes interactive; an open scaffold stays on
         the tolerant progressive renderer so already-streamed fields are
         not replaced by an empty fallback. */
      if(hasPartial&&abortedMessage){
        var stoppedHtml="";
        try{
          stoppedHtml=buildAssistantHtml(stoppedRaw);
          if(/scaffold-stream-unclosed/.test(stoppedHtml)){
            stoppedHtml=formatMsgProgressive(stoppedRaw);
          }
        }catch(_){
          try{stoppedHtml=formatMsgProgressive(stoppedRaw)}catch(__){stoppedHtml="<p>"+esc(visibleStoppedRaw)+"</p>"}
        }
        /* Task 4.1 — Resend affordance. After a user Stop, offer a
           Resend control on the stopped bubble that re-runs the send path
           from the most recent user message with a fresh turn (Req 2.6/2.7).
           Mirrors the recovered-stream `data-stream-retry` pattern: the
           button lives in the message HTML and clicks are delegated on the
           React-owned list. Reuses askChatTurn's AbortController/isUserAbort
           path — no new retry logic. */
        var resendHtml='<div class="msg-error msg-resend" style="margin-top:8px">'+
          '<span class="msg-error-text">'+esc(_t("chat.stopped")||"Response stopped")+'</span>'+
          '<button type="button" class="msg-retry-btn chat-resend-btn" data-chat-resend>'+esc(_t("chat.resend")||"Resend")+'</button>'+
          '</div>';
        stoppedHtml=stoppedHtml+resendHtml;
        abortedMessage=patchOwnedMessage({
          rawText:stoppedRaw,html:stoppedHtml,type:"assistant",state:"stopped"
        })||abortedMessage;
        /* The declarative renderer has no host for the html-resend
           affordance, so the stopped line is data. */
        setReactLiveStatus(abortedMessage,{
          phase:"stopped",label:_t("chat.stopped")||"Response stopped"
        });
        claimLiveRetry(ret,function(){
          try{resendLastUserMessage()}catch(_){/* resend handler threw */}
        });
        /* Delegate the Resend click on the list (button DOM is React-owned
           after the next paint). One-shot: detaches after firing. */
        var _resendDelegated=function(ev){
          var tgt=ev.target;
          if(!(tgt&&tgt.closest&&tgt.closest("[data-chat-resend]")))return;
          try{list.removeEventListener("click",_resendDelegated)}catch(_){}
          resendLastUserMessage();
        };
        try{list.addEventListener("click",_resendDelegated)}catch(_){}
        try{saveCurrentSession()}catch(_){ }
        try{updateChatStats()}catch(_){ }
      }
      /* Publish first, then remove only a throwaway shell on the next
         frame (a non-React node with our clientId, if one ever exists). */
      publishReactChatRuntime({
        type:"stream-aborted",
        messageId:clientId,
        textLength:full.length
      });
      requestAnimationFrame(function(){
        try{
          var _abLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
          if(_abLegacy&&!_abLegacy.hasAttribute("data-react-owned")&&_abLegacy.parentNode===list){
            list.removeChild(_abLegacy);
          }
        }catch(_){ }
      });
    },
    /* Show an inline error state with a retry button so the user can
       recover from a transient failure (network, 429, 5xx) without
       retyping. onRetry() is invoked when the button is clicked. */
      replaceWithError:function(errMsg,onRetry){
        if(finished)return;
        finished=true;
        _publishThinkingPanelEnd();
        toolRuntime.cancel();
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
       try{
         var partialHtml="";
         if(full.trim()){
           try{partialHtml=buildAssistantHtml(full)}catch(_){partialHtml="<p>"+esc(full)+"</p>"}
         }
         var errHtml=partialHtml+'<div class="msg-error">'+
             '<span class="msg-error-text">'+esc(errMsg||'Generation failed')+'</span>'+
              '<button type="button" class="msg-retry-btn" id="'+retryBtnId+'">Retry</button>'+
            '</div>';
          /* Serialize the error into the snapshot so React re-renders a
             finalized error bubble. The status line is that error's other
             half — the declarative renderer has no host for markup inside
             `html`. The placeholder `btn` (just an id, no addEventListener)
             triggers the delegation branch below for click handling. */
          if(ownsMessageSlot()){
            var _errorMessage=patchOwnedMessage({html:errHtml,type:"assistant"});
            if(_errorMessage){
              var _errCopy=String(errMsg||'Generation failed');
              setReactLiveStatus(_errorMessage,{
                phase:"error",label:_errCopy,error:_errCopy,
                retryable:typeof onRetry==="function"
              });
            }
          }
          var btn={ id: retryBtnId };
          if(btn&&typeof onRetry==="function"){
            var retryHandler=function(){
              /* P_no_retry_loading — fire onRetry() immediately so the
                 new streaming bubble appears in one step. Replace the failed
                 assistant entry first and preserve the error row's viewport
                 offset so retry starts where the interruption was visible,
                 rather than jumping back to the user's prompt. */
              try{
                streamRetryViewport.prepareViewport(list,msgIdx,clientId);
                var innerRet=onRetry();
                if(innerRet&&typeof innerRet.then==="function"){
                  innerRet.catch(function(){/* retry async handler failed */});
                }
              }catch {/* retry handler threw */}
            };
            /* React's status line asks this closure to retry; it is the same
               handler the delegated legacy click below runs. */
            claimLiveRetry(ret,retryHandler);
            if(typeof btn.addEventListener==="function"){
              var _captureDirectRetry=function(ev){
                streamRetryViewport.captureViewport(list,clientId);
                /* Mouse focus would collapse the expanded composer before
                   click. Keep editor focus until the retry stream replaces
                   the failed row; keyboard activation is unaffected. */
                if(ev.type==="mousedown")ev.preventDefault();
              };
              btn.addEventListener("pointerdown",_captureDirectRetry,true);
              btn.addEventListener("mousedown",_captureDirectRetry,true);
              btn.addEventListener("click",retryHandler);
            }else{
              function _findRetryTarget(node){
                if(!node)return null;
                if(node.id===retryBtnId)return node;
                return node.closest?node.closest("#"+retryBtnId):null;
              }
              /* Capture the visible error offset before the retry button
                 steals focus from the expanded mobile composer. Chromium can
                 synthesize either pointer+mouse events or only mouse events
                 depending on the input source, so cover both paths. */
              var _captureRetryPress=function(ev){
                if(!_findRetryTarget(ev.target))return;
                streamRetryViewport.captureViewport(list,clientId);
                if(ev.type==="mousedown")ev.preventDefault();
              };
              list.addEventListener("pointerdown",_captureRetryPress,true);
              list.addEventListener("mousedown",_captureRetryPress,true);
              /* Delegate retry clicks for React-rendered error bubbles.
                 (Previously this was an `else if(msgList && ...)`
                 guard, but `msgList` was undeclared in this closure
                 scope so the delegation never fired — retry clicks on
                 React-rendered error bubbles were silently dead.) */
              list.addEventListener("click",function _retryDelegated(ev){
                if(_findRetryTarget(ev.target)){
                  list.removeEventListener("pointerdown",_captureRetryPress,true);
                  list.removeEventListener("mousedown",_captureRetryPress,true);
                  list.removeEventListener("click",_retryDelegated);
                  retryHandler();
                }
              });
            }
          }
       }catch {
         patchOwnedMessage({html:'<p>'+esc(errMsg||'Generation failed')+'</p>',type:"assistant"});
       }
       updateChatStats();
       /* Restore the send button — even error paths end the stream.
        * Guarded on the active controller so a new stream that
        * supersedes this one is not clobbered. */
       if(turnState.activeChatCtl===ret){
         turnState.chatStreaming=false;
         try{setChatStopState(false)}catch(_){}
         try{markTurnEnded()}catch(_){}
       }
       /* Drop the legacy bubble so the next snapshot-driven re-render
          doesn't duplicate the finalized error bubble. (Same bug as
          finish/abort — `msgList` was undeclared here too.) */
       try{
         var _errLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
         if(_errLegacy && !_errLegacy.hasAttribute("data-react-owned") && _errLegacy.parentNode===list){
           list.removeChild(_errLegacy);
         }
       }catch(_){}
       publishReactChatRuntime({
         type:"stream-failed",
         messageId:clientId,
         textLength:full.length,
         error:String(errMsg||"Generation failed").slice(0,160)
       });
        /* The error row is the new end of the answer. Keep it inside the same
           dynamically measured safe area as normal text so the retry control
           can never settle underneath the composer. Save the last stable
           offset so focus changes during a Retry press cannot redefine where
           the replacement stream begins. */
        streamRetryViewport.settleErrorViewport(list,clientId,function(offset){
          streamRetryViewport.rememberStableViewport(clientId,offset,60000);
        });
      },
  };
  /* Publish this controller on window so a subsequent turn in the same
     chat can call turnState.activeChatCtl.abort() to evict the "正在思考…"
     bubble immediately instead of leaving it pinned while the model is
     still thinking. The next addStreamingMessage() call will overwrite
     turnState.activeChatCtl with its own controller. */
  turnState.activeChatCtl=ret;
  return ret;
}

/* Take the raw text the assistant produced and convert it into the
   final message-body HTML, including stripping <quiz>, <example>, and
   <practice> blocks from the prose and injecting interactive/static
   widgets in their place.

   IMPORTANT: we embed the empty slot divs directly into the markdown
   source (not as __PLACEHOLDER__ text) because GitHub-Flavored Markdown
   interprets __...__ as <strong>...</strong>, which would silently
   destroy our placeholders. Empty <div> blocks are passed through by
   marked unchanged. */
