/* session/loader.js — extracted from main.js (B2 batch).
 * Session loading (loadSession/loadExamSession) + transients + current-id.
 * Zero-behavior-change lift. Main.js-local list surfaces
 * (renderRecents, the recents reconciler) resolve via window.* at call time.
 * P_save-drain-removed: loadSession no longer waits on the save pipeline — the
 * save queue posts a self-contained snapshot (see session/saveState.js).
 */
import { stateStore } from '../state/store.js';
import { saveState } from './saveState.js';
import { serverCache } from './serverCache.js';
import { turnState } from '../chat/turnState.js';
import { apiFetch } from '../util/api.js';
import { refreshCachedProjects } from '../projects/projectCache.ts';
import { ensureSessionShape, setAppMode, syncSidebarForMode } from '../config/providers.js';
import { syncChatModel } from '../pickers.js';
import { pushChatIdToURL, pushExamIdToURL } from './store.js';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.js';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from '../chat/teachingPlan.js';
import { stateView } from '../tutor/diagnosticFlow.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { showToast } from '../ui/toast.js';
import { detailCache } from './detailCache.js';
import {
  restoreSessionMessage,
  restoreLocalAssistantFallback,
  restoreInterruptedResponse,
  mirrorSessionHistory,
} from './historyRestore.js';
import { reattachPendingTurn } from './pendingTurnRestore.js';
import { seedSyncedMessages } from './persistence.js';
import { toggleShareBtn } from '../ui/share.js';
import { activateMainView } from '../ui/mainViewController.js';
import { updateComposerBtn } from '../ui/topicSetup.js';
import { clearComposer } from '../composer/controller.ts';
import { updateChatStats } from '../chat/stats.js';
import { updateKB } from '../ui/knowledgePanel.js';
import { reportSwallow } from '../util/reportSwallow.ts';

export { reattachPendingTurn };

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) {reportSwallow(e, 'session/loader._t'); }
  return fallback != null ? fallback : key;
}
function _appMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (e) {reportSwallow(e, 'session/loader._appMode'); }
  return 'chat';
}
/* P_recents-amplify — see loadSession()'s tail. Goes through window.* for the
   same reason the old _refreshServerSessions helper did: recents.js owns the
   reconciler and must not be hard-imported from here. */
function _scheduleRecentsReconcile() {
  try {
    if (typeof window !== 'undefined' && typeof window.scheduleRecentsReconcile === 'function') {
      window.scheduleRecentsReconcile();
    }
  } catch (e) {reportSwallow(e, 'session/loader._scheduleRecentsReconcile'); }
}
function _renderRecents() {
  try { if (typeof window !== 'undefined' && typeof window.renderRecents === 'function') window.renderRecents(); } catch (e) {reportSwallow(e, 'session/loader._renderRecents'); }
}
function _renderMistakes() {
  try { if (typeof window !== 'undefined' && typeof window.renderMistakes === 'function') window.renderMistakes(); } catch (e) {reportSwallow(e, 'session/loader._renderMistakes'); }
}
function _updateMistakesBadge() {
  try { if (typeof window !== 'undefined' && typeof window.updateMistakesBadge === 'function') window.updateMistakesBadge(); } catch (e) {reportSwallow(e, 'session/loader._updateMistakesBadge'); }
}
function _clearActiveTemplate() {
  try { if (typeof window !== 'undefined' && typeof window.clearActiveTemplate === 'function') window.clearActiveTemplate(); } catch (e) {reportSwallow(e, 'session/loader._clearActiveTemplate'); }
}

/* exam.js is lazy-loaded (see windowExports.__loadExamModule). The exam
   view only needs it when an exam session is actually restored, so the
   module resolves here on first use and is cached for
   paintRestoredQuestionCard below. */
var _examMod = null;
async function _ensureExamModule() {
  if (_examMod) return _examMod;
  if (typeof window !== 'undefined' && typeof window.__loadExamModule === 'function') {
    _examMod = await window.__loadExamModule();
  } else {
    _examMod = await import('../exam.js');
    try { _examMod.mountExamListeners(); } catch (e) {reportSwallow(e, 'session/loader._ensureExamModule'); }
  }
  return _examMod;
}

