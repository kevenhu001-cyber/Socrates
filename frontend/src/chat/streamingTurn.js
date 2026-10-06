/* chat/streamingTurn.js — streaming turn factory (addStreamingMessage).
 * React owns the bubble: prose paints from `rawText`, tool rows from
 * `toolCalls[].textOffset`, and the turn chrome from `_liveStatus`.
 * This module owns the data those render from (full/fullReasoning,
 * status stamps, tool runtime wiring), plus session guards, viewport
 * anchoring, persistence (save/session stats) and retry/resend.
 * It never paints message content itself.
 *
 * What used to live in this single function and where it went during the
 * 2026-10 split:
 *   finish-time viewport capture + RAF settle — chat/turn/finishViewport.js
 *   live-status chrome + thinking-panel publishes — chat/turn/statusChrome.js
 *   finish-time single formatMsg pass + canvas mode writeback — chat/turn/finishRender.js
 *   user-stop (abort) body — chat/turn/abortPath.js
 *   replaceWithError body — chat/turn/errorPath.js
 */
import { stateStore } from '../state/store.js';
import { turnState, streamRetryViewport } from './turnState.js';
import { setChatStopState, markTurnInProgress, markTurnEnded, quietTurn } from './turnUi.js';
import { registerLiveTurnRuntime, claimLiveSearchRetry } from './liveTurn.js';
import { generateId } from '../util/ids.js';
import { hideNewReplyPill } from '../ui/scrollPill.js';
import { isMsgListMounted } from '../ui/msgListMount.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { setReactLiveStatus } from '../ui/messageSnapshot.js';
import { createStreamPlayer } from '../render/streamPlayer.js';
import {
  scheduleActiveTurnToTop,
  turnAnchorReserve,
  TURN_ANCHOR_TOP_OFFSET,
} from './turnAnchor.ts';
import { createToolRuntime } from './toolRuntime.js';
import { esc } from '../render/helpers.js';
import { stripChatArtifacts } from '../util/stripChatArtifacts.js';
import { scrollContainer, isPinnedToBottom } from '../ui/scroll.js';
import { announceTranscript } from '../ui/liveRegion.js';
import { saveCurrentSession } from '../session/persistence.js';
import { updateChatStats } from './stats.js';
import { appendLocalMemory } from '../storage/localMemory.js';
import { createStatusChrome } from './turn/statusChrome.js';
import { createFinishRender } from './turn/finishRender.js';
import { createFinishViewport } from './turn/finishViewport.js';
import { createAbortPath } from './turn/abortPath.js';
import { createErrorPath } from './turn/errorPath.js';
import { reportSwallow } from '../util/reportSwallow.ts';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) { reportSwallow(e, 'streamingTurn._t.prefLookup'); }
  return fallback != null ? fallback : key;
}
function _appMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (e) { reportSwallow(e, 'streamingTurn._appMode.readGlobal'); }
  return 'chat';
}
/* Smooth streaming decouples the network-arrival stream from the visual
   playback stream: upstream deltas only fill a buffer, and an adaptive
   playback clock reveals characters at a steady visual rate so an upstream
   burst or stall never reaches the reader as a jump or a freeze. It is on by
   default; a kill switch (window.__socratesSmoothStream === false, or
   localStorage 'socrates:smoothStream' === 'off') falls back to painting the
   whole arrived text every frame — the pre-player behaviour — for debugging
   or if a provider interaction ever misbehaves. */
