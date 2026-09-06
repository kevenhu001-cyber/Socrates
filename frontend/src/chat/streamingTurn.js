/* chat/streamingTurn.js — extracted from main.js (B1 batch).
 * Streaming turn factory (addStreamingMessage + nested doRender) with all
 * turn-scoped helpers (placeholder, think DOM, viewport, live status,
 * tool runtime wiring, append/finish/abort/replaceWithError).
 * Zero-behavior-change lift: the closure moves intact; only module-external
 * references are rewired to imports (leaf modules) or window.* (main-owned).
 */
import { stateStore } from '../state/store.js';
import { turnState, streamRetryViewport } from './turnState.js';
import { quietTurn, markTurnInProgress, markTurnEnded, resendLastUserMessage, setChatStopState } from './turnUi.js';
import { claimLiveRetry, registerLiveTurnRuntime, claimLiveSearchRetry } from './liveTurn.js';
import { generateId } from '../util/ids.js';
import { hideNewReplyPill, showNewReplyPill } from '../ui/scrollPill.js';
import { isMsgListMounted } from '../react/message-list/MessageList.tsx';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { combineThinkingText, extractThinkText } from './thinkExtract.ts';
import {
  publishThinkingPanelEvent,
  setReactLiveStatus,
  updateMessageSnapshot,
} from '../ui/messageSnapshot.js';
import { createStreamScheduler } from '../render/streamScheduler.js';
import { appendThinking } from '../ui/thinkingPill.js';
import { scheduleActiveTurnToTop } from './turnAnchor.ts';
import { createToolRuntime } from './toolRuntime.js';
import { esc, stripCitationMarkers } from '../render/helpers.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { findInlineToolBoundary, splitStreamingMarkdown } from '../render/streaming.js';
import { formatMsgProgressive, formatTickSlice } from '../render/markdown.js';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from '../render/viz.js';
import { wireCodeBlockHeaders, wireMsgBodyImages } from '../render/postRender.js';
import { appendLocalMemory } from '../storage/localMemory.js';
import { reseatSavedArtifact } from '../ui/messageActions.ts';
import { settleInlineToolRowFromMessage } from '../ui/toolInline.js';
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
  var div=document.createElement("div");
  div.className="msg assistant";
  /* Override the CSS content-visibility:auto inherited from
     .msg-list>.msg. During streaming the browser would otherwise
     skip layout for this message when the user scrolls it
     off-screen, making scrollHeight stale and breaking auto-scroll
     (the snap would undershoot the real bottom by the un-laid-out
     content height). 'visible' ensures the streaming message is
     always laid out at its real size. */
  div.style.contentVisibility="visible";
  var body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  /* The bubble is mounted by React from the streaming entry below; the
     detached `div` stays as the sink for legacy writers that have no data
     equivalent (inline artifact hosts on the non-React path). */
  if(!reactLive)list.appendChild(div);
  /* P1.1/P1.2 — push a placeholder into the authoritative
     stateStore.read("messages") list. While streaming, `rawText` is updated on
     every delta and `html` is set to null. At finish() time we
     do a single formatMsg pass and write `html`. The DOM bubble
     is the rendered view, not the source. */
  var clientId="msg-"+generateId();
  div.dataset.clientId=clientId;
  var msgIdx=stateStore.dispatch({type:"session/append-message",payload:{
    clientId:clientId,
    role:"assistant",
    rawText:"",
    html:null,
    type:"streaming",
    actions:null
  }});
  publishReactChatRuntime({type:"stream-started",messageId:clientId});
  var full="";
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
  function _openThinkingPanel(){
    publishThinkingPanelEvent({type:"panel-open",messageId:clientId});
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
  /* Adaptive perceptual cadence: the first screen can paint at ~20fps,
     while very long answers progressively back off to protect input and
     scrolling. A timer sleeps until the next useful paint rather than
     waking the main thread on every animation frame. */
  var _lastRenderAt=0;
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
  /* P-H4 — skip an entire render pass when no new characters have
     arrived since the last one (e.g. the trailing rAF the throttle
     schedules after the stream goes idle). */
  var _lastParsedLen=-1;
  /* P-H4 — stable-prefix cache for the no-think branch. Everything up to
     the last blank line is treated as settled markdown blocks: parsed
     once and cached here, so each frame only re-parses the unfinished
     tail block instead of the whole accumulated response. */
  var _stablePrefixText=null;
  var _stablePrefixHtml="";
  /* Thinking pill (for chat-mode reasoning_content). Lazily created on
     the first onThinking(delta) callback so we don't add a pill for
     models that don't produce reasoning. Hidden when the user has
     toggled "Show AI thinking" off. */
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
  /* P_tool_in_think — cached container for tool cards inside
     the think-block. Lazily created by _ensureToolContainer(). */
  var _toolCardContainer=null;
  /* P_declarative-tool-run — where in `full` the answer was when each tool_use
     landed. `segBase` is what the degraded (non-React) text painter renders
     from — after a tool call the text resumes below it — and inlineToolRows is
     the {id,name,offset} ledger finish() stamps onto toolCalls[] as
     `textOffset`, which is the sole input react/tool-run needs to lay the rows
     out. The rows themselves are no longer spliced into this bubble: the
     layout rule lives once, in the renderer, not three times in HTML strings. */
  var segBase=0;
  var inlineToolRows=[];
  /* The degraded (non-React) surface paints its streamed text into one host
     for the whole turn, appended after whatever the runtime mounts into the
     body. It used to be a fresh host per text segment, frozen and re-opened
     around every inline row — that per-segment dance was the second copy of
     the tool-row layout rule, and it is gone with the rows. */
  var segHost=null;
  function ensureSegHost(){
    if(segHost&&segHost.isConnected)return segHost;
    segHost=document.createElement("div");
    segHost.className="stream-segment";
    body.appendChild(segHost);
    return segHost;
  }
  /* Where a legacy (non-declarative) tool card mounts in the degraded bubble:
     inside the think-block when there is one, so the cards read as part of the
     reasoning, otherwise at the end of the body. The React renderer never calls
     this — it draws rows from toolCalls[]. */
  function _ensureToolContainer(){
    if(_toolCardContainer&&_toolCardContainer.isConnected)return _toolCardContainer;
    /* Try to reuse an existing think-block's .think-tools slot.
       When both thinking content and tool cards arrive, they share
       the same collapsible block — the tool cards go in .think-tools
       and the reasoning text goes in .think-content. */
    var tb=body.querySelector('.think-block');
    if(tb){
      _toolCardContainer=tb.querySelector('.think-tools');
      if(!_toolCardContainer){
        _toolCardContainer=document.createElement("div");
        _toolCardContainer.className="think-tools";
        var tc=tb.querySelector('.think-content');
        if(tc)tc.after(_toolCardContainer);
        else tb.appendChild(_toolCardContainer);
      }
      return _toolCardContainer;
    }
    /* No think-block yet (thinking content hasn't arrived, or won't
       arrive at all — e.g. tool-only responses). Place tool cards
       directly in the bubble body without a wrapper. They'll be
       preserved by the finish() path which saves and re-inserts
       orphaned .agent-tool-card elements. */
    _toolCardContainer=body.querySelector('.think-tools');
    if(!_toolCardContainer){
      _toolCardContainer=document.createElement("div");
      _toolCardContainer.className="think-tools";
      body.appendChild(_toolCardContainer);
    }
    return _toolCardContainer;
  }
  function ensureThinkCtl(){
    /* Tool activity owns the single live status line. Keep the reasoning
       buffer in memory, but do not mount a second loading indicator while
       a tool card is running. The next reasoning delta after all tools
       settle can create the pill again. */
    if(toolRuntime&&typeof toolRuntime.hasActiveTools==="function"&&toolRuntime.hasActiveTools()){
      return suppressedThinkCtl;
    }
    if(reactLive){
      /* No pill DOM — thinkingPill appends into the last assistant bubble,
         which under React is a node React owns. The status line is data. */
      thinkCtl=reactThinkCtl;
      stampThinking();
      return reactThinkCtl;
    }
    if(thinkCtl)return thinkCtl;
    /* P0.8 — The placeholder ("正在思考…") is no longer needed once
       real reasoning_content arrives. Remove it here so the user
       sees only the thinking pill ("正在思考"), not both. */
    try{placeholder.remove()}catch(_){}
    thinkCtl=appendThinking(clientId);
    /* If appendThinking returned null (DOM not ready), fall back to no-op. */
    if(!thinkCtl)thinkCtl={append:function(){},finalize:function(){},remove:function(){}};
    return thinkCtl;
  }
  /* Unique ID for the retry button so we can attach a click handler after
     setting innerHTML (innerHTML wipes previous listeners). */
  var retryBtnId="retry-"+Math.random().toString(36).slice(2,10);
  /* Show a "thinking" placeholder until the first delta arrives.
     FIRST_DELTA_TIMEOUT_MS is set to the same value as the stream
     timeout so there is effectively one timeout — the model can take
     up to 120s to start generating without a false expiry. The
     data-mode attribute lets CSS style the chat-mode placeholder
     more prominently (chat mode has no KB / diagnostic to give
     the user context that work is happening).

     P_paint-race — the placeholder used to be installed by setting
     body.innerHTML = "<span class=thinking-dot>...</span>" in the
     same task that called append(). On a fast path (cached response,
     healthy proxy, hot upstream) the first onDelta could fire before
     the browser had a chance to commit a paint, in which case the
     placeholder text never actually appeared on screen — the user
     would see only the streamed content, looking exactly like "no
     streaming, no thinking pill, just the answer".

     Switching to a real child node created via createElement gives
     us a guaranteed paint opportunity for the placeholder before
     any future mutation can race with it. The 5-second elapsed tick
     now mutates only the placeholder's text node (not the whole
     body's innerHTML), which has the side benefit of NOT clobbering
     the .think-block pill if a reasoning model emits
     reasoning_content before the first text delta. The 120 s
     timeout swaps placeholder for the error block via replaceChild
     so other children survive. */
  var FIRST_DELTA_TIMEOUT_MS=120000;
  /* A compact status row avoids the large height collapse caused by the
     old five-line skeleton when the first real token arrived. */
  var placeholder=document.createElement("div");
  placeholder.className="thinking-placeholder";
  var placeholderRow=document.createElement("span");
  placeholderRow.className="thinking-dot";
  placeholderRow.setAttribute("data-mode",_appMode());
  /* P_thinking-unified — same 14px arc + flat gray label as the reasoning
     pill, so nothing swaps style when the first reasoning/tool status or
     the first answer token lands. */
  var placeholderSpinner=document.createElement("span");
  placeholderSpinner.className="thinking-spinner";
  placeholderSpinner.setAttribute("aria-hidden","true");
  var placeholderText=document.createElement("span");
  placeholderText.className="thinking-dot-label";
  placeholderText.textContent=_appMode()==="chat"?_t("think.thinking"):_t("common.generating");
  placeholderRow.appendChild(placeholderSpinner);
  placeholderRow.appendChild(placeholderText);
  placeholder.appendChild(placeholderRow);
  /* P_thinking-clickable — in chat mode the waiting placeholder opens
     the right-side thinking panel too (the same affordance as the
     reasoning pill). Tutor mode keeps its "Generating…" copy non-
     interactive so the panel entry stays tied to "Thinking…". */
  if(_appMode()==="chat"){
    placeholderRow.classList.add("thinking-dot-clickable");
    placeholderRow.setAttribute("role","button");
    placeholderRow.setAttribute("tabindex","0");
    try{
      var _openLabel=_t("think.openPanel");
      if(_openLabel&&_openLabel!=="think.openPanel"){
        placeholderRow.setAttribute("aria-label",_openLabel);
      }else{
        placeholderRow.setAttribute("aria-label","View thinking process");
      }
    }catch(_){
      placeholderRow.setAttribute("aria-label","View thinking process");
    }
    placeholderRow.addEventListener("click",function(ev){
      ev.preventDefault();
      _openThinkingPanel();
    });
    placeholderRow.addEventListener("keydown",function(ev){
      if(ev.key==="Enter"||ev.key===" "){
        ev.preventDefault();
        _openThinkingPanel();
      }
    });
  }
  if(!reactLive)body.appendChild(placeholder);
  else stampWaiting(0);
  scheduleActiveTurnToTop(list,div,msgIdx,retryViewport);
  function setPlaceholderText(label){
    if(reactLive){stampWaiting(Math.round((Date.now()-thinkStarted)/1000));return}
    /* Fast text-node rewrite — no DOM rebuild, no parse, no
       layout reflow beyond the badge's own intrinsic box. Safe to
       call many times per second. */
    placeholderText.textContent=label;
  }
  /* Morph the send button into a red Stop so the user can abort
     the stream. setChatStopState(false) on finish/abort. */
  turnState.chatStreaming=true;
  try{setChatStopState(true)}catch(_){}
  /* Task 4.1 — record turn-in-progress + Resend target (latest user msg). */
  try{markTurnInProgress()}catch(_){}
  var thinkStarted=Date.now();
  /* Phase-based reassurance keeps the surface visibly alive without a
     twitchy elapsed-seconds counter that can read like a stalled request. */
  var _elapsedTick=null;
  _elapsedTick=setInterval(function(){
    if(finished||!firstDelta)return;
    var sec=Math.round((Date.now()-thinkStarted)/1000);
    if(reactLive){stampWaiting(sec);return}
    if(sec>=45)setPlaceholderText(_t("think.stillWorking"));
    else if(sec>=20)setPlaceholderText(_t("think.organizingAnswer"));
    else if(sec>=8)setPlaceholderText(_t("think.reviewingContext"));
    /* Quiet elapsed cue after 12s: the phase copy stays primary, the
       seconds suffix fades in beside it so long waits read as alive.
       The counter itself moves in 5s steps — a per-second rewrite made
       the pill's width jitter constantly, which read as instability
       rather than progress. */
    var _elapsedQ=Math.max(10,Math.floor(sec/5)*5);
    if(sec>=12&&!placeholderRow.classList.contains("thinking-elapsed-shown")){
      placeholderRow.classList.add("thinking-elapsed-shown");
      placeholderRow.setAttribute("data-elapsed",_elapsedQ+"s");
    }else if(placeholderRow.classList.contains("thinking-elapsed-shown")
             &&placeholderRow.getAttribute("data-elapsed")!==_elapsedQ+"s"){
      placeholderRow.setAttribute("data-elapsed",_elapsedQ+"s");
    }
  },1000);
  var firstDeltaTimer=setTimeout(function(){
    if(finished||!firstDelta)return;
    if(_elapsedTick)clearInterval(_elapsedTick);
    finished=true;
    if(toolRuntime)toolRuntime.dispose();
    cancelScheduledRender();
    stateStore.dispatch({type:'state/set',key:'lastCallError',value:"No response for "+Math.round(FIRST_DELTA_TIMEOUT_MS/1000)+"s"});
    /* Cancel the underlying stream so it doesn't keep running in the
       background holding resources for the full timeout window. */
    try{if(window._activeChatAbort)window._activeChatAbort("first-delta-timeout")}catch(_){}
    var _timeoutCopy=_t("common.noResponseTimeout").replace("{sec}",Math.round(FIRST_DELTA_TIMEOUT_MS/1000));
    if(reactLive){
      /* The entry stays a live turn: React's status line carries the failure
         and the Retry affordance, and retrying starts a new turn, so nothing
         has to be baked into `html` here. */
      setLiveStatus({phase:"error",label:_timeoutCopy,error:_timeoutCopy,retryable:true});
      claimLiveRetry(ret,function(){
        if(typeof onRetry==="function"){try{onRetry()}catch {/* retry handler threw */}}
      });
      updateChatStats();
      return;
    }
    /* P_paint-race — swap placeholder for the error block via
       replaceChild so other children (in practice the reasoning
       pill if reasoning_content arrived first) survive. */
    var err=document.createElement("div");
    err.className="msg-error";
    var errText=document.createElement("span");
    errText.className="msg-error-text";
    errText.textContent=_timeoutCopy;
    var errBtn=document.createElement("button");
    errBtn.type="button";
    errBtn.className="msg-retry-btn";
    errBtn.id=retryBtnId;
    errBtn.textContent=_t("common.retry");
    err.appendChild(errText);
    err.appendChild(errBtn);
    if(placeholder.parentNode===body){
      body.replaceChild(err,placeholder);
    }else{
      body.appendChild(err);
    }
    var btn=body.querySelector("#"+retryBtnId);
    if(btn){
      btn.addEventListener("click",function(){
        /* P_no_retry_loading — fire onRetry() directly so the new
           streaming bubble appears immediately. Previously we showed
           a transient "Retrying…" pill for 120ms before invoking
           onRetry, which the user found noisy and confusing — the
           pill sat there loading, then a new conversation bubble
           appeared below, looking like two separate events. The
           new bubble's own thinking state is enough indication. */
        if(typeof onRetry==="function"){try{onRetry()}catch {/* retry handler threw */}}
      });
    }
    updateChatStats();
  },FIRST_DELTA_TIMEOUT_MS);

  /* P0.7 — streaming state for inline <think>…</think> blocks.
     Reasoning models stream the chain-of-thought in-band with the
     final answer. We want to route the in-think content into a
     collapsible <details> as soon as <think> arrives (even before
     it closes), and keep routing content into the right section
     until </think> is seen. The block is collapsed by default;
     the summary pulses "Thinking…" while the model is still
     reasoning, and switches to a static "Thinking" label once
     the think is closed. The final answer after </think> is
     rendered as a regular text node. The cursor is always at the
     end of the body so the user sees it after the active section. */
  var thinkState={
    /* -1 until a <think> has been seen in `full`. */
    startIdx:-1,
    /* index just past the closing </think>, or -1 if still open. */
    endIdx:-1,
    /* DOM nodes for the three sections; null until laid out. */
    beforeNode:null,
    details:null,
    summary:null,
    thinkDiv:null,
    afterNode:null,
    cursorNode:null,
    /* Cached last think content so we can skip the formatMsg
       pass (which is expensive — marked + KaTeX) when nothing
       has changed. */
    lastRenderedThink:null,
    /* P1.4 — same idea for the pre-think and post-think slices.
       The renderer (formatMsgProgressive) is cheap but the
       string-compare lets us skip the innerHTML write entirely
       on frames where the slice didn't grow — which is most
       frames after <think> closes, since only the think content
       keeps streaming. */
    lastRenderedBefore:null,
    lastRenderedAfter:null
  };

  function ensureThinkStructure(){
    if(thinkState.beforeNode)return;
    /* P_inline-tools — the three-section think layout now lives inside
       the current segment host instead of owning the whole body, so
       earlier frozen segments and inline tool rows survive intact.
       P_tool_preserve — save tool cards before host.innerHTML=""
       wipes them, so tools called before the <think> marker are
       preserved inside the new think-block structure. */
    try{placeholder.remove()}catch(_){}
    var host=ensureSegHost();
    var _savedTools=host.querySelector('.think-tools');
    if(_savedTools)_savedTools.parentNode.removeChild(_savedTools);
    host.innerHTML="";
    /* P1.4 — pre-think text is a block-level container that holds
       rendered markdown HTML, NOT a text node. The previous design
       used document.createTextNode and wrote the raw slice via
       nodeValue, which made "# Title" / "- item" / code fences
       appear as raw symbols mid-stream, and HTML's whitespace
       handling collapsed every "\n" to a single space — so the
       user saw one run-on blob of unparsed markdown. */
    thinkState.beforeNode=document.createElement("div");
    thinkState.beforeNode.className="think-prefix";
    host.appendChild(thinkState.beforeNode);

    var det=document.createElement("details");
    det.className="think-block think-block-streaming";
    /* P_thinking-collapsed-default — think-block is folded by default
     * on this path too (matches appendThinking() above). window.thinkingOn
     * still controls whether reasoning content is generated at all
     * (system prompt suffix in buildSocraticPrompt, see thinkingSuffix()),
     * but no longer auto-expands the UI block. The user clicks the
     * summary to expand if they want to read the live reasoning stream. */
    det.open=false;
    var sum=document.createElement("summary");
    sum.className="think-summary think-summary-streaming";
    var _streamingLabel=(typeof window!=="undefined"&&window.t)?window.t("think.thinking"):"Thinking…";
    sum.innerHTML='<span class="thinking-spinner" aria-hidden="true"></span>'+
      '<span class="think-summary-label">'+esc(_streamingLabel)+'</span>'+
      '<span class="think-summary-chevron" aria-hidden="true"></span>';
    det.appendChild(sum);

    var td=document.createElement("div");
    td.className="think-content";
    det.appendChild(td);
    host.appendChild(det);

    /* P1.4 — post-think text gets the same block-level container
       treatment; empty until </think> arrives, then populated by
       doRender via formatMsgProgressive. */
    thinkState.afterNode=document.createElement("div");
    thinkState.afterNode.className="think-suffix";
    host.appendChild(thinkState.afterNode);

    var cur=document.createElement("span");
    cur.className="stream-cursor";
    cur.textContent="▍";
    host.appendChild(cur);
    thinkState.cursorNode=cur;

    thinkState.details=det;
    thinkState.summary=sum;
    thinkState.thinkDiv=td;
    thinkState.cursorNode=cur;
    /* Re-insert saved tool cards after the think-content so they
       appear inside the collapsible thinking block. */
    if(_savedTools)td.parentNode.appendChild(_savedTools);
    /* Clear the cached tool container — the think-block was rebuilt
       and _toolCardContainer points to the old disconnected element. */
    _toolCardContainer=null;
    /* The old single-text-node + cursor are no longer in use. */
    streamContent=null;
    cursor=null;
  }

  /* Follow the answer as it grows, unless the reader said otherwise. Shared by
     the legacy painter and the React pass, which mutates the DOM in its own
     callback and so needs this tail without any of the painting.
     P_react-live-turn — the snap cannot be one write: with React owning the
     bubble, the text lands in a commit scheduled off the delta publish, which
     can land a frame or two AFTER this pass measured. A pinned reader would
     then sit looking at a gap that only closes on the next delta. So keep
     chasing the bottom for a few frames; each write is a no-op once the view
     is already there, and the scroll-away flag (set synchronously by the
     listener) breaks the chain the moment the reader takes over. */
  var _pinFollowFrames=3;
  function followStreamBottom(scroller,pinned){
    if(!scroller)return;
    if(stateStore.read("_userScrolledAway")){showNewReplyPill();return}
    if(!pinned)return;
    /* P_scroll-race — `pinned` was measured before this cycle's DOM
       mutations. A concurrent passive wheel / touch event (processed by
       the compositor thread without blocking JS) may have scrolled the
       viewport since then — the per-frame re-check of the flag below is what
       keeps us from fighting the user's scroll intent. */
    scroller.scrollTop=scroller.scrollHeight;
    var _frames=_pinFollowFrames;
    requestAnimationFrame(function _repin(){
      if(!scroller||stateStore.read("_userScrolledAway")||_frames-- <=0)return;
      scroller.scrollTop=scroller.scrollHeight;
      requestAnimationFrame(_repin);
    });
  }

function doRender(){
    pendingRender=null;
    /* P_session-stream-dispose — rAF guard. cancelAnimationFrame in
       abort()/finish() usually wins, but a doRender body may already
       be running on this very tick. Bail before touching stateStore.read("messages"). */
    if(finished||_disposed)return;

    _lastRenderAt=performance.now();

    /* Keep using the message list even on the exact frame where it grows
       from non-scrollable to scrollable; scrollContainer() otherwise
       switches surfaces at that boundary and loses the bottom anchor. */
    var _streamScroller=list||scrollContainer();
    /* Route the streaming auto-scroll decision through the pure predicate in
       scrollDecision.ts. The streaming path uses a wider 96px pin slack than
       the 64px SCROLL_SLACK default (a single tall Markdown/code delta can
       jump the bottom by more than 64px between frames), so pass the slack
       explicitly to isPinnedToBottom. */
    /* Was the reader at the bottom BEFORE this cycle's growth? Measuring
       afterwards made a single tall Markdown/code update look like a manual
       scroll-away, so streaming abruptly stopped following the answer. Under
       React the growth already happened by the time this runs (React commits
       in its own earlier rAF), so the reading comes from noteStreamGrowth(),
       which is called when the delta arrives. */
    var _wasPinned=false;
    if(_streamScroller&&!stateStore.read("_userScrolledAway")){
      _wasPinned=reactLive?_pinWanted:isPinnedToBottom(
        _streamScroller.scrollHeight-_streamScroller.scrollTop-_streamScroller.clientHeight,
        96
      );
    }

    if(reactLive){
      /* P_react-live-turn — AssistantTurn paints this turn's prose from
         `rawText` with the same stable-prefix split, so the whole render
         section below (segment hosts, think-block scaffolding, innerHTML
         writes) is dead weight here. Mirror the data, keep the thinking panel
         fed, and follow the bottom. */
      if(stillOwnsSlot()){
        patchOwnedMessage({rawText:full},true);
      }
      if(fullReasoning||_extractThinkText(full)){
        _publishThinkingPanelLive();
      }
      followStreamBottom(_streamScroller,_wasPinned);
      return;
    }

    /* P0 — chat-template artifact strip. The upstream LLM (Beagle,
     * DeepSeek, MiniMax M2, etc.) can leak <|im_start|>...<|im_end|>,
     * [INST]...[/INST], <s>, <|endoftext|>, etc. into the streamed
     * tokens. The final formatMsg pass strips them, but mid-stream
     * the user would see them as raw text in the live bubble. Strip
     * once per render so all downstream slicing (think-block
     * detection, beforeText/thinkContent/afterText, the no-think
     * text node) operates on the cleaned version. The raw `full`
     * is still kept in stateStore.read("messages")[msgIdx].rawText for save /
     * history so a later formatMsg can re-process it. */
    var rawDisplayFull=stripCitationMarkers(stripChatArtifacts(full.slice(segBase)));
    var inlineThinkStart=rawDisplayFull.indexOf("<think>");
    var inlineThinkEnd=inlineThinkStart===-1?-1:rawDisplayFull.indexOf("</think>",inlineThinkStart);
    if(inlineThinkStart!==-1){
      /* Some providers emit reasoning inside <think> instead of the
         reasoning_content field. Keep the same temporary status while
         preventing the internal block from reaching the renderer. */
      try{ensureThinkCtl()}catch(_){}
      if(inlineThinkEnd!==-1){try{ensureThinkCtl().finalize()}catch(_){}}
    }
    var displayFull=inlineThinkStart===-1
      ?rawDisplayFull
      :rawDisplayFull.slice(0,inlineThinkStart)+(inlineThinkEnd===-1?"":rawDisplayFull.slice(inlineThinkEnd+"</think>".length));

    /* P-H4 — nothing new since the last render; skip the whole parse. */
    if(displayFull.length===_lastParsedLen)return;

    /* Locate <think> / </think> in the accumulated stream. The
       startIdx is only set the first time we see <think> so the
       text-before-think doesn't get re-laid out on every delta
       (which would wipe the user's cursor position). */
    if(thinkState.startIdx===-1){
      var s=displayFull.indexOf("<think>");
      if(s!==-1)thinkState.startIdx=s;
    }
    if(thinkState.startIdx!==-1&&thinkState.endIdx===-1){
      var e=displayFull.indexOf("</think>",thinkState.startIdx);
      if(e!==-1)thinkState.endIdx=e+"</think>".length;
    }

    if(thinkState.startIdx===-1){
      /* P_arch streaming-render — run formatMsgProgressive on every
         rAF tick so the user sees real-time markdown + math rendering
         as the model streams (not waiting until finish()).

         Why formatMsgProgressive and not formatMsg?
           - formatMsgProgressive handles UNCLOSED $$...$$ and ```...```
             with subtle placeholders ("…"), so a half-arrived math
             formula never leaks raw LaTeX source into the live bubble.
           - formatMsg assumes closed pairs; on partial input it falls
             back to escaping and the user sees "$$\frac{" raw.
           - preprocessMarkdownForStreaming is the streaming-safe
             preprocessor: idempotent on repeated calls (the
             stray-$ escape, lone-$ promote, and unclosed-fence
             append rules are skipped — those break on re-entry).

         Why no chunked boundaries?
           - The previous chunked-fade split on `\n\n` or sentence
             ends and called formatMsg on each slice. A chunk that
             landed inside an open `\[...\]` rendered a half-complete
             slice as broken KaTeX. Without chunking, formatMsgProgressive
             handles the partial state itself; nothing splits mid-token.
           - The user's complaint was "渲染失败" — broken rendering.
             The streaming-safe renderer preserves the typewriter feel
             (text appears char-by-char as deltas arrive) while making
             sure markdown and math render correctly in real time. */
      if(!streamContent){
        /* P_inline-tools — the streaming text surface now lives inside
           a per-segment host appended at the END of the bubble body.
           Earlier children (reasoning pill, inline tool rows, frozen
           segments, artifacts) are left untouched, so the old
           save-and-reinsert dance for pills/tool cards/artifacts is
           no longer needed: chronological DOM order IS the layout. */
        try{placeholder.remove()}catch(_){}
        var _segHost=ensureSegHost();
        _segHost.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        _segHost.appendChild(streamContent);
        settledContent=document.createElement("div");
        settledContent.className="stream-settled-content";
        liveContent=document.createElement("div");
        liveContent.className="stream-live-content";
        streamContent.appendChild(settledContent);
        streamContent.appendChild(liveContent);
        cursor=document.createElement("span");
        cursor.className="stream-cursor";
        cursor.textContent="▍";
        /* Keep the cursor outside the frequently replaced live tail. */
        streamContent.appendChild(cursor);
      }
      /* P-H4 — stable-prefix incremental render. Split displayFull at the
         last blank line: the part before it is settled markdown blocks
         (parsed once, cached in _stablePrefixHtml) and only the trailing
         unfinished block is re-parsed each frame. This turns the old
         O(n²) "re-parse the whole accumulated text every frame" into an
         O(tail) pass. The split is only trusted when the prefix has
         balanced code fences / math delimiters (see splitStreamingMarkdown);
         otherwise we fall back to a full parse for this frame. finish()
         always re-runs the full formatMsg, so any streaming-time seam is
         corrected once the message completes. */
      var rendered;
      var _parts=splitStreamingMarkdown(displayFull);
      var _prefix=_parts.prefix;
      if(_prefix){
        if(_prefix!==_stablePrefixText){
          _stablePrefixHtml=formatMsgProgressive(_prefix);
          _stablePrefixText=_prefix;
          settledContent.innerHTML=_stablePrefixHtml;
        }
        rendered=_parts.tail?formatMsgProgressive(_parts.tail):"";
      }else{
        rendered=formatMsgProgressive(displayFull);
        if(_stablePrefixText!==null){
          _stablePrefixText=null;
          _stablePrefixHtml="";
          settledContent.innerHTML="";
        }
      }
      /* PERF: the guard value is held as a plain JS property, not in
         dataset. A dataset write serialises the whole rendered HTML into a
         real DOM attribute every frame — several KB reflected into the
         document and re-parsed on each tick, for a value nothing outside
         this function ever reads. */
      if(liveContent._lastRenderedHtml!==rendered){
        liveContent.innerHTML=rendered;
        liveContent._lastRenderedHtml=rendered;
        /* Wire viz/mermaid iframes that were just injected by the
           streaming renderer so the loading spinner is hidden and
           the card transitions to the "ready" state. */
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
      }
    }else{
      /* Think block is in play. Lay out the three-section
         structure once, then update the text nodes and the
         think content incrementally. */
      ensureThinkStructure();
      var beforeText=displayFull.slice(0,thinkState.startIdx);
      var thinkClosed=thinkState.endIdx!==-1;
      var thinkContent=thinkClosed
        ?displayFull.slice(thinkState.startIdx+"<think>".length,thinkState.endIdx-"</think>".length)
        :displayFull.slice(thinkState.startIdx+"<think>".length);
      var afterText=thinkClosed?displayFull.slice(thinkState.endIdx):"";
      /* P_arch streaming-render — pre-think and post-think slices
         use formatMsgProgressive (streaming-safe) for real-time
         rendering. formatMsgProgressive handles partial $$ and ```
         with placeholders, so a half-arrived formula doesn't leak
         raw LaTeX into the live bubble. */
      if(thinkState.beforeNode._lastRenderedHtml!==beforeText){
        thinkState.beforeNode.innerHTML=beforeText?formatMsgProgressive(beforeText):"";
        thinkState.beforeNode._lastRenderedHtml=beforeText;
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
      }
      if(thinkState.afterNode._lastRenderedHtml!==afterText){
        thinkState.afterNode.innerHTML=afterText?formatMsgProgressive(afterText):"";
        thinkState.afterNode._lastRenderedHtml=afterText;
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
      }
      /* When </think> has been seen, swap the summary to a
         static label and drop the pulse — the model is done
         thinking. */
      if(thinkClosed&&thinkState.summary.innerHTML.indexOf("thinking-spinner")!==-1){
        var _doneLabel=(typeof window!=="undefined"&&window.t)?window.t("think.title"):"Thought";
        thinkState.summary.innerHTML='<span class="think-summary-label">'+esc(_doneLabel)+'</span><span class="think-summary-chevron" aria-hidden="true"></span>';
      }
      /* Re-render the think content only if it changed. Uses
         formatMsgProgressive for the same reason as the body path
         above: think content is PARTIAL mid-stream, and formatMsg
         assumes closed pairs, so a half-arrived $$…$$ leaks raw
         LaTeX. finish() re-renders via renderAssistantHTML ->
         formatMsg, so the settled look is unchanged. */
      if(thinkState.lastRenderedThink!==thinkContent){
        if(thinkContent){
          try{
            thinkState.thinkDiv.innerHTML=formatMsgProgressive(thinkContent.replace(/<\/?think>/g,""));
            try{processPendingMermaid()}catch(_){}
            try{processPendingViz()}catch(_){}
            try{processPendingVizActions()}catch(_){}
            if(typeof hljs!=="undefined"){
              thinkState.thinkDiv.querySelectorAll("pre code").forEach(function(c){
                if(c.dataset&&c.dataset.hljsDone)return;
                if(/```\s*$/.test(c.textContent||""))return;
                try{window.hljs.highlightElement(c);c.dataset.hljsDone="1"}catch(_){}
              });
            }
          }catch {
            thinkState.thinkDiv.textContent=thinkContent;
          }
        }else{
          thinkState.thinkDiv.innerHTML="";
        }
        thinkState.lastRenderedThink=thinkContent;
      }
    }

    /* P_thinking-panel — surface inline <think> reasoning through the
       same bridge as reasoning_content deltas. The bridge throttles and
       dedupes, so this per-render call is cheap. */
    if(fullReasoning||_extractThinkText(full)){
      _publishThinkingPanelLive();
    }

    /* P-H4 — remember the length we just rendered so an idle trailing
       frame with no new characters short-circuits at the top. */
    _lastParsedLen=displayFull.length;

    /* P1.1 — mirror rawText to stateStore.read("messages") so extractHistory
       and saveCurrentSession see the latest text. html is left
       null until finish() so the saved session never holds a
       half-rendered string.
       P_session-cross-talk — stillOwnsSlot() guards the write so a
       late doRender (rAF queued before abort() but firing after a
       session switch) can't smear the old stream's `full` into the
       new session's messages[msgIdx]. */
    if(stillOwnsSlot()){
      patchOwnedMessage({rawText:full},true);
    }
    followStreamBottom(_streamScroller,_wasPinned);
  }
  var streamContent=null;
  var settledContent=null;
  var liveContent=null;
  var cursor=null;
  /* P_arch typewriter — no chunked bookkeeping needed. The streaming
     surface is a single text node; new deltas are appended by
     overwriting streamContent.textContent on each rAF frame.

     Task 2.4 — the steady-state coalescing is now owned by
     createStreamScheduler (render/streamScheduler.ts). push(delta)
     accumulates network deltas and rAF-gates a single coalesced paint
     at getStreamRenderInterval(acc.length); paint() delegates to
     doRender(), which performs the stable-prefix split promotion.
     The scheduler's rAF seam is bound to the shared `pendingRender`
     slot so the existing cancelScheduledRender() teardown (called on
     abort / finish / segment freeze) cancels a scheduler-queued frame
     as before. doRender()'s own finished/_disposed and _lastParsedLen
     guards keep a stray flush cheap and inert. */
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

  /* ── P_react-live-turn — the live turn's chrome, as data ─────────────
     The waiting dot, the reasoning pill, the retry notice and the timeout
     error block were four DOM appenders that could all appear at once. When
     React owns #msgList they collapse into one field — `message._liveStatus`
     — and react/tool-run/TurnStatus is the only thing that draws it, so a
     turn cannot show two "working on it" lines. `reactLive` picks the
     surface; both branches below carry the same copy. */
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
    /* P_react-live-turn — the single ownership switch. With this true every
       row / panel / host writer in the runtime degrades to its no-row path, so
       it only maintains the data (`_run`, `textOffset`, `_liveOutput`,
       `steps`, `approval`) that react/tool-run renders from. */
    ownsLiveTurn:function(){return reactLive},
    stillOwnsSlot:stillOwnsSlot,
    getMessage:function(){
      return msgIdx>=0?(stateStore.read("messages")[msgIdx]||null):null;
    },
    /* `liveSingleCardSlot` is deliberately unset: the one-row-in-a-slot
       presentation was a live-only surface, and the React renderer groups
       rows from the data instead. */
    ensureToolContainer:_ensureToolContainer,
    /* P_declarative-tool-run — a tool_use landed: record where in `full` the
       answer was, and let the renderer draw the row from that offset.
       `findInlineToolBoundary` rewinds to the last completed paragraph so a
       call that fires mid-sentence never splits it, and segBase always
       advances, which is what keeps two calls firing in the same instant from
       claiming the same offset (buildTurnLayout would drop the duplicate row).
       Nothing is spliced into the prose here any more; on the degraded surface
       (React never mounted) the text host is split at the row so the
       answer continues BELOW it, in chronological order. */
    onInlineTool:function(entry,row){
      var _roff=findInlineToolBoundary(full,segBase);
      if(_roff<segBase)_roff=segBase;
      /* The boundary helper is prose-oriented. With an inline reasoning marker
         open, moving the split point would tear a partial <think> in half, so
         the raw end-of-text offset is the lesser evil. */
      if(!reactLive&&thinkState.startIdx!==-1)_roff=full.length;
      var _prevSegBase=segBase;
      segBase=_roff;
      inlineToolRows.push({id:entry.id,name:entry.name,offset:_roff});
      if(reactLive){
        noteStreamGrowth();
      }else{
        try{placeholder.remove()}catch(_){}
        /* P_tool-order-legacy — freeze the current text host to exactly
           [prevSegBase, _roff) and drop the singleton, so the next
           doRender opens a fresh host BELOW the row. Already-painted
           prose never moves and post-tool text can no longer render
           above the row (the old "rows sink to the bottom" behavior).
           When _roff is the end of text there is nothing to trim, so
           the host is left untouched. */
        if(_roff<full.length&&segHost&&segHost.isConnected){
          try{
            var _frozenSlice=stripCitationMarkers(stripChatArtifacts(full.slice(_prevSegBase,_roff)))
              .replace(/<think>[\s\S]*?<\/think>/gi,"")
              .replace(/<think>[\s\S]*$/gi,"");
            segHost.innerHTML="";
            var _frozen=document.createElement("div");
            _frozen.className="stream-content is-frozen";
            _frozen.innerHTML=formatMsgProgressive(_frozenSlice);
            segHost.appendChild(_frozen);
          }catch(_){}
        }
        segHost=null;streamContent=null;settledContent=null;liveContent=null;cursor=null;
        _stablePrefixText=null;_stablePrefixHtml="";_lastParsedLen=-1;
        if(row){try{body.appendChild(row)}catch(_){}}
        if(_roff<full.length){
          cancelScheduledRender();
          pendingRender=requestAnimationFrame(function(){doRender()});
        }
        var sc=list||scrollContainer();
        if(sc&&!stateStore.read("_userScrolledAway")&&
           sc.scrollHeight-sc.scrollTop-sc.clientHeight<=96){
          sc.scrollTop=sc.scrollHeight;
        }
      }
      /* P_tool-textoffset — return the split point so the tool runtime
         can persist it on synthetic rows created from a late tool_result
         (those never pass through the finish() write-back above). */
      return _roff;
    },
    onToolActivity:function(){
      /* P_tool-order-defer — on the React path the row may be deferred
         behind an unfinished sentence (it mounts once the sentence
         completes). Until then this status line is the only visible
         proof of work; AssistantTurn hides it again the moment the
         real row mounts, so the two never appear together. */
      if(reactLive){
        noteStreamGrowth();
        /* Never overwrite a failure or retry notice (clearLiveStatus
           carried the same guard before this line replaced it). */
        var _cur=liveMessage()&&liveMessage()._liveStatus;
        if(!_cur||(_cur.phase!=="error"&&_cur.phase!=="retrying")){
          setLiveStatus({phase:"tool-running",label:_t("tool.running")});
        }
      }
      hideThinkCtl();
      /* A tool call counts as first visible activity, so retire the
         waiting placeholder before execution progress begins. */
      if(firstDelta&&!finished){
        firstDelta=false;
        clearTimeout(firstDeltaTimer);
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
        /* First delta arrived — stop the watchdog and elapsed counter. */
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
        /* The waiting line is retired with the first real content, exactly
           where the legacy painter called placeholder.remove(). */
        if(reactLive)clearLiveStatus();
        /* Don't finalize the pill on the FIRST delta — many models emit
           a short preamble ("好的,让我搜一下…") before the tool_use
           event, and removing the pill here would leave the user
           staring at a blank bubble while the search actually runs.
           Defer the pill removal until the streaming text reaches
           PILL_HIDE_MIN_CHARS, so short preambles keep the "Thinking…"
           (or whatever label the upcoming tool_use sets) visible. */
      }
      full+=delta;
      /* P_react-live-turn — React renders from this field when the publish
         below flushes, so the mirror has to happen before it. doRender's own
         write stays for the legacy painter and for a late-arriving frame. */
      if(reactLive){
        patchOwnedMessage({rawText:full},true);
        /* Tokens are the proof the retry worked: the notice outlives tool
           activity and thinking stamps by design, so retire it here. */
        var _st=stateStore.read("messages")[msgIdx]._liveStatus;
        if(_st&&_st.phase==="retrying")setLiveStatus(null);
      }
      if(toolRuntime&&typeof toolRuntime.noteTextDelta==="function"){
        try{toolRuntime.noteTextDelta()}catch(_){}
      }
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
       reasoning_content). Routed to a thinking pill (rendered with
       Markdown/LaTeX) and only when the user has thinking mode on. */
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
      if(reactLive){
        noteStreamGrowth();
        setLiveStatus({phase:"retrying",label:_retryLabel,clickable:false});
        return;
      }
      try{
        var retryCtl=ensureThinkCtl();
        if(retryCtl&&typeof retryCtl.setLabel==="function"){
          retryCtl.setLabel(_retryLabel);
        }
      }catch(_){}
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
        clearTimeout(firstDeltaTimer);
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
      clearTimeout(firstDeltaTimer);
      if(_elapsedTick)clearInterval(_elapsedTick);
      cancelScheduledRender();
      /* Cancel any active typewriter animation on tool cards so the
         setTimeout chain doesn't keep updating detached DOM nodes. */
      var _twCards=div.querySelectorAll('.agent-tool-card');
      for(var _twi=0;_twi<_twCards.length;_twi++){
        if(typeof _twCards[_twi]._cancelTypewriter==='function'){
          try{_twCards[_twi]._cancelTypewriter()}catch(_){}
        }
      }
      /* P1.2 — single formatMsg pass at finish time, write to
         stateStore.read("messages")[i].html, and replace the streaming nodes
         with the final innerHTML (which includes the cursor removal).
         This is the only place marked + KaTeX run for the FINAL render; doRender above
         now also uses marked + KaTeX via formatMsgProgressive for live streaming. */
      var total=full.length;
      /* P_react-live-turn — `reactLive`, captured when this bubble was created,
         is the single answer to "which surface owns the finalized DOM?". When it
         is true, React has painted this turn from rawText + toolCalls all along,
         so nothing below touches `body` — the final render is only the `html`
         string that history reload and session save read. When it is false, the
         legacy bubble IS the surface: the swap, the artifact reseat and the
         post-render wiring all run as before. */
      /* P_chunked-fade — the chunk-by-chunk fade-in during streaming<think>")!==-1;
      /* P_chunked-fade — the chunk-by-chunk fade-in during streaming
         is already the "animation". Running typeTick on top of it
         would replay the same content with a second typewriter pass
         on top of the chunks the user just watched appear, which
         looks stuttery. Skip typeTick and go straight to the final
         formatMsg pass. */
      var needsAnimation=false;
      if(needsAnimation){
        /* P1.3 — character-by-character animation driven by a
           single rAF loop with a 16ms budget per frame. Replaces
           the recursive setTimeout(typeTick, 10) which could
           build a long task queue. */
        var savedPill3=body.querySelector('.think-block');
        body.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        cursor=document.createElement("span");
        cursor.className="stream-cursor";
        body.appendChild(streamContent);
        if(savedPill3)body.insertBefore(savedPill3,body.firstChild);
        streamContent.appendChild(cursor);
        var pos=0;
        var CHARS_PER_TICK=4;        /* P1.3 — wider slice per rAF */
        var MAX_MS_PER_FRAME=16;
        var maxTicks=Math.ceil(total/CHARS_PER_TICK);
        var ticks=0;
        var lastTime=0;
        function typeTick(now){
          try{
            if(pos>=total||ticks>=maxTicks){
              /* Final render: renderAssistantHTML parses <quiz>/<example>/<practice>
                 scaffold blocks (replaces them with slot divs), runs formatMsg,
                 then asynchronously mounts interactive widgets in setTimeout(0).
                 Without this, the raw <quiz>…</quiz> XML was either dumped as
                 escaped text or stripped by markdown — the user saw no
                 interactive widgets in live tutor mode. */
              var finalHtml;
              try{finalHtml=buildAssistantHtml(full)}catch {
                console.log("[typeTick] render error");
                finalHtml="<p>"+esc(full)+"</p>";
              }
              body.innerHTML=finalHtml;
              patchOwnedMessage({
                html:finalHtml,type:"assistant",
                reasoningContent:fullReasoning||null
              });
              finishAfterRender();
              return;
            }
            var budget=lastTime?(now-lastTime):MAX_MS_PER_FRAME;
            lastTime=now;
            var step=Math.max(1,Math.floor((budget/MAX_MS_PER_FRAME)*CHARS_PER_TICK));
            pos=Math.min(total,pos+step);
            /* P1.3 — incremental slice; use formatTickSlice to
               preserve markdown boundaries. */
            streamContent.innerHTML=formatTickSlice(full,pos);
            patchOwnedMessage({rawText:full.slice(0,pos)},true);
            ticks++;
            /* Scroll along only if the user hasn't scrolled away. */
            if(!stateStore.read("_userScrolledAway")){
              var sc=scrollContainer();
              if(sc&&sc.scrollHeight-sc.scrollTop-sc.clientHeight<=64){
                sc.scrollTop=sc.scrollHeight;
              }
            }
            requestAnimationFrame(typeTick);
          }catch {
            console.log("[typeTick] render error");
            try{
              var fb=buildAssistantHtml(full);
              body.innerHTML=fb;
              patchOwnedMessage({html:fb});
            }catch(_){
              body.innerHTML="<p>"+esc(full)+"</p>";
            }
            finishAfterRender();
          }
        }
        requestAnimationFrame(typeTick);
        return; /* finishAfterRender runs from inside typeTick */
      }
      try{
        /* P_arch typewriter — at finish, the in-progress raw text is
           sitting in streamContent as a single text node. Replace the
           bubble body with a single renderAssistantHTML pass on the full
           text. renderAssistantHTML internally calls formatMsg, then
           injects <quiz>/<example>/<practice> scaffold slots, then
           asynchronously mounts the interactive widgets in setTimeout(0).
           Without this, no scaffold widgets ever rendered in live mode. */
        var finalHtml;
        try{
          /* P_canvas-mode — seed a stable canvasId on state BEFORE any
             renderAssistantHTML call so the canvas wrapper inside that
             function reuses the same id. Both branches (with/without
             inline tool rows) invoke renderAssistantHTML either directly
             or via _renderSeg, so seeding once at the top covers both. */
          if(window._activeTemplate&&window._activeTemplate.outputMode==='canvas'){
            stateStore.dispatch({
              type:"state/set",key:"_canvasPendingId",
              value:'canvas-'+Math.random().toString(36).slice(2,10)
            });
          }
          /* P_declarative-tool-run — the finalized html carries prose only, on
             every surface: react/tool-run splices the rows in from
             toolCalls[].textOffset, so a second copy baked into `html` would
             render each row twice. The split points captured at tool time are
             stamped onto the entries here — that is what makes the layout
             survive the save/reload round-trip, including on the degraded
             (non-React) surface where no row was ever mounted. */
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
        /* P_stop-spinner — finalize the thinking pill BEFORE saving
           it so the spinner stops spinning once the response is
           complete. Without this, the pill is re-inserted with its
           streaming summary (thinking-ring) and keeps animating. */
        if(thinkCtl&&typeof thinkCtl.finalize==="function"){
          try{thinkCtl.finalize()}catch(_){}
        }
        /* The legacy bubble is the final surface: swap the streamed DOM
           for one renderAssistantHTML pass and carry over the nodes that
           renderAssistantHTML cannot reproduce. Under React there is nothing
           to swap — see the P_react-live-turn note above. */
        if(!reactLive){
          /* P_tool_card_preserve — save BOTH the thinking pill and
             any tool cards we appended via recordToolUse, then
             re-insert them after the formatted HTML. Cards now live
             inside the pill, so saving the pill is sufficient — only
             extract individual cards when there's no pill to host them. */
          var savedPill=body.querySelector('.think-block');
          var savedToolCards=body.querySelectorAll('.agent-tool-card');
          var savedToolCardArr=[];
          /* P_declarative-tool-run — the inline rows the runtime mounted during
             the turn are not in `finalHtml` any more (prose only), so they are
             carried across the innerHTML swap the same way the cards are. A row
             still spinning at this point had no result arrive: settle it from
             the message so the saved DOM does not carry a perpetual spinner. */
          var savedInlineRows=[];
          (function(){
            var rows=body.querySelectorAll('.tool-inline');
            for(var rri=0;rri<rows.length;rri++){
              var _row=rows[rri];
              if(_row.getAttribute("data-state")==="running"){
                try{
                  settleInlineToolRowFromMessage(_row,msgIdx>=0?(stateStore.read("messages")[msgIdx]||null):null);
                }catch(_){}
              }
              savedInlineRows.push(_row);
              _row.parentNode.removeChild(_row);
            }
          })();
          /* P_inline-artifact-survival-finish — the final render at
             finish() rewrites body's innerHTML. Tool cards are saved
             and re-mounted above, but inline artifacts (plots and native
             visualization cards) need the same treatment or they silently
             vanish at the streaming→final boundary. Anchored attachment
             hosts (`.tool-inline-attachments`, created by toolRuntime
             right after an inline tool row) are saved whole so the chart
             can be re-seated next to its serialized row below. */
          var savedArtifacts=[];
          var anchoredHosts=body.querySelectorAll('.tool-inline-attachments');
          for(var ahi=0;ahi<anchoredHosts.length;ahi++){
            savedArtifacts.push(anchoredHosts[ahi]);
            anchoredHosts[ahi].parentNode.removeChild(anchoredHosts[ahi]);
          }
          var artifactNodes=body.querySelectorAll('.exec-artifact,.visualization-card');
          for(var ai=0;ai<artifactNodes.length;ai++){
            savedArtifacts.push(artifactNodes[ai]);
            artifactNodes[ai].parentNode.removeChild(artifactNodes[ai]);
          }
          if(!savedPill){
            for(var sci=0;sci<savedToolCards.length;sci++){
              savedToolCardArr.push(savedToolCards[sci]);
              savedToolCards[sci].parentNode.removeChild(savedToolCards[sci]);
            }
          }
          /* P_finish-no-flash — swap the streamed DOM for the final render
             synchronously, with no fade. The progressive render is already
             near-identical to the final pass, so an in-place swap in a
             single frame is imperceptible; the old opacity fade read as a
             spontaneous "refresh" after the answer completed.
             P_tool-order-legacy — rows/cards are interleaved at their
             captured offsets (same rule as React buildTurnLayout) instead
             of being parked at the bottom: prose is sliced at the row
             boundaries and each slice is rendered with the same
             renderAssistantHTML pass, so a tool row can never end up
             below prose that arrived after it — and never in the middle
             of a finished sentence (offsets are sentence-snapped at
             capture time). Nodes without a known offset keep the old
             tail behavior. */
          (function(){
            var idToOff={};
            for(var ioi=0;ioi<inlineToolRows.length;ioi++){
              idToOff[inlineToolRows[ioi].id]=inlineToolRows[ioi].offset;
            }
            function nodeOffset(node,attr){
              var id=node&&(node.getAttribute?node.getAttribute(attr):(node.dataset&&node.dataset.tcid));
              if(id!=null&&Object.prototype.hasOwnProperty.call(idToOff,id))return idToOff[id];
              return Infinity;
            }
            var placed=[];
            for(var sri2=0;sri2<savedInlineRows.length;sri2++){
              placed.push({off:nodeOffset(savedInlineRows[sri2],"data-tcid"),node:savedInlineRows[sri2],seq:sri2});
            }
            for(var sci2=0;sci2<savedToolCardArr.length;sci2++){
              placed.push({off:nodeOffset(savedToolCardArr[sci2],"data-tcid"),node:savedToolCardArr[sci2],seq:1000+sci2});
            }
            placed.sort(function(a,b){return (a.off-b.off)||(a.seq-b.seq);});
            var bounds=[];
            for(var pi=0;pi<placed.length;pi++){
              if(placed[pi].off!==Infinity&&placed[pi].off>=0&&placed[pi].off<=full.length){
                if(!bounds.length||bounds[bounds.length-1]!==placed[pi].off)bounds.push(placed[pi].off);
              }
            }
            function renderProseSlice(a,b){
              if(b<=a)return;
              var slice=stripChatArtifacts(full.slice(a,b))
                .replace(/<think>[\s\S]*?<\/think>/gi,"")
                .replace(/<think>[\s\S]*$/gi,"");
              if(!slice.trim())return;
              var host=document.createElement("div");
              host.className="stream-segment is-final";
              try{host.innerHTML=buildAssistantHtml(slice);}
              catch(_){host.innerHTML="<p>"+esc(slice)+"</p>";}
              body.appendChild(host);
            }
            body.innerHTML="";
            if(savedPill)body.appendChild(savedPill);
            var prev=0,ni=0;
            for(var bi=0;bi<bounds.length;bi++){
              renderProseSlice(prev,bounds[bi]);
              prev=bounds[bi];
              while(ni<placed.length&&placed[ni].off===bounds[bi]){
                body.appendChild(placed[ni].node);ni++;
              }
            }
            renderProseSlice(prev,full.length);
            while(ni<placed.length){
              body.appendChild(placed[ni].node);ni++;
            }
          })();
          /* Re-mount saved artifacts AFTER the final HTML + tool cards.
             Anchored hosts go back beside their serialized inline row
             (data-tool-anchor → [data-tcid]) so charts stay embedded in
             the response flow; everything else falls to the bottom. */
          for(var ai2=0;ai2<savedArtifacts.length;ai2++){
            reseatSavedArtifact(body,savedArtifacts[ai2]);
          }
          if(cursor){cursor.remove();cursor=null}
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
          if(_om==='canvas'){
            _finalPatch.canvasId=stateStore.read("_canvasPendingId")||('canvas-'+Math.random().toString(36).slice(2,10));
            _finalPatch._extensionIcon=(window._activeTemplate&&window._activeTemplate.icon)||'';
          }
          patchOwnedMessage(_finalPatch);
          stateStore.dispatch({type:"state/set",key:"_canvasPendingId",value:null});
        }
      }catch {
        console.log("[finish] formatMsg error");
        var fb="<p>"+esc(stripChatArtifacts(full).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,""))+"</p>";
        /* Same rule as the success path: only touch the legacy body when
           it IS the final surface. */
        if(!reactLive){
          var savedPill2=body.querySelector('.think-block');
          var savedRows2=body.querySelectorAll('.tool-inline');
          var savedRowsArr2=[];
          for(var rri2=0;rri2<savedRows2.length;rri2++){
            savedRowsArr2.push(savedRows2[rri2]);
            savedRows2[rri2].parentNode.removeChild(savedRows2[rri2]);
          }
          var savedTC2=body.querySelectorAll('.agent-tool-card');
          var savedTCArr2=[];
          if(!savedPill2){
            for(var sci3=0;sci3<savedTC2.length;sci3++){
              savedTCArr2.push(savedTC2[sci3]);
              savedTC2[sci3].parentNode.removeChild(savedTC2[sci3]);
            }
          }
          body.innerHTML=fb;
          if(savedPill2)body.insertBefore(savedPill2,body.firstChild);
          for(var sri3=0;sri3<savedRowsArr2.length;sri3++){
            body.appendChild(savedRowsArr2[sri3]);
          }
          for(var sci4=0;sci4<savedTCArr2.length;sci4++){
            body.appendChild(savedTCArr2[sci4]);
          }
        }
        /* Without flipping type here the entry stays "streaming": React
           would filter it out after the legacy bubble is released. */
        patchOwnedMessage({
          html:fb,rawText:full,type:"assistant",
          reasoningContent:fullReasoning||null
        });
      }
      finishAfterRender();

      function finishAfterRender(){
        /* P_smooth-handoff — post-render wiring targets the DOM that
           will actually stay on screen. In the React path the streamed
           body is dropped a frame later and MessageItem's
           useLayoutEffect runs the same idempotent hooks on the React
           body after each commit; running them here as well re-rendered
           mermaid and re-wired code blocks on a throwaway body. */
        if(!reactLive){
          try{processPendingMermaid()}catch(_){}
          try{processPendingViz()}catch(_){}
          try{processPendingVizActions()}catch(_){}
          try{wireCodeBlockHeaders(body)}catch(_){}
          try{wireMsgBodyImages(body)}catch(_){}
        }
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
        }else{
          try{
            var _finLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
            if(_finLegacy && !_finLegacy.hasAttribute("data-react-owned") && _finLegacy.parentNode===list){
              list.removeChild(_finLegacy);
            }
          }catch(_){}
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
      clearTimeout(firstDeltaTimer);
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
      var _reactAbortHandoff=reactLive;
      if(abortedMessage&&!hasPartial&&abortedMessage.type==="streaming"){
        stateStore.dispatch({
          type:"session/remove-message-at",index:msgIdx,clientId:clientId
        });
        abortedMessage=null;
      }
      /* Cancel any active typewriter animation on tool cards */
      var _twCardsAb=div.querySelectorAll('.agent-tool-card');
      for(var _twAb=0;_twAb<_twCardsAb.length;_twAb++){
        if(typeof _twCardsAb[_twAb]._cancelTypewriter==='function'){
          try{_twCardsAb[_twAb]._cancelTypewriter()}catch(_){}
        }
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
        if(reactLive){
          /* Same rule as replaceWithError: the declarative renderer has no host
             for the html-resend affordance, so the stopped line is data. */
          setReactLiveStatus(abortedMessage,{
            phase:"stopped",label:_t("chat.stopped")||"Response stopped"
          });
          claimLiveRetry(ret,function(){
            try{resendLastUserMessage()}catch(_){/* resend handler threw */}
          });
        }
        if(!_reactAbortHandoff)body.innerHTML=stoppedHtml;
        /* Delegate the Resend click on the list (button DOM is React-owned
           after the next paint in React mode, and legacy body in legacy mode
           both bubble to `list`). One-shot: detaches after firing. */
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
      /* In legacy mode the existing bubble is the durable surface and must
         stay. In React mode publish first, then remove only the throwaway
         shell on the next frame. */
      publishReactChatRuntime({
        type:"stream-aborted",
        messageId:clientId,
        textLength:full.length
      });
      if(_reactAbortHandoff){
        requestAnimationFrame(function(){
          try{
            var _abLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
            if(_abLegacy&&!_abLegacy.hasAttribute("data-react-owned")&&_abLegacy.parentNode===list){
              list.removeChild(_abLegacy);
            }
          }catch(_){ }
        });
      }else if(!hasPartial){
        requestAnimationFrame(function(){try{div.remove()}catch(_){ }});
      }
    },
    /* Show an inline error state with a retry button so the user can
       recover from a transient failure (network, 429, 5xx) without
       retyping. onRetry() is invoked when the button is clicked. */
      replaceWithError:function(errMsg,onRetry){
        if(finished)return;
        finished=true;
        _publishThinkingPanelEnd();
        toolRuntime.cancel();
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        /* Cancel typewriter animations before replacing body content */
        var _twErr=div.querySelectorAll('.agent-tool-card');
        for(var _te=0;_te<_twErr.length;_te++){
          if(typeof _twErr[_te]._cancelTypewriter==='function'){try{_twErr[_te]._cancelTypewriter()}catch(_){}}
        }
       try{
         var partialHtml="";
         if(full.trim()){
           try{partialHtml=buildAssistantHtml(full)}catch(_){partialHtml="<p>"+esc(full)+"</p>"}
         }
         var errHtml=partialHtml+'<div class="msg-error">'+
             '<span class="msg-error-text">'+esc(errMsg||'Generation failed')+'</span>'+
              '<button type="button" class="msg-retry-btn" id="'+retryBtnId+'">Retry</button>'+
            '</div>';
          /* React owns #msgList — serialize the error into the snapshot
             so React re-renders a finalized error bubble. The placeholder
             `btn` (just an id, no addEventListener) triggers the
             delegation branch below for click handling. */
          if(ownsMessageSlot()){
            var _errorMessage=patchOwnedMessage({html:errHtml,type:"assistant"});
            /* P_react-live-turn — a turn that has already drawn tool rows is
               rendered declaratively, where the error markup inside `html` has
               no host. The status line is that error's other half. */
            if(reactLive&&_errorMessage){
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
         body.innerHTML='<p>'+esc(errMsg||'Generation failed')+'</p>';
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
     bubble immediately instead of leaving it pinned until its 45 s
     first-delta timer fires. The next addStreamingMessage() call will
     overwrite turnState.activeChatCtl with its own controller. */
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
