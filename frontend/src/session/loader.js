/* session/loader.js — extracted from main.js (B2 batch).
 * Session loading (loadSession/loadExamSession) + transients + current-id.
 * Zero-behavior-change lift. Main.js-local list surfaces
 * (refreshServerSessions, renderRecents, renderMistakes, updateMistakesBadge,
 * clearActiveTemplate) resolve via window.* at call time.
 */
import { stateStore } from '../state/store.js';
import { saveState } from './saveState.js';
import { serverCache } from './serverCache.js';
import { turnState } from '../chat/turnState.js';
import { quietTurn } from '../chat/turnUi.js';
import { buildUserContentParts } from '../chat/history.js';
import { apiFetch } from '../util/api.js';
import { ensureSessionShape, setAppMode, syncSidebarForMode } from '../config/providers.js';
import { syncChatModel } from '../pickers.js';
import { pushChatIdToURL, pushExamIdToURL } from './store.js';
import { loadLocalMemory, _memKey } from '../storage/localMemory.js';
import { batchSetItem } from '../batchStorage.js';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.js';
import { formatMsg } from '../render/markdown.js';
import { esc } from '../render/helpers.js';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from '../chat/teachingPlan.js';
import { stateView } from '../tutor/diagnosticFlow.js';
import { generateId } from '../util/ids.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { showToast } from '../ui/toast.js';
import {
  bumpPendingSeq,
  clearPendingTurn,
  getChatTurn,
  loadPendingTurn,
  subscribeChatTurnEvents,
} from '../chat/turnClient.ts';
import { scrollContainer } from '../ui/scroll.js';
import { toggleChatTopBarEls, toggleShareBtn } from '../ui/share.js';
import { updateSendBtn } from '../ui/topicSetup.js';
import { clearComposer } from '../react/composer-input/controller.ts';
import { paintQuestionCard, prepareExamView, renderExamNav, renderExamResults, syncExamNav } from '../exam.js';
import { updateChatStats } from '../chat/stats.js';
import { updateKB } from '../ui/knowledgePanel.js';

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
function _refreshServerSessions() {
  try {
    if (typeof window !== 'undefined' && typeof window.refreshServerSessions === 'function') {
      return window.refreshServerSessions();
    }
  } catch (_) {}
  return Promise.resolve([]);
}
function _renderRecents() {
  try { if (typeof window !== 'undefined' && typeof window.renderRecents === 'function') window.renderRecents(); } catch (_) {}
}
function _renderMistakes() {
  try { if (typeof window !== 'undefined' && typeof window.renderMistakes === 'function') window.renderMistakes(); } catch (_) {}
}
function _updateMistakesBadge() {
  try { if (typeof window !== 'undefined' && typeof window.updateMistakesBadge === 'function') window.updateMistakesBadge(); } catch (_) {}
}
function _clearActiveTemplate() {
  try { if (typeof window !== 'undefined' && typeof window.clearActiveTemplate === 'function') window.clearActiveTemplate(); } catch (_) {}
}