function _smoothStreamEnabled() {
  try {
    if (typeof window !== 'undefined' && window.__socratesSmoothStream === false) return false;
    if (typeof localStorage !== 'undefined'
        && localStorage.getItem('socrates:smoothStream') === 'off') return false;
  } catch (e) { reportSwallow(e, 'streamingTurn._smoothStreamEnabled.readPref', 'expected'); }
  return true;
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
  var clientId=(opts&&opts.clientId)?opts.clientId:("msg-"+generateId());
  div.dataset.clientId=clientId;
  /* P_stream-start-reserve — the assistant placeholder is published to the
     runtime bridge before this turn's leading reserve is laid out. Without
     a pre-stamped reserve, the first React commit paints the bubble at its
     natural height (status pill + cursor only, ~28px) and the new row
     shrinks the transcript's scroll range by several hundred pixels — the
     browser clamps scrollTop, the reader's position snaps to the new
     bottom, and the prompt slides into view only when
     scheduleActiveTurnToTop() measures the layout two frames later. The
     reserve stamped here lives on the message entry, so MessageItem reads
     it on its first commit and the bubble paints with the right height
     synchronously; no second layout pass, no position snap, no reload
     flicker. The user bubble's own size is the only thing that has just
     changed, so we measure *its* post-commit height in a rAF, then stamp
     the reserve onto the assistant entry before the chat-runtime bridge
     publishes the new revision — the order keeps React's commit cycle
     one and only one. */
  var _initialReserve=0;
  var _initialTargetOffset=TURN_ANCHOR_TOP_OFFSET;
  try {
    if (list && typeof turnAnchorReserve === 'function') {
      var _listStyles=(typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(list) : null;
      var _listBottomPad=_listStyles ? (parseFloat(_listStyles.paddingBottom) || 0) : 0;
      var _latestUser=list.querySelector ? list.querySelector('.msg.user:last-of-type') : null;
      var _promptHeight=_latestUser ? _latestUser.getBoundingClientRect().height : 0;
      _initialReserve=turnAnchorReserve(
        list.clientHeight,
        _promptHeight,
        _listBottomPad,
      );
    }
  } catch (e) { reportSwallow(e, 'streamingTurn._listStyles.measureReserve'); }

  var msgIdx=stateStore.dispatch({type:"session/append-message",payload:{
    clientId:clientId,
    role:"assistant",
    rawText:"",
    html:null,
    type:"streaming",
    actions:null,
    _turnAnchorMinHeight: _initialReserve > 0 ? _initialReserve : undefined,
    _turnAnchorMode: _initialReserve > 0 ? 'turn' : undefined,
    _turnViewportTarget: _initialReserve > 0 ? _initialTargetOffset : undefined,
  }});
  publishReactChatRuntime({type:"stream-started",messageId:clientId});

  /* Shared turn state — passed to every helper factory below so the
     extracted modules can read/mutate the same closure-bound values
     the original in-function locals held. Anything the streaming hot
     path mutates (full, finished, _disposed, thinkCtl, inlineToolRows,
     _elapsedTick) lives on this object; functions close over it. */
  var state={
    /* identity / DOM refs (set once) */
    list: list, div: div, clientId: clientId, msgIdx: msgIdx,
    reactLive: reactLive,
    retryBtnId: "retry-"+Math.random().toString(36).slice(2,10),
    onRetry: onRetry,
    /* mutable streaming data */
    full: "",
    fullReasoning: "",
    finished: false,
    _disposed: false,
    _elapsedTick: null,
    thinkCtl: null,
    inlineToolRows: [],
    _streamScheduler: null,
    /* runtime singletons (filled in below) */
    toolRuntime: null,
    cancelScheduledRender: function(){},
    ownsMessageSlot: function(){return false},
    patchOwnedMessage: function(){return null},
    _publishThinkingPanelEnd: function(){},
    _publishThinkingPanelStart: function(){},
    _publishThinkingPanelLive: function(){},
    // Only turnState owns the active controller and global streaming flags.
    ret: null,
    /* utilities */
    t: _t,
    appMode: _appMode,
  };
  /* P_smooth-stream — `full` is the ARRIVED text (persistence, the finish()
     one-shot render, and tool textOffsets all index into it). `_visibleLen`
     is how much of it the playback clock has revealed; the live bubble paints
     `full.slice(0,_visibleLen)`. With smooth streaming off, the two are kept
     equal so the reader sees the whole arrived text as before. `_playbackState`
     drives the cursor animation (playing/starved/draining/done). */
  var _smooth=_smoothStreamEnabled();
  var _visibleLen=0;
  var _playbackState="idle";
  /* P_reasoning-persist — accumulate reasoning_content deltas so we
     can save them to stateStore.read("messages") at finish() and include them in
     the session-save payload. Without this, chain-of-thought text
     from DeepSeek / QwQ / o1-style models is rendered in the DOM
     during streaming but lost on reload. */

  /* Thinking pill (for chat-mode reasoning_content). Data-only: the status
     line is written to `message._liveStatus` and drawn by TurnStatus. */

  /* Build the status chrome BEFORE the chrome helpers are called below.
     P_session-stream-dispose / P_session-cross-talk — sticky flag and
     session-slot guards are owned by the helpers above; status chrome
     only mirrors state, it does not own it. */
  var statusChrome=createStatusChrome(state);
  state._publishThinkingPanelStart=statusChrome.publishThinkingPanelStart;
  state._publishThinkingPanelLive=statusChrome.publishThinkingPanelLive;
  state._publishThinkingPanelEnd=statusChrome.publishThinkingPanelEnd;

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
    if(state._disposed||state.finished)return false;
    return ownsMessageSlot();
  }
  function patchOwnedMessage(patch,deferNotify){
    if(!ownsMessageSlot())return null;
    return stateStore.dispatch({
      type:"session/update-message",index:msgIdx,clientId:clientId,
      patch:patch,deferNotify:deferNotify===true
    });
  }
  state.ownsMessageSlot=ownsMessageSlot;
  state.patchOwnedMessage=patchOwnedMessage;
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
    if(state._streamScheduler){state._streamScheduler.dispose()}
  }
  state.cancelScheduledRender=cancelScheduledRender;
  var suppressedThinkCtl={append:function(){},finalize:function(){},remove:function(){}};
  /* The React surface of the same controller: every mutation is a write to
     `message._liveStatus`, never a node. TurnStatus draws it. */
  var reactThinkCtl={
    append:function(){},
    finalize:function(){clearLiveStatus()},
    remove:function(){clearLiveStatus()},
    setLabel:function(text,state2){
      if(statusIsBusy())return;
      setLiveStatus({phase:"thinking",label:String(text||""),
        state:state2||"",clickable:_appMode()==="chat"});
    }
  };
  function hideThinkCtl(){
    if(state.thinkCtl&&typeof state.thinkCtl.remove==="function"){
      try{state.thinkCtl.remove()}catch(e){reportSwallow(e, 'streamingTurn.hideThinkCtl.remove');/* status may already be detached */}
    }
    state.thinkCtl=null;
  }
  function clearLiveStatus(){
    if(!statusIsBusy())setLiveStatus(null);
  }
  function statusIsBusy(){
    var msg=statusChrome.liveMessage();
    var prev=msg&&msg._liveStatus;
    return !!(prev&&(prev.phase==="error"||prev.phase==="retrying"||prev.phase==="tool-running"));
  }
  function setLiveStatus(st){
    var msg=statusChrome.liveMessage();
    if(msg)setReactLiveStatus(msg,st);
  }
  /* P_declarative-tool-run — where in `full` the answer was when each tool_use
     landed. inlineToolRows is the {id,name,offset} ledger finish() stamps
     onto toolCalls[] as `textOffset`, which is the sole input react/tool-run
     needs to lay the rows out. */
  function ensureThinkCtl(){
    /* Tool activity owns the single live status line. Keep the reasoning
       buffer in memory, but do not mount a second loading indicator while
       a tool is running. The next reasoning delta after all tools
       settle can create the pill again. */
    if(state.toolRuntime&&typeof state.toolRuntime.hasActiveTools==="function"&&state.toolRuntime.hasActiveTools()){
      return suppressedThinkCtl;
    }
    /* The status line is data drawn by TurnStatus — there is no pill DOM. */
    state.thinkCtl=reactThinkCtl;
    statusChrome.stampThinking();
    return reactThinkCtl;
  }
  /* Unique ID for the retry button so we can attach a click handler after
     setting innerHTML (innerHTML wipes previous listeners). */
  /* The waiting line is data drawn by TurnStatus. stampWaiting(0) paints
     the first frame immediately so a fast first delta still had a visible
     predecessor state in the status history. There is deliberately no
     first-delta watchdog: a reasoning model may think for as long as it
     needs, so the waiting line stays up until real content arrives or the
     user stops the turn. */
  statusChrome.stampWaiting(0);
  scheduleActiveTurnToTop(list,div,msgIdx,retryViewport);
  /* Morph the send button into a red Stop so the user can abort
     the stream. setChatStopState(false) on finish/abort. */
  turnState.chatStreaming=true;
  try{setChatStopState(true)}catch(e){reportSwallow(e, 'streamingTurn.start.setChatStopState'); }
  /* Task 4.1 — record turn-in-progress + Resend target (latest user msg). */
  try{markTurnInProgress()}catch(e){reportSwallow(e, 'streamingTurn.start.markTurnInProgress'); }
  var thinkStarted=Date.now();
  /* Phase-based reassurance keeps the status line visibly alive without a
     twitchy elapsed-seconds counter that can read like a stalled request. */
  var _elapsedTick=null;
  _elapsedTick=setInterval(function(){
    if(state.finished||!firstDelta)return;
    statusChrome.stampWaiting(Math.round((Date.now()-thinkStarted)/1000));
  },1000);
  state._elapsedTick=_elapsedTick;

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
    if(state.finished||state._disposed)return;

    /* AssistantTurn paints this turn's prose from `rawText`, so this
       pass only mirrors the data and keeps the thinking panel fed.
       Viewport position is owned by chat/turnAnchor.ts.
       P_smooth-stream — the visible text is the played prefix, not the whole
       arrived buffer, so an upstream burst/stall reaches the reader as a
       steady reveal. `_playbackState` rides along for the cursor animation. */
    if(stillOwnsSlot()){
      var _visible=state._smooth?state.full.slice(0,_visibleLen):state.full;
      patchOwnedMessage({rawText:_visible,_playbackState:_playbackState},true);
      publishReactChatRuntime({type:"stream-delta",messageId:clientId,textLength:_visible.length});
    }
    if(state.fullReasoning||statusChrome.extractThinkText(state.full)){
      statusChrome.publishThinkingPanelLive();
    }
  }
  /* P_smooth-stream — the playback player decouples arrival from playback.
     push(delta) only fills the buffer; onFrame reveals the played prefix at
     an adaptive rate via doRender(). onStateChange feeds the cursor animation.
     onDone fires after finish()'s beginDrain() flushes the buffer — that is
     where the one-shot final render runs (set into _finishContinuation).
     The rAF seam is bound to the shared `pendingRender` slot so
     cancelScheduledRender() teardown cancels a player-queued frame. */
  var _finishContinuation=null;
  var _streamPlayer=createStreamPlayer({
    onFrame:function(_visibleText,_frame){
      _visibleLen=_visibleText.length;
      _playbackState=_frame.state;
      doRender();
    },
    onStateChange:function(_state){
      _playbackState=_state;
      /* A state flip with no revealed chars (e.g. entering starved) still
         needs a paint so the cursor animation updates. */
      if(!state.finished&&!state._disposed&&stillOwnsSlot()){
        patchOwnedMessage({_playbackState:_state},true);
        publishReactChatRuntime({type:"stream-delta",messageId:clientId,textLength:_visibleLen});
      }
    },
    onDone:function(){
      var _cont=_finishContinuation;
      _finishContinuation=null;
      if(typeof _cont==="function"){try{_cont()}catch(e){reportSwallow(e, 'streamingTurn.doRender.finishContinuation'); }}
    },
    now:function(){return performance.now()},
    raf:function(cb){pendingRender=requestAnimationFrame(cb)}
  });
  /* Legacy alias so cancelScheduledRender()'s teardown (which disposes the
     stream driver) keeps working unchanged. */
  state._streamScheduler=_streamPlayer;
  state._smooth=_smooth;

  /* First delta renders immediately so the user sees content right away */
  var firstDelta=true;

  /* P_tool_retry_button — Retry buttons on failed inline tool rows
     dispatch a `tool-retry` CustomEvent (toolInline.ts). The delegated
     listener below routes to this handler. Falls back to window scope
     for share/history replay. */
  var _onSearchRetry=function(query, detail){
    /* P_tool_retry_prompt — `detail.prompt` carries a verbatim repair
       request (e.g. a failed visualization feeding its client-side
       error back to the model). It bypasses the "Please retry the
       search:" prefix, which only makes sense for search rows. */
    const promptText=String((detail&&detail.prompt)||'').trim();
    const text=String(query||'').trim();
    const retryText=promptText||(text?('Please retry the search: '+text):'');
    if(!retryText)return;
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

  /* React commits the growth in its own rAF, which runs before doRender's
     scroll pass — so "was the reader at the bottom?" has to be answered when
     the delta arrives, not after the DOM already grew. */
  var _growthMeasuredAt=-1e9;
  function noteStreamGrowth(){
    if(!state.reactLive)return;
    /* A token burst can deliver dozens of chunks inside one frame, and each
       read below forces a synchronous layout. The DOM cannot have changed
       between chunks in the same frame, so only the first call pays for the
       measurement. */
    var _now=(typeof performance!=="undefined"&&performance.now)?performance.now():Date.now();
    if(_now-_growthMeasuredAt<16)return;
    _growthMeasuredAt=_now;
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
      return ownsMessageSlot()?(stateStore.read("messages")[msgIdx]||null):null;
    },
    updateMessage:function(patch){patchOwnedMessage(patch)},
    /* P_declarative-tool-run — a tool_use landed: record where in `full` the
       answer was (the RAW fire position — end of what has streamed so far),
       and let the renderer derive the row position from that offset.
       P_tool-order-paragraph places the row after the paragraph in progress
       (a framing sentence the model writes AFTER the call stays above the
       row); rewinding here to the last completed paragraph is what used to
       strand rows BEFORE their own paragraph. segBase always advances,
       which is what keeps two calls firing in the same instant from
       claiming the same offset (buildTurnLayout would drop the duplicate
       row). */
    onInlineTool:function(entry,_row){
      var _roff=state.full.length;
      if(_roff<segBase)_roff=segBase;
      segBase=_roff;
      state.inlineToolRows.push({id:entry.id,name:entry.name,offset:_roff});
      noteStreamGrowth();
      /* P_tool-textoffset — return the split point so the tool runtime
         can persist it on synthetic rows created from a late tool_result
         (those never pass through the finish() write-back above). */
      return _roff;
    },
    onToolActivity:function(toolName){
      /* P_tool-order-defer — the row may be deferred behind an unfinished
         paragraph (it mounts once the paragraph completes). Until then this
         status line is the only visible proof of work; AssistantTurn hides
         it again the moment the real row mounts, so the two never appear
         together. Never overwrite a failure or retry notice. */
      noteStreamGrowth();
      var _cur=statusChrome.liveMessage()&&statusChrome.liveMessage()._liveStatus;
      if(!_cur||(_cur.phase!=="error"&&_cur.phase!=="retrying")){
        setLiveStatus({phase:"tool-running",label:_t("tool.running"),toolName:toolName||(_cur&&_cur.toolName)});
      }
      hideThinkCtl();
      /* A tool call counts as first visible activity, so retire the
         waiting status before execution progress begins. */
      if(firstDelta&&!state.finished){
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
  state.toolRuntime=toolRuntime;
  /* P_declarative-tool-run — where in `full` the answer was when each tool_use
     landed. segBase always advances; the inline-tool ledger above pushes the
     offset. finish() stamps `textOffset` onto toolCalls[] from that ledger. */
  var segBase=0;

  /* P_tool_retry_button — claim the route for the delegated `tool-retry`
     listener (registered once, module scope) and hand this turn's runtime to
     the approval bridge, which needs it to outlive finish() when the run is
     paused on a decision. */
  claimLiveSearchRetry(_onSearchRetry);
  registerLiveTurnRuntime(clientId,toolRuntime);

  /* Build the extracted paths now that state.toolRuntime and friends are
     populated. Each factory returns { methodName } bound to the same
     closure-shared state object the streamingTurn.js core still uses. */
  var errorPath=createErrorPath(state);
  var abortPath=createAbortPath(state);
  var finishRender=createFinishRender(state);
  var finishViewport=createFinishViewport(state);

  var ret={
    getClientId:function(){return clientId},
    isFinished:function(){return state.finished},
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
        /* First delta arrived — stop the elapsed counter. */
        if(_elapsedTick)clearInterval(_elapsedTick);
      }
      state.full+=delta;
      if(wasFirst){
        /* P_smooth-stream — the first delta retires the waiting/retrying
           status line, but the TEXT is revealed by the playback clock like
           any other, not dumped synchronously. In fallback mode (_smooth
           off) the player reveals everything each frame, so the behaviour
           matches the old immediate paint. */
        var _curSt=statusChrome.liveMessage()&&statusChrome.liveMessage()._liveStatus;
        var _clearWaiting=_curSt&&(_curSt.phase==="waiting"||_curSt.phase==="retrying");
        if(_clearWaiting){
          var _preRev1=(stateStore.read("messages")[msgIdx]&&stateStore.read("messages")[msgIdx]._toolRunRev)||0;
          patchOwnedMessage({
            _liveStatus:null,
            _toolRunRev:_preRev1+1
          },true);
        }
      }
      /* Every delta only fills the buffer; the player's onFrame reveals the
         played prefix via doRender() at the frame boundary. */
      _streamPlayer.push(delta);
      /* Hide the status pill once the streamed text passes a small
         threshold — anything shorter is almost certainly a
         "好的,让我搜一下…" preamble that the model emits before its
         tool_use, and we want the pill to stay so the upcoming
         "Searching" label has a host. 60 chars is well below any
         substantive answer but well above a typical Chinese/English
         transition phrase. */
      if(state.thinkCtl&&typeof state.thinkCtl.finalize==="function"&&state.full.length>=60){
        try{state.thinkCtl.finalize()}catch(e){reportSwallow(e, 'streamingTurn._preRev1.finalizeLongForm'); }
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
        if(!state.fullReasoning)state._publishThinkingPanelStart();
        state.fullReasoning+=delta;
        statusChrome.publishThinkingPanelLive();
      }
      if(state.toolRuntime&&typeof state.toolRuntime.hasActiveTools==="function"&&state.toolRuntime.hasActiveTools())return;
      try{ensureThinkCtl().append(delta||"")}catch(e){reportSwallow(e, 'streamingTurn._preRev1.appendDelta'); }
    },
    finalizeThinking:function(){
      if(state.thinkCtl&&typeof state.thinkCtl.finalize==="function"){
        try{state.thinkCtl.finalize()}catch(e){reportSwallow(e, 'streamingTurn._preRev1.finalizeThinking'); }
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
      if(state._disposed)return;
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
        state.finished=true;
        state._disposed=true;
        /* Still tear down timers / SSE so nothing leaks. */
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        toolRuntime.dispose();
        publishReactChatRuntime({
          type:"stream-aborted",
          messageId:clientId,
          textLength:state.full.length,
          reason:"session-replaced"
        });
        return;
      }
      if(state.finished)return;
      /* P_smooth-stream — turn end. With smooth streaming on and buffered
         text still unplayed, DRAIN it first: beginDrain() flushes the
         remaining buffer at a boosted rate, and the one-shot final render
         runs in the player's onDone (below, via _finishContinuation) so the
         reader never sees the tail snap to full before the fade. When there
         is nothing left to play (or _smooth is off), flush synchronously and
         run the finish body inline exactly as before. */
      if(_smooth&&_streamPlayer.playedLen()<_streamPlayer.totalLen()){
        _finishContinuation=_finishBody;
        _streamPlayer.beginDrain();
        return;
      }
      _streamPlayer.flushNow();
      _finishBody();

      function _finishBody(){
      if(state.finished)return;
      state.finished=true;
      state._disposed=true;
      state._publishThinkingPanelEnd();
      toolRuntime.dispose();
      if(_elapsedTick)clearInterval(_elapsedTick);
      cancelScheduledRender();
      /* P1.2 — single formatMsg pass at finish time, written to
         stateStore.read("messages")[i].html. React has painted this turn from
         rawText + toolCalls all along, so the final render is only the
         `html` string that history reload and session save read — nothing
         touches the detached shell. */
      /* P_finish-crossfade — the patch + stream-finished publish below
         rebuild the bubble's DOM in one commit (final html replaces the
         live-tail paint, streaming chrome retires, scaffold previews become
         widget slots, think blocks collapse). Wrapped in a scoped view
         transition, the row morphs through a short native cross-fade instead
         of snapping. The update callback also runs finishAfterRender(), whose
         anchor capture reads the still-old DOM — inside the transition the
         new frame is captured two frames later, so the reads stay correct. */
      var _renderResult;
      try{
        _renderResult=finishRender.run();
      } catch {
        console.log("[finish] render error");
        var fb="<p>"+esc(stripChatArtifacts(state.full).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,""))+"</p>";
        var _preRevE=(stateStore.read("messages")[msgIdx]&&stateStore.read("messages")[msgIdx]._toolRunRev)||0;
        patchOwnedMessage({
          html:fb,rawText:state.full,
          type:"assistant",
          reasoningContent:state.fullReasoning||null,
          _streamSettled:true,
          _toolRunRev:_preRevE+1,
        });
      }
      finishAfterRender();
      publishReactChatRuntime({
        type: "stream-finished",
        messageId: clientId,
        textLength: state.full.length,
      });

      function finishAfterRender(){
        /* Post-render wiring (mermaid, viz, code headers, images) runs in
           MessageItem's useLayoutEffect on the React body after each
           commit — running the same hooks here would re-render them on a
           throwaway detached shell. */
        /* Streaming AI bubbles skip addMessage(). React owns #msgList and the
           React MessageToolbar component renders the same action buttons
           from the snapshot, so the legacy toolbar path is unreachable. */
        try{appendLocalMemory("assistant",state.full)}catch(e){reportSwallow(e, 'streamingTurn.finishAfterRender.appendLocalMemory'); }
        /* a11y — the transcript has no live region during streaming (a
           token-cadence announcer floods AT queues), so surface the
           completed reply once here. `visibleFinal` is the prose with
           think blocks / chat artifacts stripped; it is skipped when the
           render path threw and the var was never assigned. */
        var _visibleFinal=_renderResult?_renderResult.visibleFinal:null;
        try{
          if(typeof _visibleFinal==="string"&&_visibleFinal.trim()){
            announceTranscript(_visibleFinal);
          }
        }catch(e){reportSwallow(e, 'streamingTurn.finishAfterRender.announceTranscript'); }
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
          try{setChatStopState(false)}catch(e){reportSwallow(e, 'streamingTurn.finishAfterRender.setChatStopState'); }
          try{markTurnEnded()}catch(e){reportSwallow(e, 'streamingTurn.finishAfterRender.markTurnEnded'); }
          /* P1.4 — clearing the global abort handle on natural finish
             keeps the closure (and DOM refs) eligible for GC. */
          turnState.activeChatCtl=null;
        }
        /* The final pass changes the answer's height (a running row folds
           into its group, the status line retires, KaTeX resolves), and
           neither scrollTop nor distance-from-bottom survives that. Capture
           row identity + viewport offset instead, and re-assert it below.
           Done by chat/turn/finishViewport.js — see that module for the
           full rationale and the per-branch intent comments. */
        finishViewport.capture();
        finishViewport.settle();
      }
      } /* end _finishBody */
    },
    abort: abortPath.abort,
    /* Show an inline error state with a retry button so the user can
       recover from a transient failure (network, 429, 5xx) without
       retyping. onRetry() is invoked when the button is clicked.
       Done by chat/turn/errorPath.js — see that module for the full
       rationale and the retry-button wiring comments. */
    replaceWithError: errorPath.replaceWithError,
  };
  state.ret=ret;
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