export async function loadExamSession(s){
  var _ex = await _ensureExamModule();
  var prepareExamView=_ex.prepareExamView, renderExamNav=_ex.renderExamNav,
      renderExamResults=_ex.renderExamResults, syncExamNav=_ex.syncExamNav;
  if(typeof prepareExamView==="function"){
    try{prepareExamView()}catch (e) {reportSwallow(e, 'session/loader.loadExamSession'); }
  }else{
    var ev=document.getElementById("examView");
    var others=["topicSetup","diagnosticView","chatView"];
    others.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add("hidden");});
    var mi=document.getElementById("mainInner");
    if(mi)mi.classList.add("hidden");
    if(ev)ev.classList.remove("hidden");
  }
  var _loadedExamQuestions=Array.isArray(s.examData&&s.examData.questions)?s.examData.questions.map(function(q,i){
    var c=Object.assign({},q);
    c._idx=i;
    return c;
  }):[];
  stateStore.dispatch({type:"state/batch",patch:{
    _examInView:true,
    currentSessionId:s.id,
    examCancel:false,
    examTopic:(s.examData&&s.examData.topic)||s.topic||"",
    examCount:(s.examData&&s.examData.count)||_loadedExamQuestions.length,
    examLang:(s.examData&&s.examData.lang)||"English",
    examDifficulty:(s.examData&&s.examData.difficulty)||"intermediate",
    examTypes:Array.isArray(s.examData&&s.examData.types)?s.examData.types:[],
    examQuestions:_loadedExamQuestions,
    examAnswers:(s.examData&&s.examData.answers)||{},
    examSubmitted:!!(s.examData&&s.examData.submitted)
  }});
  try { pushExamIdToURL(s.id); } catch (e) {reportSwallow(e, 'session/loader.loadExamSession~2'); }
  document.getElementById("examViewTitle").textContent=stateStore.read("examSubmitted")?("Exam Results: "+stateStore.read("examTopic")):(stateStore.read("examTopic"));
  var titleBar=document.getElementById("examTitleBar");
  if(titleBar)titleBar.textContent=stateStore.read("examTopic")||"Generate Exam";
  var body=document.getElementById("examViewBody");
  var footer=document.getElementById("examViewFooter");
  /* Build the same DOM that a fresh generation would build, but
     skip the streaming cards and use the saved data. The unified
     paintQuestionCard helper handles the option pre-selection /
     answer pre-fill needed for restored sessions. */
  body.innerHTML='<div id="examQuestionsContainer"></div>';
  stateStore.read("examQuestions").forEach(function(q,idx){
    var card=document.createElement("div");
    card.className="exam-q-card";
    card.id="examQ"+idx;
    card.setAttribute("data-idx",idx);
    body.querySelector("#examQuestionsContainer").appendChild(card);
    paintRestoredQuestionCard(idx,q);
  });
  /* Mount the nav bar (and make the active pill match whatever the
     first question is on load). */
  renderExamNav();
  /* Footer actions depend on whether the exam is already submitted. */
  if(stateStore.read("examSubmitted")){
    renderExamResults();
  }else{
    footer.innerHTML='<button class="exam-btn primary" data-exam-command="submit">Submit for Grading</button><button class="exam-btn secondary" data-exam-command="close">Close</button>';
  }
  toggleShareBtn();
  _renderRecents();
  /* Wire the scroll listener once per open so the active nav pill
     tracks the viewport. */
  if(!stateStore.read("_examScrollBound")){
    var bindCont=document.getElementById("examViewBody");
    if(bindCont){
      bindCont.addEventListener("scroll",function(){
        if(stateStore.read("_examInView"))syncExamNav();
      });
    }
    stateStore.dispatch({type:"state/set",key:"_examScrollBound",value:true});
  }
  var sc=document.getElementById("scrollContainer")||document.getElementById("msgScroll");
  if(sc)sc.scrollTop=0;
}

