import type { TurnRuntimeState } from './turn/runtimeState.ts';
import type { MessageOwnership } from './turn/messageOwnership.ts';
import type { ToolRuntime } from './toolRuntime.ts';
interface StreamingOptions { clientId?: string; onRetry?: (() => unknown) | null }
interface StreamingState extends TurnRuntimeState {
  body: HTMLElement;
  firstDelta: boolean;
  thinkStarted: number;
  visibleLen: number;
  playbackState: string;
  pendingRender?: number | null;
}
interface StreamingContext {
  state: StreamingState;
  clientId: string;
  msgIdx: number;
  stillOwnsSlot: () => boolean;
  patchOwnedMessage: MessageOwnership['patchOwnedMessage'];
  statusChrome: StatusChrome;
  ensureThinkCtl: ReturnType<typeof createStreamingThinkController>['ensure'];
  setLiveStatus: StatusChrome['setLiveStatus'];
  toolRuntime: ToolRuntime;
  finishLifecycle: ReturnType<typeof createFinishLifecycle>;
  abortPath: ReturnType<typeof createAbortPath>;
  errorPath: ReturnType<typeof createErrorPath>;
}
/* chat/streamingTurn.ts — streaming turn factory (addStreamingMessage).
 * React owns the bubble: prose paints from `rawText`, tool rows from
 * `toolCalls[].textOffset`, and the turn chrome from `_liveStatus`.
 * This module owns the data those render from (full/fullReasoning,
 * status stamps, tool runtime wiring), plus session guards, viewport
 * anchoring, persistence (save/session stats) and retry/resend.
 * It never paints message content itself.
 *
 * What used to live in this single function and where it went during the
 * 2026-10 split:
 *   finish/drain/persistence/status-release lifecycle — chat/turn/finishLifecycle.js
 *   finish-time viewport capture + RAF settle — chat/turn/finishViewport.js
 *   live-status chrome and per-turn status publication — chat/turn/statusChrome.js
 *   finish-time metadata + canvas mode writeback — chat/turn/finishRender.js
 *   user-stop (abort) body — chat/turn/abortPath.js
 *   replaceWithError body — chat/turn/errorPath.js
 */
