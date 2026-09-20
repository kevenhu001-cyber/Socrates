/* chat/sessionBootstrap.js — extracted from main.js (B3 batch).
 * startSession new-session bootstrap (chat + tutor/diagnostic branches).
 * Zero-behavior-change lift. Turn execution and list surfaces resolve
 * via direct imports (extracted modules) or window.* (main.js-owned).
 */
import { stateStore } from '../state/store.js';
import { turnState } from './turnState.js';
import { saveState } from '../session/saveState.js';
import { isExpectedTurnAbort } from './turnUi.js';
import { askChatTurn } from './turnController.js';
import { detectLanguage } from './lang.js';
import { generateDiagnosticQuestions } from './diagnosticGenerator.js';
import { generateTopicKBNodes } from './topicKbNodes.js';
import {
  buildFallbackDiagnosticQuestions,
  requestTutorExploration,
  shouldAutoSearchTutor,
} from '../tutor/policy.js';
import { fetchWebContext } from './webSearch.js';
import { isSlashCommandPaletteOpen } from './templateSlash.js';
import { addMessage } from './messages.js';
import { saveCurrentSession } from '../session/persistence.js';
import { updateChatStats } from './stats.js';
import { updateKB } from '../ui/knowledgePanel.js';
import { renderDiagQuestion, proceedToTeaching } from '../tutor/diagnosticFlow.js';
import { resetSessionTransients, setCurrentSessionId } from '../session/loader.js';
import { rememberDeletedSession } from '../session/saveState.js';
import { refreshServerSessions } from '../session/recents.js';
import { generateId } from '../util/ids.js';
import { pushChatIdToURL, setChatIdInURL } from '../session/store.js';
import { syncChatModel, getActiveProvider } from '../pickers.js';
import { toggleChatTopBarEls } from '../ui/share.js';
import { updateSendBtn, updateStartBtn } from '../ui/topicSetup.js';
import { publishReactChatRuntime, } from '../ui/reactBridge.js';
import { publishThinkingTurnStart } from '../ui/messageSnapshot.js';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.js';
import { formatMsg } from '../render/markdown.js';
import { apiFetch } from '../util/api.js';
import {
  getComposerMarkdown,
  focusComposer,
} from '../react/composer-input/controller.ts';
import {
  clearComposerPlugins,
  copyComposerPlugins,
  selectedComposerPlugins,
} from '../react/composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../react/composer/pluginCatalog.ts';
import {
  attachments,
  buildMessageContent,
  resetAttachments,
} from '../attachments.js';
import { renderAttachmentChips } from '../attachments/render.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
}
function _webSearchOn() {
  try {
    if (typeof window !== 'undefined' && typeof window.webSearchOn !== 'undefined') return !!window.webSearchOn;
  } catch (_) {}
  return true;
}
function _appMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (_) {}
  return 'chat';
}
function _renderRecents() {
  try { if (typeof window !== 'undefined' && typeof window.renderRecents === 'function') window.renderRecents(); } catch (_) {}
}