/* Helper for loadExamSession — fill a single .exam-q-card with the
 * saved question and the user's saved answer (option pre-selected for
 * multiple-choice, value prefilled for fill-blank / short-answer).
 * Wraps paintQuestionCard and adds the "selected" / "value" overrides. */
export function paintRestoredQuestionCard(idx,q){
  var ph=document.getElementById("examQ"+idx);
  if(!ph||!_examMod)return;
  _examMod.paintQuestionCard(idx,q,ph);
  var saved=stateStore.read("examAnswers")&&stateStore.read("examAnswers")[idx];
  if(q.type==="multiple-choice"&&q.opts&&saved!==undefined){
    var btns=ph.querySelectorAll(".exam-q-opt");
    btns.forEach(function(b,i){if(i===saved)b.classList.add("selected")});
  }else if(q.type==="fill-blank"||q.type==="short-answer"){
    var input=ph.querySelector(".exam-q-fill-input");
    if(input&&typeof saved==="string")input.value=saved;
  }
}

/* F2c — clear every cross-round transient so a previous session's
   web-search cache, call metadata, composer draft, plan fields, or
   pending-chat payload cannot leak into the next one. Called from
   loadSession() (server-driven switch) and startSession() (user
   clicks Begin with a new topic). */
export function resetSessionTransients(){
  stateStore.dispatch({type:"state/batch",patch:{
    searchContext:null,
    searchResults:[],
    searchContextAt:0,
    searchContextCount:0,
    searchContextQuery:null,
    searchContextError:null,
    lastCallSource:null,
    lastCallError:null,
    sessionTitle:null
  }});
  try{clearComposer("chat")}catch (e) {reportSwallow(e, 'session/loader.resetSessionTransients'); }
  try{updateComposerBtn();}catch (e) {reportSwallow(e, 'session/loader.resetSessionTransients~2'); }
  try{if(turnState.pendingChatContent!==undefined)turnState.pendingChatContent=null;}catch (e) {reportSwallow(e, 'session/loader.resetSessionTransients~3'); }
  try{if(turnState.pendingAttachments!==undefined)turnState.pendingAttachments=null;}catch (e) {reportSwallow(e, 'session/loader.resetSessionTransients~4'); }
  /* F2a-ext — clear the active template so a slash-command template
     (/quiz, /summarize, etc.) from the previous session doesn't
     inject its systemPrompt into the new session's LLM call via
     injectTemplateSystemPrompt (main.js:3910). The template is a
     user-level tool, not a session-scoped state; resetting it on
     session switch prevents the #1 cross-session context leak. */
  try{if(typeof clearActiveTemplate==="function")_clearActiveTemplate()}catch (e) {reportSwallow(e, 'session/loader.resetSessionTransients~5'); }
}

/* F2d — write the active session id to every place it's mirrored
   (stateStore.read("currentSessionId"), stateStore.read("currentSessionId"), window
   mirror). The Proxy state/store.js already syncs the top-level ↔ namespace
   via the lookup table, but the explicit triple-write keeps window
   readers in lock-step and removes the four manual duplications
   scattered through loadSession / startSession / resetState. */
export function setCurrentSessionId(id, silent){
  stateStore.dispatch({type:"state/set",key:"currentSessionId",value:id});
  try{window._currentSessionId=id;}catch (e) {reportSwallow(e, 'session/loader.setCurrentSessionId'); }
  if(!silent) publishReactChatRuntime({type:"state-synced",reason:"session-id-changed"});
}

function syncRestoredTutorPlan(){
  var nodes=stateStore.read("kbNodes");
  if(_appMode()==="chat"||!nodes||!nodes.length)return;
  stateStore.dispatch({
    type:"state/set",key:"teachingPlan",value:buildTeachingPlanFromKB(stateView())
  });
  var planSync=syncCurrentNodeFromTeachingPlan(stateView());
  if(planSync)stateStore.dispatch({type:"state/batch",patch:planSync});
}