import { normalizeTurnRuntime, reduceTurnEvent } from '@socrates/core';
import { normalizePublicTurnActivity } from '../ui/turnActivityModel';
import { stateStore } from '../state/store.ts';
import { turnState, streamRetryViewport } from './turnState.ts';
import { setChatStopState, markTurnInProgress, quietTurn } from './turnUi.ts';
import { registerLiveTurnRuntime, claimLiveSearchRetry } from './liveTurn.ts';
import { generateId } from '../util/ids.ts';
import { hideNewReplyPill } from '../ui/scrollPill.ts';
import { isMsgListMounted } from '../ui/msgListMount.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { createStreamPlayer } from '../render/streamPlayer.js';
import { scheduleActiveTurnToTop, turnAnchorReserve, TURN_ANCHOR_TOP_OFFSET, RetryViewportOffset } from './turnAnchor.ts';
import { createToolRuntime } from './toolRuntime.ts';
import { createStatusChrome, StatusChrome } from './turn/statusChrome.ts';
import { createFinishRender } from './turn/finishRender.ts';
import { createFinishViewport } from './turn/finishViewport.ts';
import { createAbortPath } from './turn/abortPath.ts';
import { createErrorPath } from './turn/errorPath.ts';
import { createMessageOwnership } from './turn/messageOwnership.ts';
import { createFinishLifecycle } from './turn/finishLifecycle.ts';
import { toolRunLabel } from '../ui/toolPresentationModel';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function _t(key: string, fallback?: string | null) {
  try {
    if (typeof window !== 'undefined' && typeof browserWindow.t === 'function') {
      const v = browserWindow.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) { reportSwallow(e, 'streamingTurn._t.prefLookup'); }
  return fallback != null ? fallback : key;
}
function _appMode() {
  try {
    if (typeof window !== 'undefined' && browserWindow.appMode) return browserWindow.appMode;
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
    if (typeof window !== 'undefined' && browserWindow.__socratesSmoothStream === false) return false;
    if (typeof localStorage !== 'undefined'
        && localStorage.getItem('socrates:smoothStream') === 'off') return false;
  } catch (e) { reportSwallow(e, 'streamingTurn._smoothStreamEnabled.readPref', 'expected'); }
  return true;
}

function prepareStreamingShell(opts: StreamingOptions){
  hideNewReplyPill();
  const list=document.getElementById("msgList")!;
  const reactLive=isMsgListMounted();
  const div=document.createElement("div");
  div.className="msg assistant";
  div.style.contentVisibility="visible";
  const body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  const clientId=opts.clientId?opts.clientId:("msg-"+generateId());
  div.dataset.clientId=clientId;
  const initialTargetOffset=TURN_ANCHOR_TOP_OFFSET;
  stateStore.dispatch({
    type:'state/batch-actions',
    actions:[
      { type:'state/set', key:'_userScrolledAway', value:false },
      { type:'session/append-message', payload:{
        clientId:clientId,
        role:"assistant",
        rawText:"",
        html:null,
        type:"streaming",
        actions:null,
        branchInfo: turnState.pendingAssistantBranchInfo || null,
        _turnAnchorMinHeight: undefined,
        _turnAnchorMode: undefined,
        _turnViewportTarget: undefined,
      }},
    ],
  });
  turnState.pendingAssistantBranchInfo = null;
  const msgIdx=stateStore.read("messages").length-1;
  publishReactChatRuntime({type:"stream-started",messageId:clientId});
  if (list && typeof turnAnchorReserve === 'function') {
    requestAnimationFrame(function stampTurnReserve(){
      try {
        if (!list || typeof list.getBoundingClientRect !== 'function') return;
        const styles=(typeof window !== 'undefined' && browserWindow.getComputedStyle) ? browserWindow.getComputedStyle(list) : null;
        const bottomPadding=styles ? (parseFloat(styles.paddingBottom) || 0) : 0;
        const latestUser=list.querySelector ? list.querySelector('.msg.user:last-of-type') : null;
        const promptHeight=latestUser ? latestUser.getBoundingClientRect().height : 0;
        const reserve=turnAnchorReserve(list.clientHeight,promptHeight,bottomPadding);
        if (reserve > 0) {
          stateStore.dispatch({
            type:'session/update-message',
            clientId:clientId,
            patch: {
              _turnAnchorMinHeight: reserve,
              _turnAnchorMode: 'turn',
              _turnViewportTarget: initialTargetOffset,
            },
          });
        }
      } catch (error) { reportSwallow(error, 'streamingTurn.stampTurnReserve.measure'); }
    });
  }
  return {
    list:list,
    div:div,
    body:body,
    clientId:clientId,
    msgIdx:msgIdx,
    reactLive:reactLive,
    onRetry:opts.onRetry,
    retryBtnId:"retry-"+Math.random().toString(36).slice(2,10),
  };
}

function createStreamingTurnApi(context: StreamingContext): import("./turnState.ts").StreamingTurnController & { finalizeThinking(): void }{
  const state=context.state;
  function finalizeStreamThinking(reason: string){
    if(!state.thinkCtl||typeof state.thinkCtl.finalize!=="function")return;
    try{state.thinkCtl.finalize()}catch(error){reportSwallow(error,reason);}
  }
  function handleFirstStreamDelta(){
    const message=context.statusChrome.liveMessage();
    const status=message&&message._liveStatus;
    const clears=status&&(
      status.phase==='waiting'||status.phase==='retrying'||
      status.phase==='thinking'||status.phase==='tool-running'
    );
    if(clears){
      const current=stateStore.read('messages')[context.msgIdx];
      const revision=(current&&current._toolRunRev)||0;
      context.patchOwnedMessage({_liveStatus:null,_toolRunRev:revision+1},true);
    }
    finalizeStreamThinking('streamingTurn._preRev1.finalizeOnFirstDelta');
  }
  function appendStreamDelta(delta: any){
    if(!context.stillOwnsSlot())return;
    const wasFirst=state.firstDelta;
    if(wasFirst){
      state.firstDelta=false;
      if(state._elapsedTick)clearInterval(state._elapsedTick);
    }
    state.full+=delta;
    if(wasFirst)handleFirstStreamDelta();
    state._streamPlayer!.push(delta);
    finalizeStreamThinking('streamingTurn._preRev1.finalizeLongForm');
  }

  return {
    getClientId:function(){return context.clientId},
    isFinished:function(){return state.finished},
    recordToolUse:context.toolRuntime.recordToolUse,
    recordToolProgress:context.toolRuntime.recordToolProgress,
    recordToolCallDelta:context.toolRuntime.recordToolCallDelta,
    recordExecutionStart:context.toolRuntime.recordExecutionStart,
    recordToolResult:context.toolRuntime.recordToolResult,
    recordToolApproval:context.toolRuntime.recordToolApproval,
    recordAgentStep:context.toolRuntime.recordAgentStep,
    recordAgentPlan:context.toolRuntime.recordAgentPlan,
    recordTurnSnapshot:function(payload: unknown){
      if(!context.stillOwnsSlot())return;
      const message=stateStore.read("messages")[context.msgIdx];
      const runtime=normalizeTurnRuntime(payload);
      if(!runtime||(message.turnRuntime&&(message.turnRuntime.turnId!==runtime.turnId||message.turnRuntime.seq>=runtime.seq)))return;
      context.patchOwnedMessage({turnRuntime:runtime},false);
      publishReactChatRuntime({type:"tool-run-updated",messageId:context.clientId});
    },
    recordTurnEvent:function(payload: unknown){
      if(!context.stillOwnsSlot())return;
      const message=stateStore.read("messages")[context.msgIdx];
      const runtime=reduceTurnEvent(message.turnRuntime,payload);
      if(!runtime||runtime===message.turnRuntime)return;
      context.patchOwnedMessage({turnRuntime:runtime},false);
      publishReactChatRuntime({type:"tool-run-updated",messageId:context.clientId});
    },
    recordTurnActivity:function(payload: unknown){
      if(!context.stillOwnsSlot())return;
      const activity=normalizePublicTurnActivity(payload);
      if(!activity)return;
      context.patchOwnedMessage({_activity:activity},false);
      publishReactChatRuntime({type:"tool-run-updated",messageId:context.clientId});
    },
    recordTurnSummary:function(text: unknown,phase?: string){
      if(!context.stillOwnsSlot())return;
      const value=String(text||"").trim();
      if(!value)return;
      context.patchOwnedMessage(phase==="initial"?{_taskSummary:value}:{summary:value},false);
      publishReactChatRuntime({type:"tool-run-updated",messageId:context.clientId});
    },
    append:appendStreamDelta,
    appendThinking:function(delta: string|any[]){
      if(!context.stillOwnsSlot())return;
      if(typeof delta!=="string"||!delta.length)return;
      if(!state.fullReasoning)state.thinkStarted=Date.now();
      state.fullReasoning+=delta;
      const seconds=Math.max(0,Math.floor((Date.now()-state.thinkStarted)/1000));
      state.reasoningDurationSec=seconds;
      if(state.toolRuntime&&typeof state.toolRuntime.hasActiveTools==="function"&&state.toolRuntime.hasActiveTools())return;
      try{context.ensureThinkCtl().append(delta||"")}catch(error){reportSwallow(error,'streamingTurn._preRev1.appendDelta');}
      if(context.stillOwnsSlot()){
        context.patchOwnedMessage({reasoningContent:state.fullReasoning,reasoningDurationSec:seconds},true);
        publishReactChatRuntime({type:"stream-delta",messageId:context.clientId,textLength:state.full.length});
      }
    },
    finalizeThinking:function(){
      if(state.thinkCtl&&typeof state.thinkCtl.finalize==="function"){
        try{state.thinkCtl.finalize()}catch(error){reportSwallow(error,'streamingTurn._preRev1.finalizeThinking');}
      }
    },
    setRetryStatus:function(rawNotice: unknown){
      const notice = rawNotice as { retryNumber?: number | string; maxRetries?: number | string };
      if(!context.stillOwnsSlot())return;
      const label="Retrying · "+notice.retryNumber+"/"+notice.maxRetries+" · 5s";
      context.setLiveStatus({phase:"retrying",label:label});
    },
    finish:context.finishLifecycle.finish,
    abort:context.abortPath.abort,
    replaceWithError:context.errorPath.replaceWithError,
  };
}

function installStreamRenderCancellation(state: StreamingState){
  state.pendingRender=null;
  state.cancelScheduledRender=function(){
    if(state.pendingRender){
      cancelAnimationFrame(state.pendingRender);
      state.pendingRender=null;
    }
    if(state._streamPlayer)state._streamPlayer.dispose();
  };
}

function createStreamingRenderController(context: Pick<StreamingContext, 'state' | 'clientId' | 'stillOwnsSlot' | 'patchOwnedMessage'>){
  const state=context.state;
  function doRender(){
    state.pendingRender=null;
    if(state.finished||state._disposed||!context.stillOwnsSlot())return;
    const visible=state._smooth?state.full.slice(0,state.visibleLen):state.full;
    context.patchOwnedMessage({rawText:visible,_playbackState:state.playbackState},true);
    publishReactChatRuntime({type:"stream-delta",messageId:context.clientId,textLength:visible.length});
  }
  state._streamPlayer=createStreamPlayer({
    onFrame:function(visibleText,frame){
      state.visibleLen=visibleText.length;
      state.playbackState=frame.state;
      doRender();
    },
    onStateChange:function(playbackState){
      state.playbackState=playbackState;
      if(state.finished||state._disposed||!context.stillOwnsSlot())return;
      context.patchOwnedMessage({_playbackState:playbackState},true);
      publishReactChatRuntime({type:"stream-delta",messageId:context.clientId,textLength:state.visibleLen});
    },
    now:function(){return performance.now()},
    raf:function(callback){state.pendingRender=requestAnimationFrame(callback)},
  });
  return {
    schedule:function(){state.pendingRender=requestAnimationFrame(doRender)},
  };
}

function createStreamingThinkController(state: StreamingState, statusChrome: StatusChrome){
  const suppressed={append:function(..._args: unknown[]){return undefined},finalize:function(){return undefined},remove:function(){return undefined}};
  const setLiveStatus=statusChrome.setLiveStatus;
  const controller={
    append:function(){
      const seconds=Math.max(0,Math.floor((Date.now()-state.thinkStarted)/1000));
      state.reasoningDurationSec=seconds;
      statusChrome.stampThinking(seconds);
    },
    finalize:statusChrome.clearLiveStatus,
    remove:statusChrome.clearLiveStatus,
    setLabel:function(text: string,phase?: string){
      if(!statusChrome.statusIsBusy())setLiveStatus({phase:"thinking",label:String(text||""),state:phase||""});
    },
  };
  function hide(){
    if(state.thinkCtl&&typeof state.thinkCtl.remove==="function"){
      try{state.thinkCtl.remove()}catch(error){reportSwallow(error,'streamingTurn.hideThinkCtl.remove')}
    }
    state.thinkCtl=null;
  }
  function ensure(){
    if(state.toolRuntime&&typeof state.toolRuntime.hasActiveTools==="function"&&state.toolRuntime.hasActiveTools())return suppressed;
    state.thinkCtl=controller;
    const seconds=Math.max(0,Math.floor((Date.now()-state.thinkStarted)/1000));
    state.reasoningDurationSec=seconds;
    statusChrome.stampThinking(seconds);
    return controller;
  }
  return {ensure:ensure,hide:hide,setLiveStatus:setLiveStatus};
}

function startStreamingTurn(state: StreamingState, statusChrome: StatusChrome, list: HTMLElement, div: HTMLElement, msgIdx: number, retryViewport: RetryViewportOffset | null){
  statusChrome.stampWaiting(0);
  scheduleActiveTurnToTop(list,div,msgIdx,retryViewport);
  turnState.chatStreaming=true;
  try{setChatStopState(true)}catch(error){reportSwallow(error,'streamingTurn.start.setChatStopState')}
  try{markTurnInProgress()}catch(error){reportSwallow(error,'streamingTurn.start.markTurnInProgress')}
  state.thinkStarted=Date.now();
  state._elapsedTick=setInterval(function(){
    if(state.finished)return;
    const seconds=Math.max(0,Math.floor((Date.now()-state.thinkStarted)/1000));
    if(state.firstDelta&&!statusChrome.isThinkingPhase()){
      statusChrome.stampWaiting(seconds);
      return;
    }
    if(statusChrome.isThinkingPhase()){
      state.reasoningDurationSec=seconds;
      statusChrome.stampThinking(seconds);
    }
  },1000);
}

function createSearchRetryHandler(){
  return function(query: string, detail?: unknown){
    const prompt=String((detail && typeof detail === 'object' && 'prompt' in detail ? detail.prompt : '') || '').trim();
    const search=String(query||'').trim();
    const retryText=prompt||(search?('Please retry the search: '+search):'');
    if(!retryText)return;
    if(typeof browserWindow.addMessage==='function')browserWindow.addMessage('user',retryText);
    if(typeof browserWindow.askChatTurn==='function')quietTurn(browserWindow.askChatTurn(retryText));
  };
}

function createStreamingToolRuntime(context: Pick<StreamingContext, 'state' | 'stillOwnsSlot' | 'statusChrome' | 'setLiveStatus'> & { hideThinkCtl: () => void; scheduleRender: () => void }){
  const state=context.state;
  let segmentBase=0;
  const onSearchRetry=createSearchRetryHandler();
  const runtime=createToolRuntime({
    body:state.body,
    ownsLiveTurn:function(){return state.reactLive},
    stillOwnsSlot:context.stillOwnsSlot,
    getMessage:function(){
      return state.ownsMessageSlot()?(stateStore.read('messages')[state.msgIdx]||null):null;
    },
    updateMessage:function(patch){state.patchOwnedMessage(patch)},
    onInlineTool:function(entry){
      let offset=state.full.length;
      if(offset<segmentBase)offset=segmentBase;
      segmentBase=offset;
      state.inlineToolRows.push({id:entry.id,name:entry.name,offset:offset});
      return offset;
    },
    onToolActivity:function(toolName){
      const current=context.statusChrome.liveMessage()?._liveStatus;
      if(!current||(current.phase!=='error'&&current.phase!=='retrying')){
        const activeTool=toolName||current?.toolName||undefined;
        const label=toolRunLabel({name:activeTool},'running').text;
        context.setLiveStatus({phase:'tool-running',label:label,toolName:activeTool});
      }
      context.hideThinkCtl();
      if(state.firstDelta&&!state.finished){
        state.firstDelta=false;
        if(state._elapsedTick)clearInterval(state._elapsedTick);
        state.cancelScheduledRender();
        context.scheduleRender();
      }
    },
    onSearchRetry:onSearchRetry,
  });
  state.toolRuntime=runtime;
  claimLiveSearchRetry(onSearchRetry);
  registerLiveTurnRuntime(state.clientId,runtime);
  return runtime;
}

export function addStreamingMessage(opts: StreamingOptions = {}){
  opts=opts||{};
  const retryViewport=streamRetryViewport.consumeViewport();
  const shell=prepareStreamingShell(opts);
  const onRetry=shell.onRetry;
  const list=shell.list;
  const div=shell.div;
  const body=shell.body;
  const clientId=shell.clientId;
  const msgIdx=shell.msgIdx;
  const reactLive=shell.reactLive;

  /* Shared turn state — passed to every helper factory below so the
     extracted modules can read/mutate the same closure-bound values
     the original in-function locals held. Anything the streaming hot
     path mutates (full, finished, _disposed, thinkCtl, inlineToolRows,
     _elapsedTick) lives on this object; functions close over it. */
  const state: StreamingState={
    /* identity / DOM refs (set once) */
    list: list, div: div, body: body, clientId: clientId, msgIdx: msgIdx,
    reactLive: reactLive,
    retryBtnId: shell.retryBtnId,
    onRetry: onRetry,
    /* mutable streaming data */
    full: "",
    fullReasoning: "",
    firstDelta: true,
    thinkStarted: 0,
    visibleLen: 0,
    playbackState: "idle",
    finished: false,
    _disposed: false,
    _elapsedTick: null,
    thinkCtl: null,
    inlineToolRows: [],
    _streamPlayer: null,
    /* runtime singletons (filled in below) */
    toolRuntime: null!,
    _smooth: false,
    cancelScheduledRender: function(){ return undefined; },
    ownsMessageSlot: function(){return false},
    patchOwnedMessage: function(){return null},

    // Only turnState owns the active controller and global streaming flags.
    ret: null,
    /* utilities */
    t: _t,
    appMode: _appMode,
  };
  /* P_smooth-stream — `full` is the ARRIVED text (persistence and tool textOffsets index into it). `visibleLen`
     is how much of it the playback clock has revealed; the live bubble paints
     `full.slice(0,visibleLen)`. With smooth streaming off, the two are kept
     equal so the reader sees the whole arrived text as before. `playbackState`
     drives the cursor animation (playing/starved/draining/done). */
  const smooth=_smoothStreamEnabled();
  state.visibleLen=0;
  state.playbackState="idle";
  /* P_reasoning-persist — accumulate reasoning_content deltas so they can
     be included in the session-save payload and restored with the turn. */

  /* Thinking pill (for chat-mode reasoning_content). Data-only: the status
     line is written to `message._liveStatus` and drawn by TurnStatus. */

  /* Build the status chrome BEFORE the chrome helpers are called below.
     P_session-stream-dispose / P_session-cross-talk — sticky flag and
     session-slot guards are owned by the helpers above; status chrome
     only mirrors state, it does not own it. */
  const statusChrome=createStatusChrome(state);

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
  const ownerSessionId=stateStore.read("currentSessionId")||null;
  const messageOwnership=createMessageOwnership(state,ownerSessionId,stateStore);
  const ownsMessageSlot=messageOwnership.ownsMessageSlot;
  const stillOwnsSlot=messageOwnership.stillOwnsSlot;
  const patchOwnedMessage=messageOwnership.patchOwnedMessage;
  state.ownsMessageSlot=ownsMessageSlot;
  state.patchOwnedMessage=patchOwnedMessage;
  installStreamRenderCancellation(state);
  const thinking=createStreamingThinkController(state,statusChrome);
  const ensureThinkCtl=thinking.ensure;
  const hideThinkCtl=thinking.hide;
  const setLiveStatus=thinking.setLiveStatus;
  /* The waiting line is data drawn by TurnStatus. stampWaiting(0) paints
     the first frame immediately so a fast first delta still had a visible
     predecessor state in the status history. There is deliberately no
     first-delta watchdog: a reasoning model may think for as long as it
     needs, so the waiting line stays up until real content arrives or the
     user stops the turn. */
  startStreamingTurn(state,statusChrome,list,div,msgIdx,retryViewport);

  state._smooth=smooth;
  const rendering=createStreamingRenderController({
    state:state,
    clientId:clientId,
    stillOwnsSlot:stillOwnsSlot,
    patchOwnedMessage:patchOwnedMessage,
  });
  const scheduleRender=rendering.schedule;
  const toolRuntime=createStreamingToolRuntime({
    state:state,
    stillOwnsSlot:stillOwnsSlot,
    statusChrome:statusChrome,
    setLiveStatus:setLiveStatus,
    hideThinkCtl:hideThinkCtl,
    scheduleRender:scheduleRender,
  });

  /* Build the extracted paths now that state.toolRuntime and friends are
     populated. Each factory returns { methodName } bound to the same
     closure-shared state object the streamingTurn.js core still uses. */
  const errorPath=createErrorPath(state);
  const abortPath=createAbortPath(state);
  const finishRender=createFinishRender(state);
  const finishViewport=createFinishViewport(state);
  const finishLifecycle=createFinishLifecycle(state,ownerSessionId,finishRender,finishViewport);

  const ret=createStreamingTurnApi({
    state:state,
    clientId:clientId,
    msgIdx:msgIdx,
    stillOwnsSlot:stillOwnsSlot,
    patchOwnedMessage:patchOwnedMessage,
    statusChrome:statusChrome,
    ensureThinkCtl:ensureThinkCtl,
    setLiveStatus:setLiveStatus,
    toolRuntime:toolRuntime,
    finishLifecycle:finishLifecycle,
    abortPath:abortPath,
    errorPath:errorPath,
  });
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
