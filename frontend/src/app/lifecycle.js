/* app/lifecycle.js — extracted from main.js (B6 batch).
 * App lifecycle: reset, incognito, auth gate/expiry, sign-out,
 * app-mode switching, mode badge. Zero-behavior-change lift.
 * Render/list surfaces still owned by main.js resolve via window.*.
 */
import { stateStore, resetState } from '../state/store.js';
import { turnState } from '../chat/turnState.js';
import { saveState } from '../session/saveState.js';
import { serverCache } from '../session/serverCache.js';
import { apiConfig, appMode, setAppMode, syncAppModeUI, syncSidebarForMode } from '../config/providers.js';
import { apiFetch } from '../util/api.js';
import { showGate, showAuthSignin } from '../auth/index.js';
import { showConfirm } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import { clearComposer, focusComposer } from '../react/composer-input/controller.ts';
import { clearComposerPlugins } from '../react/composer/pluginSelection.ts';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { publishThinkingTurnStart } from '../ui/messageSnapshot.js';
import { resetShareToken, toggleChatTopBarEls, toggleShareBtn } from '../ui/share.js';
import { setChatIdInURL, setExamIdInURL } from '../session/store.js';
import { scrollContainer } from '../ui/scroll.js';
import { updateStartBtn } from '../ui/topicSetup.js';
import { saveCurrentSession, saveSessionBeforeReset } from '../session/persistence.js';
import { syncModelPills } from '../pickers.js';
import { renderUserFooter } from '../ui/profile.js';
import { resetCrossSessionKBCache } from '../ui/knowledgeCrossSession.js';
import { renderGreeting } from '../ui/greeting.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
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
function _renderProviderList() {
  try { if (typeof window !== 'undefined' && typeof window.renderProviderList === 'function') window.renderProviderList(); } catch (_) {}
}
function _syncSidebarBtns() {
  try { if (typeof window !== 'undefined' && typeof window.syncSidebarBtns === 'function') window.syncSidebarBtns(); } catch (_) {}
}
function _clearActiveTemplate() {
  try { if (typeof window !== 'undefined' && typeof window.clearActiveTemplate === 'function') window.clearActiveTemplate(); } catch (_) {}
}

/* P_mobile-topbar — incognito flag. Mirrored to window for the save guard. */
var incognitoOn = false;
try { window.incognitoOn = false; } catch (_) {}

/* Cross-module CURRENT_USER — single source is window.CURRENT_USER (mirrored
   below); no module-local copy so readers never drift. */
try { if (typeof window !== 'undefined' && window.CURRENT_USER === undefined) window.CURRENT_USER = null; } catch (_) {}

/* Cached user memories (see configurePromptSuffixes wiring in main.js).
   Centralized here so auth/sign-out clears hit the same array the getter reads. */
var _userMemories = [];
export function getUserMemories() { return _userMemories; }
export function clearUserMemories() { try { _userMemories = []; } catch (_) {} }

/* Post-auth grace window (see isInAuthGraceWindow). */
var _lastAuthSuccessAt = 0;
var AUTH_GRACE_MS = 3000;

/* Explicit "new chat" entry points (sidebar compose button, nav item,
   mobile top bar, ⌘⇧O). The current conversation is persisted to Recents
   automatically, so asking "start a new session?" there is pure friction:
   switch immediately. The confirm is kept only where work would be lost —
   a reply that is still streaming, or an exam in progress. */
export function startNewChat(){
  return resetApp({ confirmActiveSession: false });
}