/* A cache-hit paints immediately; this background fetch refreshes it and
   starts a normal load only when the server's session has changed. */
function revalidateCachedSession(id, session, cachedDetail, abortController){
  if(!cachedDetail||session.kind==="exam"||detailCache.isFresh(cachedDetail))return;
  var paintedSignature=cachedDetail.sig;
  Promise.resolve().then(function(){
    return apiFetch("/api/sessions/"+encodeURIComponent(id), { signal: abortController.signal });
  }).then(function(fresh){
    if(!fresh||abortController.signal.aborted||saveState.loadSessionId!==id)return;
    if(stateStore.read("currentSessionId")!==id)return;
    detailCache.store(id,fresh);
    if(detailCache.signature(fresh)!==paintedSignature){
      detailCache.invalidate(id);
      loadSession(id);
    }
  }).catch(function(){});
}

/* Keep stale-load races inert, preserve the previous transcript for transient
   failures, and clear only genuinely missing sessions from the visible view. */
function handleSessionLoadFailure(id, error, abortController, historyRebuildStarted, previousMessages){
  if(abortController.signal.aborted||saveState.loadSessionId!==id)return;
  if(historyRebuildStarted&&previousMessages){
    try{
      stateStore.dispatch({type:"session/replace-messages",payload:previousMessages});
      publishReactChatRuntime({type:"state-synced",reason:"session-load-failed"});
    }catch (e) {reportSwallow(e, 'session/loader.handleSessionLoadFailure.restore'); }
  }

  var status=(error&&typeof error.status==="number")?error.status:0;
  if(status!==404){
    console.warn('[loadSession] transient error loading session', id, 'status=' + status, error && error.message);
    showToast(_t("session.loadFailed").replace("{msg}",error&&error.message||"temporary error"));
    return;
  }

  showToast(_t("session.notFound"));
  /* The server rejects malformed UUIDs before querying the database, so a
     non-UUID cache id may be a stale alias for a session that still exists.
     Remove only a well-formed id; recents reconciliation can repair aliases. */
  var isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||"");
  try{
    if(isUuid){
      for(var i=0;i<serverCache.sessions.length;i++){
        if(serverCache.sessions[i].id===id){
          serverCache.sessions.splice(i,1);
          break;
        }
      }
    }
  }catch (e) {reportSwallow(e, 'session/loader.handleSessionLoadFailure.removeMissing'); }

  var isUrlMatch=typeof location!=="undefined"&&location.search.indexOf("chat="+encodeURIComponent(id))>=0;
  if(stateStore.read("currentSessionId")===id||!stateStore.read("currentSessionId")||isUrlMatch){
    try{
      if(/[?&]chat=/i.test(location.search)){
        var url=new URL(location.href);
        url.searchParams.delete("chat");
        history.replaceState(history.state,"",url.pathname+(url.search?url.search.replace(/^\?/,"?"):"")+url.hash);
      }
    }catch (e) {reportSwallow(e, 'session/loader.handleSessionLoadFailure.clearUrl'); }
    try{
      clearLegacyMsgListChildren();
      stateStore.dispatch({type:"state/batch",patch:{
        currentSessionId:null,topic:"",kbNodes:[],phase:"topic"
      }});
      stateStore.dispatch({type:"session/replace-messages",payload:[]});
      publishReactChatRuntime({type:"state-synced",reason:"session-not-found"});
      activateMainView("topicSetup", document);
    }catch (e) {reportSwallow(e, 'session/loader.handleSessionLoadFailure.resetView'); }
  }
}