export async function startSession(){
  publishThinkingTurnStart();
  /* P_slash-topic — if the slash command palette is open, don't
     start a session; the Enter key will be handled by the palette's
     keydown listener to insert the selected template. */
  if(isSlashCommandPaletteOpen()) return;
  var topic=getComposerMarkdown("topic").trim();
  if(!topic)return;
  /* P_composer-plugins — selected connected apps are a presentation-layer
     context selector. Keep the persisted topic/user bubble clean, while the
     model receives the same natural-language connector hints used by the
     existing slash-app path. */
  var topicPlugins=selectedComposerPlugins("topic").slice();
  var topicForModel=serializeSelectedPluginContext(topicPlugins,topic);
  /* P_file-attachments — snapshot the pending store BEFORE anything can
     reset it. Both branches below call resetAttachments() to clear the
     composer chips; without this snapshot the deferred
     buildMessageContent read an emptied store and the landing-page
     attachments silently vanished from the first turn (the reported
     "uploaded image never reaches the model or history" bug). */
  var startAttachments=Array.isArray(attachments)?attachments.slice():[];
  var startImmediateAttList=startAttachments.slice(0,20).map(function(a){
    return Object.assign({},a);
  });

  /* Deep Research mode — if the extension is active, the landing topic
     is routed to the research agent INSTEAD of a normal first chat turn,
     but it must still go through the full chat-mode startup below
     (session id, view swap, user bubble, Recents save). The old code
     early-returned into launchDeepResearch() here, which posted every
     agent message into the still-hidden #msgList — the topic screen
     stayed up and Begin looked like it did nothing (P_deep-research-view). */
  var _deepResearchOn=false;
  try{ _deepResearchOn=!!window.deepResearchOn; }catch(_){}

  var lang=detectLanguage(topic);
  var tutorExploration={enabled:false,count:0};
  if(_appMode()==="tutor" && !_deepResearchOn){
    tutorExploration=await requestTutorExploration({
      isZh:(_currentLang==="zh"||lang==="zh"),
    });
    if(!tutorExploration)return;
  }

  /* A new session owns a new streaming lifecycle. Retire the previous
     session's controller before changing the session id or replacing its
     messages; doing this later would also abort a placeholder created for
     the new session. */
  if(window._activeChatAbort){try{window._activeChatAbort("new-session")}catch(_){}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  try{delete window.__socratesSyncCtl}catch(_){}

  /* P_send-instant — common state setup. Run BEFORE the branch so both
     chat and tutor modes share the same fresh session identity. The
     individual branches then do their own synchronous view-swap; this
     block stays cheap (no awaits, no network) so the click→view swap
     remains a single task. */
  var newSessId=generateId();
  stateStore.dispatch({type:"state/batch",patch:{
    topic:topic,
    diagIndex:0,
    diagAnswers:[],
    kbNodes:[],
    domain:topic,
    phase:(_appMode()==="chat" || _deepResearchOn)?"chat":"diagnostic",
    currentProjectId:window._nextProjectId||null,
    diagQuestions:[],
    substantiveCount:0,
    stuckCount:0,
    "session.stuckCheckOffered":false,
    "session.stuckCheckRejected":0,
    "session.fourOptionDialog":null
  }});
  /* P_new-session-context-leak — clear the inherited message list so
     saveCurrentSession never carries the previous session's turns under
     the new session id (P_recents-pollution). */
  stateStore.dispatch({type:"session/replace-messages",payload:[]});
  /* P_currentProjectId-leak — reset project binding unless the caller
     explicitly selected one (the Project picker stores it in
     window._nextProjectId before invoking startSession). */
  if(window._nextProjectId){
    window._nextProjectId=null;
  }
  /* Set the new session id BEFORE the view swap. setCurrentSessionId
     publishes a state-synced event that React commits asynchronously,
     but the synchronous state mutations above already happened so the
     first paint of chatView sees the right id without waiting for
     React to flush. pushChatIdToURL only updates window.location, which
     is cheap. */
  setCurrentSessionId(newSessId);
  pushChatIdToURL(stateStore.read("currentSessionId"));

  /* Both chat and tutor sessions eventually land in the same chat composer.
     Move the landing selection before branching into the optional diagnostic
     flow so tutor mode does not lose the selected apps while that screen is
     open. */
  copyComposerPlugins("topic","chat");
  clearComposerPlugins("topic");

  if(_appMode()==="chat" || _deepResearchOn){

    /* STEP 1 — complete the visible swap in the click task. Browser paint
       happens after this task; `startViewTransition` runs its update
       callback a task later, which would defer the user bubble and the
       assistant placeholder out of the interaction frame, so the swap
       itself stays instant and the incoming motion is carried by the
       message entrance (`msgIn`) and the send-time anchor glide. */
    document.getElementById("topicSetup").classList.add("hidden");
    document.getElementById("diagnosticView").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    if (typeof window.hideMainPages === "function") window.hideMainPages();
    toggleChatTopBarEls(true);
    clearLegacyMsgListChildren();

    /* The user turn must precede its assistant placeholder in the
       authoritative message array. The old controller was retired above;
       askChatTurn will explicitly claim this new placeholder. Landing
       attachments ride along immediately (pending stubs resolve into
       fileIds in the deferred patch below). */
    var _startUserClientId = addMessage("user", stateStore.read("topic"), null, null, startImmediateAttList);
    var _startSaveP = saveState.saveInFlight || null;
    var _syncCtl = null;
    if(typeof window.addStreamingMessage === "function"){
      try{
        _syncCtl = window.addStreamingMessage({onRetry:function(){
          try{ console.warn("[chat] sync start retry not wired yet"); }catch(_){}
        }});
      }catch(_){ /* askChatTurn will create the normal controller */ }
    }
    if(_syncCtl){try{window.__socratesSyncCtl=_syncCtl}catch(_){}}

    /* Reset attachments + chips immediately so the topic composer cannot
       leak its draft state into the now-visible chat composer. */
    if(typeof resetAttachments === "function") resetAttachments();
    if(typeof renderAttachmentChips === "function") renderAttachmentChips();
    if(typeof updateSendBtn === "function") updateSendBtn();
    updateKB();
    updateChatStats();

    /* STEP 2 — let the React message commit and send-time anchor land before
       starting network preparation. The visible placeholder remains owned
       by this session throughout the deferred work. */
    setTimeout(async function(){
      /* F2b — flush cross-round transients (search cache, call metadata,
         composer draft, plan fields, _pendingChat*) before assembling the
         first model request. */
      resetSessionTransients();
      /* P_attachments-start — only block on buildMessageContent when
         the topic actually carries attachments (in-flight uploads).
         Plain-text topics skip the await entirely, so the
         click → first-token path is reduced to one macrotask. The
         snapshot (not the now-reset live store) is what gets built. */
      var _hasStartAttach = startAttachments.length > 0;
      var builtP = (_hasStartAttach && typeof buildMessageContent === "function")
        ? buildMessageContent(topicForModel, startAttachments)
        : Promise.resolve({ rawText: topicForModel, parts: topicForModel, attachmentList: [] });
      var startBuilt;
      try {
        /* addMessage started the initial save synchronously. Await that same
           request instead of starting a duplicate POST so createChatTurn can
           attach to the new session row. The placeholder is already visible
           while this and attachment preparation run. */
        if(!_startSaveP){
          try{_startSaveP=saveCurrentSession()}catch(_){_startSaveP=null}
        }
        [startBuilt] = await Promise.all([builtP, Promise.resolve(_startSaveP)]);
      } catch {
        startBuilt = { rawText: topicForModel, parts: topicForModel, attachmentList: [] };
      }
      var startChatContent = startBuilt.parts || topicForModel;
      var startPersistText = stateStore.read("topic");
      var startAttList = Array.isArray(startBuilt.attachmentList) ? startBuilt.attachmentList : [];
      turnState.pendingChatContent = startChatContent;
      turnState.pendingAttachments = startAttList;
      /* Patch the user bubble in place if attachments arrived late
         (uploads resolve their fileId asynchronously). React's message
         list reads from the state snapshot, so a state-synced publish
         causes it to re-render the bubble with the chips attached. */
      if (startAttList.length && _startUserClientId) {
        for (var _si = stateStore.read("messages").length - 1; _si >= 0; _si--) {
          if (stateStore.read("messages")[_si] && stateStore.read("messages")[_si].clientId === _startUserClientId) {
            stateStore.dispatch({
              type:"session/update-message",index:_si,clientId:_startUserClientId,
              patch:{
                attachments:startAttList,
                rawText:startPersistText,
                html:formatMsg(startPersistText)
              }
            });
            publishReactChatRuntime({type:"state-synced",reason:"start-attachment-patch"});
            break;
          }
        }
      }
      /* Deep Research first turn — the user bubble is already committed
         above, so call startDeepResearch (not launchDeepResearch, which
         would re-read the now-empty composer and post a duplicate). */
      if(_deepResearchOn && typeof window.startDeepResearch==="function"){
        await window.startDeepResearch(topicForModel);
        return;
      }
      try{
        await askChatTurn(stateStore.read("topic"), startChatContent);
      }catch(startErr){
        /* P_turn-abort-quiet — see submitChatMessage: expected lifecycle
           aborts unwind silently; real failures log without banner. */
        if(!isExpectedTurnAbort(startErr)){try{console.error("[chat] start turn failed:",startErr)}catch(_){}}
      }
    }, 0);
    return;
  }

  /* Show diagnostic view with loading animation immediately */
  document.getElementById("topicSetup").classList.add("hidden");
  document.getElementById("diagnosticView").classList.remove("hidden");
  document.getElementById("chatView").classList.add("hidden");
  toggleChatTopBarEls(false);
    syncChatModel();

  /* P_attachments-tutor-persist — copy any pending attachments from
     the topic-setup screen onto the session state so subsequent tutor
     calls (diagnostic, first teaching turn) can pick them up. The
     chat-mode branch above already consumes pendingAttachments into
     the first chat bubble; tutor mode goes through a diagnostic
     detour first, so we stash the list on state for the LLM calls
     ahead. After this snapshot, the pending chips are cleared so
     the chat composer (visible after diagnostic) starts empty.

     P_tutor-instant — view swap above is already synchronous. The
     remaining await (buildMessageContent) is also deferred so the
     diagnostic loading screen appears immediately; the resolved
     attachments land on state once the call returns. If the call
     never returns (e.g. image describe timeout), tutor mode can still
     proceed with an empty attachment list. */
  if(typeof resetAttachments === "function") resetAttachments();
  if(typeof renderAttachmentChips === "function") renderAttachmentChips();
  if(typeof updateStartBtn === "function") updateStartBtn();
  if(typeof updateSendBtn === "function") updateSendBtn();
  if(typeof buildMessageContent === "function"){
    /* Fire-and-forget — on the SNAPSHOT taken before resetAttachments,
       not the cleared live store (same bug class as the chat branch:
       reading window.attachments here would always see an empty list).
       The promise resolves into state.tutorAttachments so the eventual
       generateDiagnosticQuestions() can read it. We do NOT await —
       the user already sees the diagnostic view. */
    buildMessageContent(topic,startAttachments).then(function(tutorBuilt){
      try{
        stateStore.dispatch({type:"state/batch",patch:{
          tutorAttachments:(tutorBuilt&&tutorBuilt.attachmentList)||[],
          tutorPartsTemplate:(tutorBuilt&&tutorBuilt.parts)||topic
        }});
      }catch(_){}
    }).catch(function(){
      try{
        stateStore.dispatch({type:"state/batch",patch:{tutorAttachments:[],tutorPartsTemplate:topic}});
      }catch(_){}
    });
  } else {
    stateStore.dispatch({type:"state/batch",patch:{tutorAttachments:[],tutorPartsTemplate:topic}});
  }

  /* U-H3 — reusable loading markup (initial render + retry re-render).
     Includes a cancel button so the user can bail out of a slow
     generation instead of watching the spinner indefinitely. */
  function diagLoadingHTML(){
    return '<div class="diag-loading"><div class="loading"><span></span><span></span><span></span></div><p class="diag-loading-text">'+_t("tutor.loading")+'</p><div class="diag-progress"><div class="diag-progress-bar"><div class="diag-progress-fill" id="diagProgressFill"></div></div><div class="diag-progress-step" id="diagProgressStep"><span class="diag-progress-spin"></span>'+_t("diag.analyzingTopic")+'</div></div><button type="button" class="diag-cancel-btn" data-diag-command="cancel">'+_t("diag.cancel")+'</button></div>';
  }
  /* U-H3 — cancel handler: raise the cancel flag (checked inside
     generateDiagnosticQuestions) and return to the topic-setup screen. */
  window.cancelDiagnostic=function(){
    stateStore.dispatch({type:"state/set",key:"diagCancel",value:true});
    /* AUDIT-R3 — the Begin click already auto-saved an empty session
       row (P_recents-auto) and set stateStore.read("topic"). Cancelling used to
       leave both behind: a ghost row in Recents and a stale topic
       that made resetApp show a bogus "active session" confirm.
       Clear the local session identity first (blocks further saves
       via the stateStore.read("topic") guard), then delete the server row after
       the in-flight Begin-save drains so the DELETE can't lose the
       race with its own POST. */
    var cancelledSid=stateStore.read("currentSessionId")||stateStore.read("currentSessionId");
    stateStore.dispatch({type:"state/batch",patch:{topic:"",phase:"topic"}});
    setCurrentSessionId(null);
    setChatIdInURL(null);
    if(cancelledSid){
      rememberDeletedSession(cancelledSid);
      Promise.resolve(saveState.saveInFlight).catch(function(){}).then(function(){
        return apiFetch("/api/sessions/"+encodeURIComponent(cancelledSid),{
          method:"DELETE",
        });
      }).then(function(){
        return refreshServerSessions();
      }).then(function(){
        _renderRecents();
      }).catch(function(){});
    }
    var dv=document.getElementById("diagnosticView");
    if(dv){dv.classList.add("hidden");dv.innerHTML="";}
    var ts=document.getElementById("topicSetup");
    if(ts)ts.classList.remove("hidden");
    clearComposerPlugins("topic");
    clearComposerPlugins("chat");
    focusComposer("topic");
  };
  document.getElementById("diagnosticView").innerHTML=diagLoadingHTML();

/* Phase 3 — background web search populates stateStore.read("searchContext")
   * for the diagnostic question without rendering a separate
   * activity log. The chat bubble's live status line (streamingTurn's
   * "tool-running" stamp, drawn by react/tool-run/TurnStatus) takes
   * care of "Searching…" for live
   * tool calls; diagnostic-mode web search used to show a richer
   * step-by-step card via startSearchProgress, but that surface
   * was retired when the agent-tool-card UI was removed. */
  if(_webSearchOn()&&shouldAutoSearchTutor(topic)){
    try{
      fetchWebContext(topic,{}).then(function(sc){
        stateStore.dispatch({type:"state/set",key:"searchContext",value:sc.context||""});
      }).catch(function(){});
    }catch(_){}
  }

  /* Progress bar helper — updates fill width and step text. */
  function diagProgress(pct, label) {
    var fill = document.getElementById('diagProgressFill');
    var step = document.getElementById('diagProgressStep');
    if (fill) fill.style.width = pct + '%';
    if (step) step.innerHTML = '<span class="diag-progress-spin"></span>' + label;
  }

/* P_cold-start-coverage — generate topic-specific KB node names so
      the knowledge dimensions are tailored to the subject. Falls back
      to the generic skeleton from aiGenerate() on any failure. */
  try{
    diagProgress(10, _t("diag.analyzingTopic"));
    var topicNodes=await generateTopicKBNodes(topic,lang);
    if(topicNodes&&topicNodes.length>=3){
      while(topicNodes.length<stateStore.read("kbNodes").length)topicNodes.push(stateStore.read("kbNodes")[topicNodes.length].name);
      var namedKbNodes=stateStore.read("kbNodes").map(function(node,ni){
        return topicNodes[ni]?Object.assign({},node,{name:topicNodes[ni]}):node;
      });
      stateStore.dispatch({type:"state/set",key:"kbNodes",value:namedKbNodes});
      diagProgress(15, (window._currentLang==="zh"
        ? "已识别 "+stateStore.read("kbNodes").length+" 个知识点"
        : "Identified "+stateStore.read("kbNodes").length+" knowledge points"));
    }else{
      diagProgress(15, _t("chat.knowledgeReady"));
    }
  }catch {
    diagProgress(15, _t("chat.knowledgeReady"));
  }

  /* Boundary questions are optional; topic analysis is not. Even when the
     learner chooses "Start without questions", wait for the topic-specific
     knowledge nodes above so the teaching plan is grounded in the actual
     subject rather than the generic aiGenerate() skeleton. */
  if(!tutorExploration.enabled){
    diagProgress(100,_t("diag.ready"));
    stateStore.dispatch({type:"state/set",key:"phase",value:"chat"});
    proceedToTeaching();
    return;
  }

  /* KB nodes ready — advance to question generation.
     U-H3 — generation is wrapped in a retryable closure so the
     timeout/failure prompt can re-run it, and a cancel flag lets the
     user bail out mid-generation (see cancelDiagnostic above). */
  function renderDiagFailure(fallbackErr){
    var dv=document.getElementById("diagnosticView");
    if(!dv)return;
    var _esc=(typeof window.esc==="function")?window.esc:function(x){return String(x==null?"":x)};
    var reason=stateStore.read("lastCallError")||fallbackErr||"";
    dv.classList.remove("hidden");
    dv.innerHTML='<div class="diag-error">'
      +'<p class="diag-error-title">'+_esc(_t("diag.timeoutTitle"))+'</p>'
      +(reason?'<p class="diag-error-reason">'+_esc(reason)+'</p>':'')
      +'<div class="diag-error-actions">'
      +'<button type="button" class="diag-error-retry" data-diag-command="retry">'+_esc(_t("diag.retry"))+'</button>'
      +'<button type="button" class="diag-error-builtin" data-diag-command="builtin">'+_esc(_t("diag.useBuiltin"))+'</button>'
      +'</div></div>';
  }
  async function attemptDiagGeneration(reinjectLoading){
    stateStore.dispatch({type:"state/set",key:"diagCancel",value:false});
    if(reinjectLoading){
      var dvl=document.getElementById("diagnosticView");
      if(dvl){dvl.classList.remove("hidden");dvl.innerHTML=diagLoadingHTML();}
    }
    diagProgress(20, _t("chat.generatingQuestions"));
    var diagQs=null;
    var diagErr=null;
    try {
      diagQs = await generateDiagnosticQuestions(topic, lang, function(step, total, q) {
        var pct = 20 + Math.round(75 * step / total);
        if (q) {
          diagProgress(pct, _t("chat.generatedQ").replace("{n}", step).replace("{total}", total));
        } else {
          diagProgress(pct, _t("chat.generatingQ").replace("{n}", step).replace("{total}", total));
        }
      }, function(){ return !!stateStore.read("diagCancel"); }, tutorExploration.count);
    } catch (e) {
      diagErr = (e && e.message) || String(e);
    }
    /* User cancelled — cancelDiagnostic() already restored topic-setup. */
    if (stateStore.read("diagCancel")) return;
    if (diagQs && diagQs.length) {
      stateStore.dispatch({type:"state/set",key:"diagQuestions",value:diagQs});
      stateStore.dispatch({type:'state/set',key:'lastCallSource',value:'real'});
      updateChatStats();
      diagProgress(100, _t("diag.ready"));
      renderDiagQuestion();
      updateKB();
      return;
    }
    /* Generation failed (not a user cancel). Synthesise a reason for the
       api-badge, then show an explicit retry / use-built-in prompt
       instead of silently falling back to the mock questions. */
    if (!stateStore.read("lastCallError")) {
      var ap = (typeof getActiveProvider === "function") ? getActiveProvider() : null;
      if (!ap) stateStore.dispatch({type:'state/set',key:'lastCallError',value:"no provider configured"});
      else if (!ap.model) stateStore.dispatch({type:'state/set',key:'lastCallError',value:"active provider missing model"});
      else if (ap.isBuiltIn) stateStore.dispatch({type:'state/set',key:'lastCallError',value:"built-in provider call failed (network or server error)"});
      else stateStore.dispatch({type:'state/set',key:'lastCallError',value:"active provider '"+(ap.label||ap.id)+"' call failed"});
    }
    updateChatStats();
    renderDiagFailure(diagErr);
  }
  /* U-H3 — retry re-runs generation from scratch; use-built-in accepts
     the mock questions the caller already prepared (gen.diagQuestions). */
  window.retryDiagnostic = function(){ attemptDiagGeneration(true); };
  window.useBuiltinDiagnostic = function(){
    stateStore.dispatch({type:"state/set",key:"diagQuestions",value:buildFallbackDiagnosticQuestions(
      topic,
      tutorExploration.count,
      (_currentLang==="zh"||lang==="zh")
    )});
    stateStore.dispatch({type:'state/set',key:'lastCallSource',value:'mock'});
    if (!stateStore.read("lastCallError")) stateStore.dispatch({type:'state/set',key:'lastCallError',value:"Using built-in questions"});
    updateChatStats();
    var dv = document.getElementById("diagnosticView");
    if (dv) dv.classList.remove("hidden");
    renderDiagQuestion();
    updateKB();
  };
  await attemptDiagGeneration(false);
}