export async function resetApp(options){
  var confirmActiveSession = !(options && options.confirmActiveSession === false);
  /* React owns #msgList and always leaves a wrapper element inside it,
     so DOM child count no longer signals an active session — use state.
     P_exam-confirm — also fire the "Start a new session?" confirm when
     the user is sitting in the exam panel (or has generated/submitted
     an exam). The exam lives on its own state fields (`_examInView`,
     `examTopic`, `examQuestions`, `examSubmitted`) that the original
     chat-only guard did not check, so clicking 新聊天/新会话 from the
     exam page used to skip straight to topicSetup with no warning.
     The dialog text ("会保存到「最近」") is still accurate — exam
     sessions are persisted to Recents via saveExamSession. */
  var _examDirty = !!stateStore.read("_examInView")
    || (typeof stateStore.read("examTopic") === "string" && stateStore.read("examTopic").length > 0
        && Array.isArray(stateStore.read("examQuestions")) && stateStore.read("examQuestions").length > 0)
    || !!stateStore.read("examSubmitted");
  var _hasActiveSession = stateStore.read("topic")||stateStore.read("kbNodes").length>0||(Array.isArray(stateStore.read("messages"))&&stateStore.read("messages").length>0);
  var _needsConfirm = _examDirty || (_hasActiveSession && (confirmActiveSession || turnState.chatStreaming));
  if(_needsConfirm){
    var ok=await showConfirm(_t("confirm.newSession.title"),_t("confirm.newSession.msg"),false);
    if(!ok){ window._nextProjectId=null; return false; }
  }
  publishThinkingTurnStart();
  /* Persist the current conversation without waiting on the network.
     If a save is already in flight, the state is snapshotted now and
     posted as soon as that request settles, so the new-session switch
     never stalls behind a POST + session-list roundtrip. */
  saveSessionBeforeReset();
  try { sessionStorage.removeItem('socrates-active-assistant'); } catch (_) {}
  /* P5.8 — clear the active prompt template. A new session
     is a fresh context; carrying over "summarize mode" from
     the previous chat would silently shape the first
     response of the new session. */
  _clearActiveTemplate();
  /* Abort any in-flight chat stream so its callbacks don't write to
     stateStore.read("messages") after we reset them. */
  if(window._activeChatAbort){try{window._activeChatAbort("session-reset")}catch(_){}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  resetShareToken();
  /* AUDIT-fix — drop any assembled-but-unsent multimodal payload from
     the previous session. askChatTurn() prefers turnState.pendingChatContent
     over its own text argument, so a stale value here (e.g. an image
     parts array from the last send) would be replayed as the first
     turn of the new session — the re-explain branch path
     (branchFromMessage → resetApp → askChatTurn) hit exactly this. */
  try{turnState.pendingChatContent=null}catch(_){}
  try{turnState.pendingAttachments=null}catch(_){}
  resetState();
  /* Preserve a project selected immediately before a fresh chat. */
  if(window._nextProjectId){
    stateStore.dispatch({
      type:"state/set",key:"currentProjectId",value:window._nextProjectId
    });
    window._nextProjectId=null;
  }

  toggleShareBtn();
  /* Go back to the main page — no chat session yet.
     P_exam-nav — also drop the ?exam=<uuid> URL and clear the
     #examView body + exam-only top bar elements so resetApp from
     inside an exam view (via the +New chat button or sidebar) lands
     on a clean topicSetup page instead of leaving the exam panel
     visible behind it. */
  setChatIdInURL(null);
  try { setExamIdInURL(null); } catch (_) {}
  document.getElementById("topicSetup").classList.remove("hidden");
  try { renderGreeting(); } catch (_) {}
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  if (typeof window.hideMainPages === "function") window.hideMainPages();
  /* Hide the exam-only top-bar elements (#examBackBtn / #examTitleBar)
     that openExamPanel() would have shown — the data-exam-only
     attribute is the selector used by exam.toggleExamOnlyTopBar. */
  document.querySelectorAll("[data-exam-only='true']").forEach(function (el) { el.classList.add("hidden"); });
  /* Drop the exam view's body content so a stale exam title / form
     doesn't bleed into the next view via a delayed render. */
  var _examBody = document.getElementById("examViewBody");
  if (_examBody) _examBody.innerHTML = "";
  /* P_exam-reset — hide the exam view itself so topicSetup is
     visible underneath. _examBody.innerHTML="" alone leaves the
     .exam-view shell visible with its solid background, covering
     the topic-setup page that was just revealed. */
  var _examEl = document.getElementById("examView");
  if (_examEl) _examEl.classList.add("hidden");
  /* prepareExamView hides the main content container. Re-enable it when
     starting a new chat from an exam or the topic composer remains hidden
     behind an already-closed exam shell. */
  var _mainInnerAfterExam = document.getElementById("mainInner");
  if (_mainInnerAfterExam) _mainInnerAfterExam.classList.remove("hidden");
  document.body.classList.remove("exam-active");
  toggleChatTopBarEls(false);
  clearLegacyMsgListChildren();
  /* P_app-reset-sync — the sole publishReactChatRuntime call for
     resetApp() is at the end (reason:"session-reset") after all
     DOM state and bridge metadata have been refreshed. Previously
     there was a premature "app-reset" call here (Bug 11) that
     triggered a React re-read before renderRecents / scroll reset /
     sidebar sync had run — the duplicate was wasteful and the
     interim state was incomplete. */
  clearComposer("topic");
  clearComposerPlugins("topic");
  clearComposerPlugins("chat");
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">'+(typeof t==="function"?_t("tutor.kbTopicFirst"):"Set a topic to build your knowledge map.")+'</div>';
  document.getElementById("chatStats").textContent="";
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc2=document.getElementById("teachingPlanContent");if(_tpc2)_tpc2.innerHTML="";
  updateStartBtn();
  _renderRecents();
  _renderMistakes();
  _updateMistakesBadge();
  scrollContainer().scrollTop=0;
  /* Mobile: close the drawer if it's open, and persist so a
     subsequent refresh doesn't re-open it. */
  if(window.innerWidth<768){
    var sb=document.getElementById("sidebar");
    var bd=document.getElementById("sidebarBackdrop");
    if(sb&&!sb.classList.contains("collapsed")){
      sb.classList.add("collapsed");
      try{window.sidebarOpen=false;}catch(_){};
      if(bd)bd.classList.remove("show");
      try{localStorage.setItem("socrates-sb","0")}catch {}
    }
  }
  _syncSidebarBtns();
  /* P_hide-mode-switch-in-conversation — re-sync the conversation-
     active body attribute after a reset so the top-bar Chat/Tutor
     switch reappears for the new session. The MutationObserver in
     mobileModeSwitch.js will already have fired when msgList was
     cleared (line above), this is belt-and-suspenders for the
     stateStore.read("topic") / stateStore.read("phase") / stateStore.read("kbNodes") fields. */
  if (typeof window.syncConversationActive === 'function') {
    try { window.syncConversationActive(); } catch (_) {}
  }
  publishReactChatRuntime({type:"state-synced",reason:"session-reset"});
  /* Focus the topic input so the user can start typing right away. */
  setTimeout(function(){
    focusComposer("topic");
  },50);
  return true;
}

export function syncIncognitoBtn(){
  var on=!!incognitoOn;
  try{document.body.setAttribute("data-incognito",on?"true":"false")}catch(_){}
  var btn=document.getElementById("mobileIncognitoBtn");
  if(btn){
    btn.setAttribute("aria-pressed",on?"true":"false");
    var title=on?"Incognito on — this chat won't be saved":"Incognito chat";
    btn.setAttribute("title",title);
    btn.setAttribute("aria-label",title);
  }
}

export async function toggleIncognito(){
  if(incognitoOn){
    /* Leaving incognito — reset the view while the flag is STILL on so
       saveCurrentSession() bails and the temporary chat is discarded,
       then turn incognito off for future (saved) sessions. */
    await resetApp();
    incognitoOn=false;
    try{window.incognitoOn=false;}catch(_){}
    syncIncognitoBtn();
    if(typeof showToast==="function")showToast(_t("incognito.off"));
    return;
  }
  /* Entering incognito — resetApp() saves any prior real session and
     wipes the view, THEN we flip the flag so the fresh conversation is
     never persisted. */
  await resetApp();
  incognitoOn=true;
  try{window.incognitoOn=true;}catch(_){}
  syncIncognitoBtn();
  if(typeof showToast==="function")showToast(_t("incognito.on"));
}

export function setCurrentUser(user){ try { window.CURRENT_USER = user; } catch (_) {} }

export function markAuthSuccess(){
  _lastAuthSuccessAt=Date.now();
}

export function isInAuthGraceWindow(){
  return (Date.now()-_lastAuthSuccessAt) < AUTH_GRACE_MS;
}

export function handleAuthExpired(cause){
  console.log("[auth] handleAuthExpired called, cause="+(cause||"apiFetch-401"));
  try{
    /* P_bleed-auth-expired — same per-user cache wipe as signOut().
       A 401 may fire mid-session while the user is still on the
       screen; without clearing _userMemories / geo info, the
       signin-gate UI would briefly show the previous user's
       memories in any subsequent system-context preview, and
       turnState.pendingChatContent could replay a draft image after the
       user signs back in. */
    try{clearUserMemories()}catch(_){}
    try{turnState.pendingChatContent=null}catch(_){}
    /* P_bleed-auth-expired — same comprehensive wipe as signOut(). A
       401 may fire mid-session; without clearing serverCache.sessions /
       apiConfig / _cmdKIndex, the sign-in gate's flash of
       stale sidebar or model-picker data could briefly show the
       previous user's sessions before the next signin's fetch
       resolves. */
    clearPerUserClientState();
    try{window.CURRENT_USER=null;}catch(_){}
    /* P_bleed-auth-expired-v2 — reset state so React components
       reading from state don't see the previous user's data after
       the gate shows. Without this, state.session, stateStore.read("messages"),
       stateStore.read("topic") etc. remain dirty until the next session load,
       and any React subscription that fires between the gate and
       the next user's first fetch could briefly render stale data. */
    resetState();
    turnState.chatStreaming=false;
    turnState.chatStopMode=false;
    publishReactChatRuntime({type:"state-synced",reason:"auth-expired"});
    /* Abort any active SSE chat stream so in-flight requests don't
        complete after the user has been sent to the auth gate and
        trigger further state mutations. */
    try{
      if(turnState.activeChatCtl){turnState.activeChatCtl.abort();turnState.activeChatCtl=null}
      if(window._activeChatAbort){window._activeChatAbort("session-expired");window._activeChatAbort=null}
    }catch(_){}
    if(window._onAuthExpiredListeners){
      window._onAuthExpiredListeners.forEach(function(fn){
        try{fn()}catch {/* auth listener threw */}
      });
    }
    /* Show the gate; the existing showGate() handles UI swap. */
    if(typeof showGate==="function"){showGate()}
    if(typeof showAuthSignin==="function"){showAuthSignin()}
    /* Inject a one-line hint above the sign-in form. We look for
       an existing auth banner element; if absent, we create a
       transient notice. */
    setTimeout(function(){
      var banner=document.getElementById("authExpiredBanner");
      if(!banner){
        banner=document.createElement("div");
        banner.id="authExpiredBanner";
        banner.className="auth-expired-banner";
        banner.textContent=_t("auth.sessionExpired");
        var gate=document.getElementById("authGate");
        if(gate){gate.insertBefore(banner,gate.firstChild)}
      }
    },0);
  }catch {/* handleAuthExpired failed */}
}

export function clearPerUserClientState(){
  /* In-memory module-level caches. */
  try{if(Array.isArray(serverCache.sessions))serverCache.sessions.length=0}catch(_){}
  /* P_recents-fetch-fail — reset the fetch-failed flag on user switch
     so the new user doesn't inherit the previous user's failure state. */
  try{serverCache.fetchFailed=false}catch(_){}
  try{apiConfig.activeId=null;apiConfig.providers=[]}catch(_){}
  try{_cmdKIndex=null;_cmdKIndexDocs=[];_cmdKResults=[];_cmdKSelected=0;_cmdKRecent=[]}catch(_){}
  try{resetCrossSessionKBCache()}catch(_){}
  try{_examAnswerSaveTimer=null;_examSaveInFlight=null}catch(_){}
  try{clearUserMemories()}catch(_){}
  try{if(turnState.pendingChatContent!==undefined)turnState.pendingChatContent=null}catch(_){}
  /* P_locale-ghost — `state.locale` was never a real field (the real
     language selector is window._currentLang, managed by i18n.js).
     The previous `window.state.locale=null` here only triggered the
     state/store.js Proxy's "unknown flat key, setting on root: locale"
     warning on every signin / user switch. Removed. */
  /* Persisted caches. */
  try{localStorage.removeItem("socrates-sessions-v2")}catch(_){}
  try{localStorage.removeItem("socrates-api")}catch(_){}
  try{localStorage.removeItem("socrates-guest")}catch(_){}
  try{localStorage.removeItem("socrates-projects")}catch(_){}
  try{localStorage.removeItem("socrates-recents-filter")}catch(_){}
  try{localStorage.removeItem("socrates-provider-keys")}catch(_){}
  try{localStorage.removeItem("socrates-websearch")}catch(_){}
  /* P_tutor-leak — socrates-appmode is a per-user preference but it
     was never wiped on signOut. A user who once toggled tutor mode
     leaves it set to "tutor" in localStorage; the next person to
     sign in on the same browser inherits tutor mode without ever
     touching the toggle. Clear it (and the runtime mirror) so the
     new session starts in the documented default of "chat". */
  try{localStorage.removeItem("socrates-appmode")}catch(_){}
  /* AUDIT-fix — reset the module binding so the next user starts in
      chat mode. setAppMode() syncs window.appMode internally. */
  try{setAppMode("chat")}catch(_){}
  try{if(typeof LAST_ACTIVE_ID_KEY!=="undefined"){try{localStorage.removeItem(LAST_ACTIVE_ID_KEY)}catch(_){}}}catch(_){}
  /* Re-render so the cleared state is visible immediately, not on
     the next user-driven re-render. */
  try{if(typeof renderRecents==="function")_renderRecents()}catch(_){}
  try{if(typeof renderMistakes==="function")_renderMistakes()}catch(_){}
  try{if(typeof updateMistakesBadge==="function")_updateMistakesBadge()}catch(_){}
  try{if(typeof renderProviderList==="function")_renderProviderList()}catch(_){}
  try{if(typeof syncModelPills==="function")syncModelPills()}catch(_){}
}

export async function signOut(){
  try{await apiFetch("/api/auth/logout",{method:"POST"})}catch(_){}
  /* Clear browser cookies on the current domain. The server already
   * cleared both the host-only and .topodrive.top variants of `sid`
   * and `csrf`, but belt-and-braces: also expire the host-only copy
   * locally so a re-login on the same subdomain doesn't see a
   * stale value. We use the bare hostname (no leading dot) for the
   * host-only match and skip the parent-domain variant — the
   * server's Set-Cookie with Domain=.topodrive.top will already
   * overwrite it on the next login. */
  var host=location.hostname;
  document.cookie.split(";").forEach(function(c){
    var eq=c.indexOf("="),name=eq>-1?c.substring(0,eq).trim():c.trim();
    if(!name)return;
    document.cookie=name+"=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie=name+"=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain="+host;
  });
  /* Re-fetch the CSRF token cookie so subsequent auth POSTs succeed. */
  try{await fetch("/api/v2/auth/csrf-token",{credentials:"include"})}catch(_){}
  /* P_bleed-signout — drain any in-flight save first, so the
     subsequent saveCurrentSession doesn't cascade into a stale
     saveState.saveDirty chain. */
  if(saveState.saveInFlight){
    try{await saveState.saveInFlight}catch(_){}
  }
  /* P_bleed-signout-v2 — save the current session BEFORE clearing
     any caches or state. Previously (Bug 1&2), clearPerUserClientState
     + CURRENT_USER=null + resetState ran before resetApp's internal
     saveCurrentSession(), causing doSave() to bail because CURRENT_USER
     was null and stateStore.read("topic") was empty — the active session was
     silently lost on every sign-out. */
  saveCurrentSession();
  if(saveState.saveInFlight){
    try{await saveState.saveInFlight}catch(_){}
  }
  /* P_bleed-signout — wipe every per-user cache so the next user on
      this browser starts from a clean slate. Clears _userMemories /
      geo info / turnState.pendingChatContent (in-memory) AND the full module-
      level set (serverCache.sessions, apiConfig, _cmdKIndex, …)
      plus localStorage entries that survive sign-out. */
  clearPerUserClientState();
  try{window.CURRENT_USER=null;}catch(_){}
  /* Reset state. */
  resetState();
  /* Abort any active chat stream — resetApp() isn't called from
     signOut (to avoid its "Start a new session?" confirm dialog), so
     we inline the essential stream teardown here. */
  if(window._activeChatAbort){try{window._activeChatAbort("signout")}catch(_){}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  resetShareToken();
  try{turnState.pendingChatContent=null}catch(_){}
  try{turnState.pendingAttachments=null}catch(_){}
  showGate();
  renderUserFooter();
}

export async function toggleAppMode(targetMode){
  /* Segmented controls pass their exact destination; legacy callers without
     an argument (for example the in-conversation banner) retain toggle
     behaviour. Clicking the already-selected tab is intentionally a no-op. */
  var nextMode=(targetMode==="chat"||targetMode==="tutor")
    ? targetMode
    : (appMode === "tutor" ? "chat" : "tutor");
  if(nextMode===appMode){
    syncAppModeUI();
    return;
  }
  /* Mid-session switch: confirm before discarding the live session. */
  var msgList=document.getElementById("msgList");
  var hasRealMsgs=msgList&&Array.from(msgList.children).some(function(c){return !c.hasAttribute('data-react-message-list-empty');});
  var inSession=stateStore.read("topic")||stateStore.read("kbNodes")&&stateStore.read("kbNodes").length>0||(stateStore.read("phase")==="chat")||hasRealMsgs;
  if(inSession){
    var next=_t(nextMode==="tutor"?"tutor.modeTutor":"tutor.modeChat");
    var ok=await showConfirm(_t("confirm.switchMode.title").replace("{mode}",next),
      _t("confirm.switchMode.msg"),
      false);
    if(!ok)return;
    /* P_save-before-mode-switch — await save completion before
       resetting, so the session is fully persisted when the user
       comes back to it in the other mode. Previously (Bug 8) this
       was fire-and-forget, and resetApp could clear state while
       doSave() was still in flight, causing the saved payload to
       capture empty/partial state. */
    var _sp = saveCurrentSession();
    if(_sp){try{await _sp}catch(_){}}
    resetApp();
  }
  /* P_tutor-sync — select the requested module-level mode directly (not
     window.appMode, which could be stale). setAppMode() also synchronizes
     the legacy window binding. */
  setAppMode(nextMode);
  try{localStorage.setItem("socrates-appmode",appMode)}catch {}
  syncAppModeUI();
  syncSidebarForMode();
  updateModeBadge();
  /* v3.0 design — re-render the mode banner after a switch so the
     label and switch-button text flip. */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.renderModeBanner==="function"){
    try{tutorSocratic.renderModeBanner()}catch(_){}
  }
}

export function updateModeBadge(){
  var badge=document.getElementById("chatModeBadge");
  if(!badge)return;
  var mode=(window.appMode==="tutor")?"tutor":"chat";
  var label=(typeof window.t==="function")
    ? window.t(mode==="tutor"?"tutor.modeTutor":"tutor.modeChat")
    : (mode==="tutor"?"Tutor":"Chat");
  badge.textContent=label;
  badge.classList.remove("hidden");
  /* U-H2-anim — re-trigger the badgeSwap CSS keyframes each time the
     mode flips. The badge style has `animation: badgeSwap …` set
     unconditionally, so the keyframes only run on first render. We
     toggle the inline `animation` to none, force a reflow, and
     restore so the animation replays on every mode change. */
  var prevMode=badge.getAttribute("data-mode");
  badge.setAttribute("data-mode",mode);
  badge.classList.remove("mode-tutor","mode-chat");
  badge.classList.toggle("mode-tutor",mode==="tutor");
  badge.classList.toggle("mode-chat",mode==="chat");
  if(prevMode!==mode){
    badge.style.animation="none";
    /* Force layout flush so the browser sees the cleared animation
       before we restore it — without this, the animation property
       resets but no reflow happens and the keyframes don't replay. */
    void badge.offsetWidth;
    badge.style.animation="";
  }
}