export async function loadSession(id){
  /* Guard: if the context menu is open for this session, suppress
     navigation (synthetic click from mobile long-press). */
  if(serverCache.ctxMenuSessionId===id)return;
  /* P_context-race — prevent saveCurrentSession() during session
     loading. Set loadingSession flag immediately. Discard saveDirty on the
     old session so any background save settles without triggering a re-save
     over the new session's state. */
  saveState.loadingSession=true;
  saveState.saveDirty=false;
  saveState.pendingSnapshot=null;
  var previousMessages=null;
  var historyRebuildStarted=false;
  /* P_save-drain-removed — this used to be
       while (saveState.saveInFlight) { await saveState.saveInFlight }
     which made the session switch wait for the ENTIRE save pipeline: the
     POST, then a full `GET /api/sessions?limit=200&archived=true`, then a
     PATCH — three serial round-trips — before the detail fetch was even
     issued. Clicking a history row right after a turn therefore looked like
     a dead click for as long as that chain took.

     The drain was only load-bearing because the save queue used to end in
     doSave(), which re-captures from LIVE state. Since P_save-snapshot the
     queue posts a payload captured while the changed session was still
     current, so it is self-contained and safe to post after we have already
     replaced the messages. The drain is therefore unnecessary.

     saveState.loadingSession is still set above: it is what stops a NEW save
     from starting inside this window. An already-running save simply carries
     its own captured payload to completion in the background. The delete
     path (session/recents.js actuallyDeleteSession) keeps its own drain —
     there, waiting genuinely is load-bearing, because a POST landing after
     the DELETE would resurrect the row.
  */
  /* Abort any active chat stream so its onDelta/finish callbacks
     don't write to stateStore.read("messages") after we replace them. */
  if(window._activeChatAbort){try{window._activeChatAbort("session-switch")}catch (e) {reportSwallow(e, 'session/loader.loadSession'); }}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch (e) {reportSwallow(e, 'session/loader.loadSession~2'); }}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  /* Abort any in-flight loadSession fetch to save bandwidth and main-thread JSON.parse. */
  if(saveState.loadAbortCtl){
    try{saveState.loadAbortCtl.abort();}catch (e) {reportSwallow(e, 'session/loader.loadSession~3'); }
  }
  var currentLoadAbort=new AbortController();
  saveState.loadAbortCtl=currentLoadAbort;
  /* P_stale-loadSession — record the target id before the async
     fetch. If another loadSession() call races ahead and completes
     first, saveState.loadSessionId will have moved past ours; we check
     below and bail before touching state. */
  saveState.loadSessionId=id;
  /* P2 stale-while-revalidate — if we painted this session before in the tab,
     reuse the cached detail as an instant first paint and reconcile against a
     live fetch in the background (see the tail of this try block). A miss
     behaves exactly as before: await the network, then remember it. */
  var _cachedDetail=detailCache.lookup(id);
  try{
    var s;
    if(_cachedDetail){
      s=_cachedDetail.response;
    }else{
      var _inflight=detailCache.getInflight(id);
      if(_inflight){
        s=await _inflight;
        if(!s) s=await apiFetch("/api/sessions/"+encodeURIComponent(id), { signal: currentLoadAbort.signal });
      }else{
        s=await apiFetch("/api/sessions/"+encodeURIComponent(id), { signal: currentLoadAbort.signal });
      }
      /* P_stale-loadSession — a newer loadSession may have overtaken us
         during the await; skip touching (or caching) a stale response. */
      if(currentLoadAbort.signal.aborted || saveState.loadSessionId!==id) return;
      detailCache.store(id, s);
    }
    ensureSessionShape(s);
    s.messages=Array.isArray(s.messages)?s.messages:[];
    /* P_stale-loadSession — if a newer loadSession() was already
       requested while this fetch was in-flight, skip the stale
       response so we don't overwrite the newer session's state. */
    if(saveState.loadSessionId!==id) return;
    stateStore.dispatch({type:"state/batch",patch:{
      topic:s.topic,
      domain:s.domain,
      kbNodes:s.kbNodes||[],
      currentNode:s.currentNode||0,
      totalQ:s.totalQ||0,
      phase:s.phase||"chat",
      currentProjectId:s.projectId||null,
      mistakes:s.mistakes||[],
      sessionTitle:s.title||null,
      substantiveCount:0,
      stuckCount:0,
      diagIndex:0,
      diagAnswers:[],
      diagQuestions:[],
      explaining:false,
      teachingStage:s.teachingStage||"motivate",
      currentExampleIdx:s.currentExampleIdx||0,
      practiceAttempts:s.practiceAttempts||0,
      practicePhase:s.practicePhase||"foundation",
      teachingPlan:s.teachingPlan||null,
      "session.branchedFrom":s.branchedFrom||null,
      "kb.boundariesHistory":Array.isArray(s.boundariesHistory)?s.boundariesHistory:[],
      "kb.mistakeFilter":s.mistakeFilter||"all"
    }});
    try {
      if (s.assistantId) sessionStorage.setItem("socrates-active-assistant", s.assistantId);
      else sessionStorage.removeItem("socrates-active-assistant");
    } catch (e) {reportSwallow(e, 'session/loader.loadSession~4', 'expected'); }
    if(s.projectId){
      refreshCachedProjects(function(){ return apiFetch("/api/projects"); }).then(function(rows){
        window.__activeProject=rows.filter(function(p){return p.id===s.projectId})[0]||null;
      }).catch(function(){ return null; });
    }else{ window.__activeProject=null; }
    /* P_context-race — currentSessionId and URL are set DEFERRED
       after messages are rebuilt below. Setting currentSessionId before
       messages creates a window where stateStore.read("currentSessionId")
       points to the NEW session but stateStore.read("messages") still holds the OLD
       session's data. Any saveCurrentSession() that fires during this
       window (called from 23+ places) would capture mismatched state,
       causing "会话串台" (context cross-contamination). Both fields
       are set together at the end of the message-rebuild block. */
    // stateStore.read("currentSessionId") = s.id; ← MOVED DOWN
    toggleShareBtn();
    /* F2a — flush transients BEFORE setting sessionTitle so the
       helper's reset (sessionTitle=null) can't race with the assignment
       below. Order matters: resetSessionTransients clears
       search/call/composer/plan, then this block restores sessionTitle
       + teachingStage + plan fields from the loaded session. */
    resetSessionTransients();
    /* Update the URL to reflect the current chat session.
       MOVED DOWN — see comment above. */
    // pushChatIdToURL(s.id); ← MOVED DOWN
    /* Task 2.4 — restore the teaching-stage state machine. Default
       to motivate / 0 / null for sessions saved before Task 2.1. */
    /* P1.1 — restore branchedFrom metadata so the sidebar shows
       "Branched from ..." for branched sessions. */
    /* Restore KB boundary history and mistake filter. */
    /* Restore the mode the session was started in. Only override when the
       session has an explicit mode field — sessions without one (older
       rows where the DB defaulted to 'tutor') keep the current _appMode()
       so a chat user doesn't get silently switched to tutor mode. */
    /* AUDIT-fix — the old code wrote s.mode to window.appMode only,
       then immediately overwrote it with the stale module-level
       binding (`window.appMode=_appMode()`), so loading a tutor session
       from chat mode (or vice-versa) never actually switched modes.
       setAppMode() mutates the module binding in providers.js (the
       import is read-only here); the window mirror is synced after. */
    if(s.mode==="chat"||s.mode==="tutor"){setAppMode(s.mode);}
    /* P_tutor-sync — setAppMode() now syncs window.appMode internally,
       so no manual mirror is needed here. */
    syncAppModeUI();
    syncSidebarForMode();
    /* P_exam-history — exam sessions are persisted to the same
     * /api/sessions table but with kind='exam'. When the user clicks
     * one in Recents, route them straight into the exam view with
     * the saved questions, answers, and language restored — instead
     * of the chat-view message renderer which would show nothing
     * useful (exam sessions have no chat-style messages). */
    if(s.kind==="exam"&&s.examData){
      /* Awaited so loadSession()'s promise settles after the exam view is
         painted and a paint failure rejects it instead of going unhandled. */
      await loadExamSession(s);
      return;
    }
    activateMainView("chatView", document);
    syncChatModel();
    var msgList=document.getElementById("msgList");
    previousMessages=stateStore.read("messages").slice();
    historyRebuildStarted=true;
    /* Drop legacy leftovers (old streaming bubble, research cards) from
       the previous session; React-owned nodes reconcile from state. */
    clearLegacyMsgListChildren();
    /* React owns #msgList. State is authoritative — React re-renders
       from stateStore.read("messages"). The legacy DOM rebuild (div creation,
       formatMsg/renderAssistantHTML, attachment chip mount,
       msgList.appendChild, and viz/mermaid/code-block post-process)
       was reachable only when the message list was not migrated,
       which is no longer possible after the always-on React runtime. */
    var restoredMessages=s.messages.map(restoreSessionMessage);
    stateStore.dispatch({type:"session/replace-messages",payload:restoredMessages});
    /* P_incremental-save — these rows are exactly what the server just
       handed us, so record them in the save watermark. Without this the
       first save after every session switch would re-upload the whole
       transcript and the delta would only ever help mid-conversation. */
    seedSyncedMessages(s.id, restoredMessages);
    /* The local mirror may contain assistant output not yet persisted by the
       server; an interrupted server stream also gets an inline retry action. */
    restoreLocalAssistantFallback(s);
    restoreInterruptedResponse(s,msgList);
    /* P_context-race — currentSessionId and URL are set HERE, AFTER
       stateStore.read("messages") has been fully rebuilt. Setting them earlier
       (before the forEach rebuild loop) left a window where
       currentSessionId pointed to the new session but
       stateStore.read("messages") still held old data — any saveCurrentSession()
       firing in that window would cross-contaminate contexts. */
    setCurrentSessionId(s.id, true);
    pushChatIdToURL(s.id);
    /* P_share-btn — loadSession() already had a toggleShareBtn()
       call early (before setCurrentSessionId fixed the id), but
       at that point currentSessionId was still null so the button
       stayed hidden. Run it again now that the id is set. */
    toggleShareBtn();
    /* M2 async — re-attach a still-open detached turn (network drop or
       reload mid-stream). Fire-and-forget: the bubble owns its slot and
       goes inert on session switch via stillOwnsSlot. */
    try{ void reattachPendingTurn(s.id); }catch (e) {reportSwallow(e, 'session/loader.loadSession~6'); }
    mirrorSessionHistory(s);
    if(_appMode()!=="chat"||(s.kbNodes&&s.kbNodes.length>0)) updateKB();
    updateChatStats();
    _renderRecents();
    _renderMistakes();
    _updateMistakesBadge();
    /* Rebuild the tutor plan from restored node state before publishing. */
    syncRestoredTutorPlan();
    publishReactChatRuntime({type:"state-synced",reason:"session-loaded"});
    /* P_history-slice (retired) — this used to re-run buildAssistantHtml over
       every restored assistant turn in background slices and patch the result
       into message.html. Every such row is rendered declaratively from rawText
       by react/tool-run/AssistantTurn, which never reads message.html, so the
       rebuild was invisible — yet it doubled the markdown/KaTeX/DOMPurify work
       of each switch, re-rendered every row once more as the patches landed,
       and changed each row's html fingerprint, so the first save after every
       switch re-uploaded the whole transcript instead of a delta. */
    revalidateCachedSession(id,s,_cachedDetail,currentLoadAbort);
  }catch(e){
    handleSessionLoadFailure(id,e,currentLoadAbort,historyRebuildStarted,previousMessages);
  } finally {
    if(saveState.loadSessionId===id){
      saveState.loadingSession = false;
    }
  }
}

/* ============================================================
   CLIENT-SIDE CONVERSATION MEMORY
   K 区段(LOCAL_MEMORY_MAX / _memKey / loadLocalMemory /
   appendLocalMemory / clearLocalMemory) 已抽到 src/storage/localMemory.js。
   Session history restore reads and writes the mirror in historyRestore.js。
   ============================================================ */