export async function loadExamSession(s){
  if(typeof prepareExamView==="function"){
    try{prepareExamView()}catch(_){}
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
  try { pushExamIdToURL(s.id); } catch (_) { }
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
  if(!ph)return;
  paintQuestionCard(idx,q,ph);
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
  try{clearComposer("chat")}catch(_){}
  try{updateSendBtn();}catch(_){}
  try{if(turnState.pendingChatContent!==undefined)turnState.pendingChatContent=null;}catch(_){}
  try{if(turnState.pendingAttachments!==undefined)turnState.pendingAttachments=null;}catch(_){}
  /* F2a-ext — clear the active template so a slash-command template
     (/quiz, /summarize, etc.) from the previous session doesn't
     inject its systemPrompt into the new session's LLM call via
     injectTemplateSystemPrompt (main.js:3910). The template is a
     user-level tool, not a session-scoped state; resetting it on
     session switch prevents the #1 cross-session context leak. */
  try{if(typeof clearActiveTemplate==="function")_clearActiveTemplate()}catch(_){}
}

/* F2d — write the active session id to every place it's mirrored
   (stateStore.read("currentSessionId"), stateStore.read("currentSessionId"), window
   mirror). The Proxy state/store.js already syncs the top-level ↔ namespace
   via the lookup table, but the explicit triple-write keeps window
   readers in lock-step and removes the four manual duplications
   scattered through loadSession / startSession / resetState. */
export function setCurrentSessionId(id){
  stateStore.dispatch({type:"state/set",key:"currentSessionId",value:id});
  try{window._currentSessionId=id;}catch(_){}
  publishReactChatRuntime({type:"state-synced",reason:"session-id-changed"});
}

export async function loadSession(id){
  /* Guard: if the context menu is open for this session, suppress
     navigation (synthetic click from mobile long-press). */
  if(serverCache.ctxMenuSessionId===id)return;
  /* P_context-race — prevent saveCurrentSession() during session
     loading. Set BEFORE draining saveState.saveInFlight so no new save can
     sneak in during the drain window. Without this, a save that
     fires between the drain and saveState.loadingSession=true would capture
     mismatched state (sessionId vs messages), causing "会话串台". */
  saveState.loadingSession=true;
  /* A history rebuild used to clear #msgList before all legacy messages
     had been rendered.  One malformed/obsolete message could then throw
     part-way through and leave the whole conversation blank until refresh.
     Keep a recoverable snapshot until the new history has committed. */
  var previousMessages=null;
  var historyRebuildStarted=false;
  /* Drain the entire save pipeline — including the saveState.saveDirty
     cascade. Loop because the cascade may fire a new doSave()
     after the current one completes; the saveState.loadingSession guard
     above prevents any new saves from being initiated during
     this drain, so the loop terminates when the cascade is fully
     exhausted. */
  while(saveState.saveInFlight){
    try{await saveState.saveInFlight}catch(_){}
  }
  /* Abort any active chat stream so its onDelta/finish callbacks
     don't write to stateStore.read("messages") after we replace them. */
  if(window._activeChatAbort){try{window._activeChatAbort("session-switch")}catch(_){}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  /* P_stale-loadSession — record the target id before the async
     fetch. If another loadSession() call races ahead and completes
     first, saveState.loadSessionId will have moved past ours; we check
     below and bail before touching state. */
  saveState.loadSessionId=id;
  try{
    var s=await apiFetch("/api/sessions/"+encodeURIComponent(id));
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
    if(s.projectId){
      apiFetch("/api/projects").then(function(r){
        var rows=(r&&r.projects)||[];
        window.__activeProject=rows.filter(function(p){return p.id===s.projectId})[0]||null;
      }).catch(function(){});
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
      loadExamSession(s);
      return;
    }
    document.getElementById("topicSetup").classList.add("hidden");
    document.getElementById("diagnosticView").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    /* Restore .main-inner visibility — exam-view may have hidden it. */
    var mi=document.getElementById("mainInner");
    if(mi)mi.classList.remove("hidden");
    /* Hide exam-only top-bar elements (e.g. #examTitleBar) that may
       still be visible if the previous session was an exam. */
    var examEls=document.querySelectorAll("[data-exam-only='true']");
    examEls.forEach(function(el){el.classList.add("hidden")});
    if (typeof window.hideMainPages === "function") window.hideMainPages();
    toggleChatTopBarEls(true);
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
    var restoredMessages=[];
    s.messages.forEach(function(m){
      /* P_message-id-contract — keep the stable clientId for DOM/state and
         retain the database UUID separately. Replacing clientId with m.id
         makes the next session save insert a duplicate row and causes
         message actions to lose their client identity. */
      var _rrClientId = m.clientId || m.id || ("loaded-"+generateId());
      var restoredHtml = "";
      if (m.role === "assistant" && m.rawText) {
        /* P_declarative-tool-run — rebuild from the canonical source, never
           from the stored snapshot: react/tool-run splices this turn's rows in
           from toolCalls[].textOffset, so `html` only carries prose — and
           re-rendering is what lets current scaffold / widget / visualization
           renderers apply to conversations saved before they existed. Turns
           whose calls predate recorded offsets simply render no rows; the
           classic cards still come back through
           restorePersistedMessageExtras(message.restoredFromHistory). */
        try { restoredHtml = buildAssistantHtml(m.rawText); }
        catch (_) { restoredHtml = m.html || formatMsg(m.rawText); }
      } else {
        restoredHtml = m.html || (m.rawText ? formatMsg(m.rawText) : "");
      }
      restoredMessages.push({
        clientId: _rrClientId,
        serverId: m.id || null,
        role: m.role,
        rawText: m.rawText || "",
        /* Rebuild assistant markup from its canonical source instead of
           replaying a frozen HTML snapshot. This lets current scaffold,
           visualization and widget renderers restore old conversations. */
        html: restoredHtml,
        type: m.type || null,
        restoredFromHistory: true,
        /* AUDIT-fix — the server returns Drizzle rows whose property
           name is the camelCase schema key `reasoningContent` (the
           snake_case `reasoning_content` is only the SQL column name),
           so reading m.reasoning_content always yielded null and the
           thinking pill was silently dropped on every session reload.
           Keep the snake_case fallback for any legacy payloads. */
        reasoningContent: m.reasoningContent || m.reasoning_content || null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls.map(function(tc){
          return {
            id: String(tc.id || ''),
            name: String(tc.name || ''),
            input: tc.input == null ? null : tc.input,
            output: tc.output == null ? null : tc.output,
            isError: tc.isError === true,
            artifacts: Array.isArray(tc.artifacts) ? tc.artifacts.map(function(a){
              return { id: String(a.id || ''), mimeType: a.mimeType || null, name: a.name || null };
            }) : [],
            results: Array.isArray(tc.results) ? tc.results.slice(0, 20) : [],
            /* P_inline-restore — keep the split offset + viz spec so the
               inline layout and charts survive a reload round-trip. */
            textOffset: typeof tc.textOffset === "number" ? tc.textOffset : undefined,
            visualization: (tc.visualization && tc.visualization.version === 1) ? tc.visualization : undefined,
            /* P_declarative-tool-run — and keep the terminal fields. The
               declarative renderer derives a row's state from them, so a
               dropped status/durationMs made every restored call look like it
               was still running, and a failed call lose its error text. */
            status: tc.status == null ? null : String(tc.status),
            durationMs: typeof tc.durationMs === "number" ? tc.durationMs : undefined,
            error: tc.error == null ? null : tc.error,
            errorCode: tc.errorCode == null ? null : tc.errorCode,
            retryable: typeof tc.retryable === "boolean" ? tc.retryable : undefined,
            userMessage: tc.userMessage == null ? undefined : tc.userMessage,
            stderr: tc.stderr == null ? undefined : tc.stderr,
            detail: tc.detail == null ? undefined : tc.detail,
          };
        }) : [],
        actions: null
      });
    });
    stateStore.dispatch({type:"session/replace-messages",payload:restoredMessages});
    publishReactChatRuntime({ type: "state-synced", reason: "session-loaded-react" });
    /* P_recover-local-fallback — if the server response is missing
       the last assistant message (because the user refreshed before
       saveCurrentSession()'s async POST completed), try to recover it
       from the localStorage mirror that appendLocalMemory writes
       synchronously in finishAfterRender().

       Count server messages vs localStorage messages; if localStorage
       has more, the extras are unpersisted and we push them onto
       stateStore.read("messages") and re-render via the bridge. */
    try{
      var _localRec=loadLocalMemory(s.id);
      if(_localRec&&Array.isArray(_localRec.messages)&&_localRec.messages.length>(s.messages||[]).length){
        var _serverCount=(s.messages||[]).length;
        var _extras=_localRec.messages.slice(_serverCount);
        for(var _ei=0;_ei<_extras.length;_ei++){
          var _em=_extras[_ei];
          if(!_em||!_em.content)continue;
          if(_em.role!=="assistant")continue;
          stateStore.dispatch({type:"session/append-message",payload:{
            clientId:"local-recovered-"+generateId(),
            role:"assistant",
            rawText:_em.content,
            html:buildAssistantHtml(_em.content),
            type:"assistant",
            reasoningContent:null,
            attachments:[],
            toolCalls:[],
            actions:null
          }});
        }
        publishReactChatRuntime({ type: "state-synced", reason: "local-recovered-react" });
      }
    }catch(_){}
    /* P_streaming-survival — if the server has saved streaming_text
       (the previous stream was interrupted before completion), surface
       it as a partial assistant message with a Retry button so the
       user can resume the interrupted response. State push is
       authoritative; React re-renders the bubble from snapshot. The
       retry click is delegated on msgList (React-owned) because the
       button DOM is owned by React after the next paint. */
    if(s.streamingText){
      var partialText=s.streamingText||"(partial content)";
      var partialRendered;
      try{partialRendered=formatMsg(partialText)}catch(_){partialRendered="<p>"+esc(partialText)+"</p>"}
      var partialHtml='<div class="msg-content">'+partialRendered+'</div>'+
        '<div class="msg-error" style="margin-top:8px">'+
          '<span class="msg-error-text">(response interrupted — tap Retry to continue)</span>'+
          '<button type="button" class="msg-retry-btn stream-retry-btn" data-stream-retry>Retry</button>'+
        '</div>';
      var partialClientId="stream-recovered-"+Date.now();
      var partialIdx2=stateStore.dispatch({type:"session/append-message",payload:{
        role:"assistant",
        clientId:partialClientId,
        rawText:partialText,
        html:partialHtml,
        type:"assistant",
      }});
      /* Delegate the retry click on the React-owned msgList so the
         React-rendered button works without us touching the DOM. */
      var retryDelegated=function(ev){
        var t=ev.target;
        if(!(t && t.matches && t.matches("[data-stream-retry]")))return;
        msgList.removeEventListener("click",retryDelegated);
        stateStore.dispatch({
          type:"session/remove-message-at",index:partialIdx2,clientId:partialClientId
        });
        apiFetch("/api/sessions/"+encodeURIComponent(s.id),{
          method:"PATCH",
          body:{streamingText:null,streamingReasoning:null},
        }).catch(function(){});
        var lastUserEntry=null;
        var lastUserMsg=null;
        for(var ui=stateStore.read("messages").length-1;ui>=0;ui--){
          if(stateStore.read("messages")[ui]&&stateStore.read("messages")[ui].role==="user"){
            lastUserEntry=stateStore.read("messages")[ui];
            lastUserMsg=lastUserEntry.rawText||lastUserEntry.content;
            break;
          }
        }
        if(lastUserMsg&&typeof window.askChatTurn==="function"){
          /* The recovered bubble is removed first, so askChatTurn slices
             this user turn out of history; carry its rebuilt multimodal
             parts explicitly or the retry loses attachments. */
          var lastUserParts=null;
          try{lastUserParts=buildUserContentParts(lastUserMsg,lastUserEntry&&lastUserEntry.attachments);}catch(_){lastUserParts=null;}
          quietTurn(window.askChatTurn(lastUserMsg,lastUserParts));
        }else{
          showToast(_t("toast.noRetryTarget"));
        }
      };
      msgList.addEventListener("click",retryDelegated);
      /* Clear the server-side streaming_text so a second reload
         doesn't show the same partial content again. */
      apiFetch("/api/sessions/"+encodeURIComponent(s.id),{
        method:"PATCH",
        body:{streamingText:null,streamingReasoning:null},
      }).catch(function(){});
    }
    /* P_context-race — currentSessionId and URL are set HERE, AFTER
       stateStore.read("messages") has been fully rebuilt. Setting them earlier
       (before the forEach rebuild loop) left a window where
       currentSessionId pointed to the new session but
       stateStore.read("messages") still held old data — any saveCurrentSession()
       firing in that window would cross-contaminate contexts. */
    setCurrentSessionId(s.id);
    pushChatIdToURL(s.id);
    /* P_share-btn — loadSession() already had a toggleShareBtn()
       call early (before setCurrentSessionId fixed the id), but
       at that point currentSessionId was still null so the button
       stayed hidden. Run it again now that the id is set. */
    toggleShareBtn();
    /* M2 async — re-attach a still-open detached turn (network drop or
       reload mid-stream). Fire-and-forget: the bubble owns its slot and
       goes inert on session switch via stillOwnsSlot. */
    try{ void reattachPendingTurn(s.id); }catch(_){}
    /* Mirror the server history into the localStorage cache so the
       next chat turn can read it via extractHistory() (fast path) instead
       of falling back to the slower DOM scrape. Skip if the local cache
       already has something (don't clobber a fresher copy). */
    if(!loadLocalMemory(s.id)){
      try{
        var rec={topic:s.topic||"",ts:Date.now(),messages:[]};
        (s.messages||[]).forEach(function(m){
          // Prefer rawText (the source markdown) over html (a rendered
          // snapshot) so the LLM context gets clean content without
          // embedded HTML tags.
          var txt="";
          if(m.rawText){
            txt=m.rawText;
          }else if(m.html){
            var body=document.createElement("div");
            body.innerHTML=m.html;
            txt=(body.innerText||body.textContent||"").trim();
          }
          txt=txt.replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
          if(!txt)return;
          rec.messages.push({role:m.role,content:txt});
        });
        if(rec.messages.length)batchSetItem(_memKey(s.id),JSON.stringify(rec));
      }catch {/* mirror failed */}
    }
    updateKB();
    updateChatStats();
    _renderRecents();
    _renderMistakes();
    _updateMistakesBadge();
    /* P_node-sync — rebuild the teaching plan from the restored kbNodes
       so the sorted order matches the current node states. The saved
       plan snapshot may be stale (e.g., nodes were internalized after
       the plan was last saved). Then sync currentNode with the plan's
       first non-internalized sub-topic, matching proceedToTeaching. */
    if(_appMode()!=="chat"&&stateStore.read("kbNodes")&&stateStore.read("kbNodes").length){
      stateStore.dispatch({
        type:"state/set",key:"teachingPlan",value:buildTeachingPlanFromKB(stateView())
      });
      var restoredPlanSync=syncCurrentNodeFromTeachingPlan(stateView());
      if(restoredPlanSync){
        stateStore.dispatch({type:"state/batch",patch:restoredPlanSync});
      }
    }
    var sc=scrollContainer();
    sc.scrollTop=sc.scrollHeight;
    publishReactChatRuntime({type:"state-synced",reason:"session-loaded"});
  }catch(e){
    /* P_stale-loadSession — if a newer loadSession was requested
       while this one was in-flight, the error (if any) belongs to
       the stale request; don't disrupt the newer session's state. */
    if(saveState.loadSessionId!==id) return;
    /* Preserve the last stable conversation when a legacy record cannot be
       rendered.  The server copy remains untouched; this only prevents a
       transient client rendering failure from blanking the current view. */
    if(historyRebuildStarted && previousMessages){
      try{
        stateStore.dispatch({type:"session/replace-messages",payload:previousMessages});
        publishReactChatRuntime({type:"state-synced",reason:"session-load-failed"});
      }catch(_){}
    }
    
    /* Distinguish session-not-found (404) from transient errors
       (429 rate limit, 5xx server error, network failure) so we
       don't show "Link expired" and blow away the UI on every hiccup.
       For transient errors, just show a toast and keep the current
       view intact — the user can try again later. */
    var errStatus = (e && typeof e.status === 'number') ? e.status : 0;
    var isNotFound = (errStatus === 404);
    
    if (!isNotFound) {
      /* Transient error — don't destroy the current session UI.
         Silently log and return so the user stays where they are. */
      console.warn('[loadSession] transient error loading session', id, 'status=' + errStatus, e && e.message);
      showToast(_t("session.loadFailed").replace("{msg}", e && e.message || "temporary error"));
      return;
    }
    
    showToast(_t("session.notFound"));
    /* The URL had ?chat=<id> pointing to a session that doesn't exist
       on the server (404). This happens when the user bookmarks a
       chat link on one device, then opens it on another device where
       the session never synced; or after a long absence, server-side
       pruning, or DB reset. Either way, the URL is now stale and
       confusing the user — clear it and let them start a new topic
       rather than showing a blank chat panel.
       
        P_loadSession-404 — also clean up when the failing session
        matches the URL even if another session is already loaded,
        so clicking a stale/deleted entry in Recents gives visual
        feedback instead of silently doing nothing.

        P_404-splice-guard — only splice when `id` is a well-formed
        UUID. A 404 can ALSO be returned by GET /api/sessions/:id when
        the id is NOT a UUID (the server's uuid guard rejects the
        format before even hitting the DB). That happens whenever the
        client's cached `s.id` drifted from the server's canonical id
        (e.g. an older session saved with a non-UUID client id, or a
        generateId() fallback that wasn't a UUID). In that case the
        session is STILL valid server-side under a different id — it is
        NOT "deleted", so removing it from serverCache.sessions would make a
        real history entry vanish from Recents the moment the user
        clicks it ("点开历史会话就从列表消失"). For malformed ids we skip
        the splice and re-sync from the server instead, which corrects
        the stale cache. */
    var _idIsUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||"");
    try{
      if(_idIsUuid){
        for(var si=0; si<serverCache.sessions.length; si++){
          if(serverCache.sessions[si].id===id){
            serverCache.sessions.splice(si,1);
            break;
          }
        }
      }
    }catch(_){}
    /* Re-sync the cache from the server so the Recents list reflects
       the authoritative state (drops genuinely-gone rows, restores
       any id-mismatched rows under their real ids). Fire-and-forget;
       failure is harmless — the list simply keeps its current shape. */
    try{_refreshServerSessions().then(function(){_renderRecents()}).catch(function(){})}catch(_){}
    var isUrlMatch=typeof location!=="undefined"&&location.search.indexOf("chat="+encodeURIComponent(id))>=0;
    if(stateStore.read("currentSessionId")===id||!stateStore.read("currentSessionId")||isUrlMatch){
      /* Only if no other session was loaded in the meantime. */
      try{
        if(/[?&]chat=/i.test(location.search)){
          var u=new URL(location.href);
          u.searchParams.delete("chat");
          history.replaceState(history.state,"",u.pathname+(u.search?u.search.replace(/^\?/,"?"):"")+u.hash);
        }
      }catch(_){}
      try{
        clearLegacyMsgListChildren();
        stateStore.dispatch({type:"state/batch",patch:{
          currentSessionId:null,topic:"",kbNodes:[],phase:"topic"
        }});
        stateStore.dispatch({type:"session/replace-messages",payload:[]});
        publishReactChatRuntime({type:"state-synced",reason:"session-not-found"});
        document.getElementById("chatView").classList.add("hidden");
        toggleChatTopBarEls(false);
        document.getElementById("topicSetup").classList.remove("hidden");
        if (typeof window.hideMainPages === "function") window.hideMainPages();
      }catch(_){}
    }
  } finally {
    saveState.loadingSession = false;
  }
}

/* M2 async — re-attach a detached turn after reload/reconnect.
 * Cases:
 *   completed + fullText → append once (deduped by exact rawText) so
 *     the answer the server finished while we were gone is visible.
 *   failed/interrupted  → drop the pointer; the in-place error affordance
 *     from the original tab (or streamingText recovery) owns the UX.
 *   open                → open a live bubble and tail events from lastSeq.
 * All paths are best-effort and session-scoped: if the user switches
 * sessions mid-tail the subscription aborts and the bubble's
 * stillOwnsSlot guard keeps the writes inert. */
export async function reattachPendingTurn(sessionId){
  var pending=null;
  try{ pending=loadPendingTurn(sessionId); }catch(_){ return; }
  if(!pending||!pending.turnId)return;
  var snapshot=null;
  try{ snapshot=await getChatTurn(pending.turnId); }
  catch(_){ try{clearPendingTurn(sessionId)}catch(_){} return; }
  if(!snapshot||!snapshot.turn)return;
  var turn=snapshot.turn;
  if(turn.sessionId&&turn.sessionId!==sessionId){ try{clearPendingTurn(sessionId)}catch(_){} return; }
  if(stateStore.read("currentSessionId")!==sessionId)return;
  if(turn.status==="completed"){
    try{
      var full=turn.fullText||"";
      if(full){
        var msgs=stateStore.read("messages")||[];
        var already=false;
        for(var i=0;i<msgs.length;i++){
          if(msgs[i]&&msgs[i].role==="assistant"&&msgs[i].rawText===full){already=true;break}
        }
        if(!already&&typeof window.addMessage==="function")window.addMessage("assistant",full);
      }
    }catch(_){}
    try{clearPendingTurn(sessionId)}catch(_){}
    return;
  }
  if(turn.status==="failed"||turn.status==="interrupted"){
    try{clearPendingTurn(sessionId)}catch(_){}
    return;
  }
  if(typeof window.addStreamingMessage!=="function")return;
  var ctl=window.addStreamingMessage({onRetry:function(){
    try{
      var lastUserEntry=null;
      var lastUser=null;
      var list=stateStore.read("messages")||[];
      for(var ui=list.length-1;ui>=0;ui--){
        if(list[ui]&&list[ui].role==="user"){
          lastUserEntry=list[ui];
          lastUser=lastUserEntry.rawText||null;
          break;
        }
      }
      if(lastUser&&typeof window.askChatTurn==="function"){
        /* Same slicing hazard as the recovered-stream retry above: carry
           the stored multimodal parts through the replay. */
        var lastUserParts=null;
        try{lastUserParts=buildUserContentParts(lastUser,lastUserEntry&&lastUserEntry.attachments);}catch(_){lastUserParts=null;}
        quietTurn(window.askChatTurn(lastUser,lastUserParts));
      }
    }catch(_){}
  }});
  var subAbort=new AbortController();
  var maxSeq=Number(pending.lastSeq)||0;
  function applyFrame(frame){
    if(!frame||stateStore.read("currentSessionId")!==sessionId){
      try{subAbort.abort("session-switch")}catch(_){}
      return;
    }
    try{
      var data=frame.data||{};
      if(frame.event==="content"&&typeof data.delta==="string")ctl.append(data.delta);
      else if(frame.event==="reasoning"&&typeof data.delta==="string")ctl.appendThinking(data.delta);
      else if(frame.event==="tool_use"){
        var _calls=Array.isArray(data)?data:(data.calls||[data]);
        for(var ci=0;ci<_calls.length;ci++){ try{ctl.recordToolUse(_calls[ci])}catch(_){} }
      }
      else if(frame.event==="tool_result")ctl.recordToolResult(data);
      else if(frame.event==="tool_approval"&&typeof ctl.recordToolApproval==="function")ctl.recordToolApproval(data);
      else if(frame.event==="tool_progress"&&ctl.recordToolProgress)ctl.recordToolProgress(data);
      else if(frame.event==="execution_start"&&ctl.recordExecutionStart)ctl.recordExecutionStart(data);
      else if(frame.event==="agent_step"&&typeof ctl.recordAgentStep==="function")ctl.recordAgentStep(data);
      else if(frame.event==="agent_plan"&&typeof ctl.recordAgentPlan==="function")ctl.recordAgentPlan(data);
      else if(frame.event==="turn_done"){ ctl.finish(); try{clearPendingTurn(sessionId)}catch(_){} try{subAbort.abort("done")}catch(_){} return; }
      else if(frame.event==="turn_failed"){
        try{
          if(turn.fullText||ctl)ctl.finish();
        }catch(_){}
        try{clearPendingTurn(sessionId)}catch(_){}
        try{subAbort.abort("done")}catch(_){}
        return;
      }
      if(typeof frame.sequence==="number"&&frame.sequence>maxSeq){
        maxSeq=frame.sequence;
        try{bumpPendingSeq(sessionId,maxSeq)}catch(_){}
      }
    }catch(_){}
  }
  try{
    var replay=(snapshot.events||[]);
    for(var r=0;r<replay.length;r++)applyFrame(replay[r]);
    if(stateStore.read("currentSessionId")!==sessionId){try{subAbort.abort("session-switch")}catch(_){}return}
    await subscribeChatTurnEvents(pending.turnId,maxSeq,subAbort.signal,{
      onEvent:applyFrame,
      onError:function(){},
    });
  }catch(_){}
}

/* ============================================================
   CLIENT-SIDE CONVERSATION MEMORY
   K 区段(LOCAL_MEMORY_MAX / _memKey / loadLocalMemory /
   appendLocalMemory / clearLocalMemory) 已抽到 src/storage/localMemory.js,
   顶部 import。
   ============================================================ */

