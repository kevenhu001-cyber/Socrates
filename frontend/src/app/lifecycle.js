/* app/lifecycle.js — extracted from main.js (B6 batch).
 * App lifecycle: reset, incognito, auth gate/expiry, sign-out,
 * app-mode switching, mode badge. Zero-behavior-change lift.
 * Render/list surfaces still owned by main.js resolve via window.*.
 */
import { stateStore, resetState } from '../state/store.js';
import { turnState } from '../chat/turnState.js';
import { saveState } from '../session/saveState.js';
import { serverCache } from '../session/serverCache.js';
import { apiConfig, appMode, setAppMode, syncAppModeUI, syncSidebarForMode, LAST_ACTIVE_ID_KEY } from '../config/providers.js';
import { apiFetch } from '../util/api.js';
import { showGate, showAuthSignin } from '../auth/index.js';
import { showConfirm } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import { clearComposer, focusComposer } from '../react/composer-input/controller.ts';
import { clearComposerPlugins } from '../react/composer/pluginSelection.ts';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { publishThinkingTurnStart } from '../ui/messageSnapshot.js';
import { resetShareToken, toggleShareBtn } from '../ui/share.js';
import { clearSessionRouteInURL } from '../session/store.js';
import { scrollContainer } from '../ui/scroll.js';
import { updateComposerBtn } from '../ui/topicSetup.js';
import { saveCurrentSession, saveSessionBeforeReset } from '../session/persistence.js';
import { syncModelPills } from '../pickers.js';
import { renderUserFooter } from '../ui/profile.js';
/* cross-session KB module removed — the kbCrossBody panel it fed was
   deleted with the cross-session knowledge section; nothing calls
   loadAndRenderCrossSessionKB any more. */
import { resetCmdKSearchState } from '../ui/cmdK.js';
import { renderGreeting } from '../ui/greeting.js';
import { activateMainView } from '../ui/mainViewController.js';
import { setActiveNav } from '../sidebar/nav.js';
import { reportSwallow } from '../util/reportSwallow.ts';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) { reportSwallow(e, 'app/lifecycle._t'); }
  return fallback != null ? fallback : key;
}
function _renderRecents() {
  try { if (typeof window !== 'undefined' && typeof window.renderRecents === 'function') window.renderRecents(); } catch (e) { reportSwallow(e, 'app/lifecycle._renderRecents'); }
}
function _renderMistakes() {
  try { if (typeof window !== 'undefined' && typeof window.renderMistakes === 'function') window.renderMistakes(); } catch (e) { reportSwallow(e, 'app/lifecycle._renderMistakes'); }
}
function _updateMistakesBadge() {
  try { if (typeof window !== 'undefined' && typeof window.updateMistakesBadge === 'function') window.updateMistakesBadge(); } catch (e) { reportSwallow(e, 'app/lifecycle._updateMistakesBadge'); }
}
function _renderProviderList() {
  try { if (typeof window !== 'undefined' && typeof window.renderProviderList === 'function') window.renderProviderList(); } catch (e) { reportSwallow(e, 'app/lifecycle._renderProviderList'); }
}
function _syncSidebarBtns() {
  try { if (typeof window !== 'undefined' && typeof window.syncSidebarBtns === 'function') window.syncSidebarBtns(); } catch (e) { reportSwallow(e, 'app/lifecycle._syncSidebarBtns'); }
}
function _clearActiveTemplate() {
  try { if (typeof window !== 'undefined' && typeof window.clearActiveTemplate === 'function') window.clearActiveTemplate(); } catch (e) { reportSwallow(e, 'app/lifecycle._clearActiveTemplate'); }
}

/* P_mobile-topbar — incognito flag. Mirrored to window for the save guard. */
var incognitoOn = false;
try { window.incognitoOn = false; } catch (e) { reportSwallow(e, 'app/lifecycle.incognitoMirror'); }

/* Cross-module CURRENT_USER — single source is window.CURRENT_USER (mirrored
   below); no module-local copy so readers never drift. */
try { if (typeof window !== 'undefined' && window.CURRENT_USER === undefined) window.CURRENT_USER = null; } catch (e) { reportSwallow(e, 'app/lifecycle.currentUserMirror'); }

/* Cached user memories (see configurePromptSuffixes wiring in main.js).
   Centralized here so auth/sign-out clears hit the same array the getter reads. */
var _userMemories = [];
export function getUserMemories() { return _userMemories; }
export function clearUserMemories() { try { _userMemories = []; } catch (e) { reportSwallow(e, 'app/lifecycle.clearUserMemories'); } }

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
  var _examWasOpen = !!stateStore.read("_examInView")
    || document.body.classList.contains("exam-active");
  var _examDirty = _examWasOpen
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
  try { sessionStorage.removeItem('socrates-active-assistant'); } catch (e) { reportSwallow(e, 'app/lifecycle.resetApp.clearActiveAssistant'); }
  /* P5.8 — clear the active prompt template. A new session
     is a fresh context; carrying over "summarize mode" from
     the previous chat would silently shape the first
     response of the new session. */
  _clearActiveTemplate();
  /* Abort any in-flight chat stream so its callbacks don't write to
     stateStore.read("messages") after we reset them. */
  if(window._activeChatAbort){try{window._activeChatAbort("session-reset")}catch(e){reportSwallow(e,'app/lifecycle.resetApp.abortActive');}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(e){reportSwallow(e,'app/lifecycle.resetApp.abortTurnState');}}
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
  try{turnState.pendingChatContent=null}catch(e){reportSwallow(e,'app/lifecycle.resetApp.clearPendingChat');}
  try{turnState.pendingAttachments=null}catch(e){reportSwallow(e,'app/lifecycle.resetApp.clearPendingAttachments');}
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
  /* P_url-single-write — one replaceState drops both ?chat= and ?exam=.
     Previously two consecutive calls each rewrote the same URL. */
  clearSessionRouteInURL();
  activateMainView("topicSetup", document);
  /* Reset the React nav snapshot as well as the main pane. Otherwise a
     directory stays highlighted after any new-chat entry point. */
  setActiveNav(null);
  try { renderGreeting(); } catch (e) { reportSwallow(e, 'app/lifecycle.resetApp.renderGreeting'); }
  if (_examWasOpen) {
    var _examBody = document.getElementById("examViewBody");
    if (_examBody) _examBody.innerHTML = "";
  }
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
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc2=document.getElementById("teachingPlanContent");if(_tpc2)_tpc2.innerHTML="";
  updateComposerBtn();
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
      try{window.sidebarOpen=false;}catch(e){reportSwallow(e,'app/lifecycle.resetApp.sidebarOpenFlag');}
      if(bd)bd.classList.remove("show");
      try{localStorage.setItem("socrates-sb","0")}catch (e) {reportSwallow(e, 'app/lifecycle.resetApp'); }
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
    try { window.syncConversationActive(); } catch (e) { reportSwallow(e, 'app/lifecycle.resetApp.syncConversationActive'); }
  }
  publishReactChatRuntime({type:"state-synced",reason:"session-reset"});
  /* Focus the topic input immediately so the user can start typing without delay. */
  try { focusComposer("topic"); } catch (e) { reportSwallow(e, 'app/lifecycle.resetApp.focusComposer'); }
  requestAnimationFrame(function(){
    try { focusComposer("topic"); } catch (e) { reportSwallow(e, 'app/lifecycle.resetApp.focusComposerRAF'); }
  });
  return true;
}

export function syncIncognitoBtn(){
  var on=!!incognitoOn;
  try{document.body.setAttribute("data-incognito",on?"true":"false")}catch(e){reportSwallow(e,'app/lifecycle.syncIncognitoBtn');}
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
    try{window.incognitoOn=false;}catch(e){reportSwallow(e,'app/lifecycle.toggleIncognitoOff');}
    syncIncognitoBtn();
    if(typeof showToast==="function")showToast(_t("incognito.off"));
    return;
  }
  /* Entering incognito — resetApp() saves any prior real session and
     wipes the view, THEN we flip the flag so the fresh conversation is
     never persisted. */
  await resetApp();
  incognitoOn=true;
  try{window.incognitoOn=true;}catch(e){reportSwallow(e,'app/lifecycle.toggleIncognitoOn');}
  syncIncognitoBtn();
  if(typeof showToast==="function")showToast(_t("incognito.on"));
}

export function setCurrentUser(user){ try { window.CURRENT_USER = user; } catch (e) { reportSwallow(e, 'app/lifecycle.setCurrentUser'); } }

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
    try{clearUserMemories()}catch(e){reportSwallow(e,'app/lifecycle.handleAuthExpired.clearMemories');}
    try{turnState.pendingChatContent=null}catch(e){reportSwallow(e,'app/lifecycle.handleAuthExpired.clearPendingChat');}
    /* P_bleed-auth-expired — same comprehensive wipe as signOut(). A
       401 may fire mid-session; without clearing serverCache.sessions /
       apiConfig / _cmdKIndex, the sign-in gate's flash of
       stale sidebar or model-picker data could briefly show the
       previous user's sessions before the next signin's fetch
       resolves. */
    clearPerUserClientState();
    try{window.CURRENT_USER=null;}catch(e){reportSwallow(e,'app/lifecycle.handleAuthExpired.clearCurrentUser');}
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
    }catch(e){reportSwallow(e,'app/lifecycle.handleAuthExpired.abortActive');}
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
  }catch(e){/* handleAuthExpired failed */ reportSwallow(e,'app/lifecycle.handleAuthExpired.outer');}
}

export function clearPerUserClientState(){
  /* In-memory module-level caches. */
  try{if(Array.isArray(serverCache.sessions))serverCache.sessions.length=0}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.serverCache');}
  /* P_recents-fetch-fail — reset the fetch-failed flag on user switch
     so the new user doesn't inherit the previous user's failure state. */
  try{serverCache.fetchFailed=false}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.fetchFailed');}
  try{apiConfig.activeId=null;apiConfig.providers=[]}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.apiConfig');}
  try{resetCmdKSearchState()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.cmdKIndex');}
  /* exam.js is lazy — if it was never imported its save state is already
     pristine, so only reset when the module is actually loaded. */
  try{var _em=(typeof window!=="undefined")&&window.__examModule;if(_em&&typeof _em.resetExamSaveState==="function")_em.resetExamSaveState()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.examSave');}
  try{clearUserMemories()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.userMemories');}
  try{if(turnState.pendingChatContent!==undefined)turnState.pendingChatContent=null}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.pendingChat');}
  /* P_locale-ghost — `state.locale` was never a real field (the real
     language selector is window._currentLang, managed by i18n.js).
     The previous `window.state.locale=null` here only triggered the
     state/store.js Proxy's "unknown flat key, setting on root: locale"
     warning on every signin / user switch. Removed. */
  /* Persisted caches. */
  try{localStorage.removeItem("socrates-sessions-v2")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.sessionsCache','expected');}
  try{localStorage.removeItem("socrates-api")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.apiCache','expected');}
  try{localStorage.removeItem("socrates-guest")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.guestCache','expected');}
  try{localStorage.removeItem("socrates-projects")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.projectsCache','expected');}
  try{localStorage.removeItem("socrates-recents-filter")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.recentsFilterCache','expected');}
  try{localStorage.removeItem("socrates-provider-keys")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.providerKeysCache','expected');}
  try{localStorage.removeItem("socrates-websearch")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.websearchCache','expected');}
  /* P_tutor-leak — socrates-appmode is a per-user preference but it
     was never wiped on signOut. A user who once toggled tutor mode
     leaves it set to "tutor" in localStorage; the next person to
     sign in on the same browser inherits tutor mode without ever
     touching the toggle. Clear it (and the runtime mirror) so the
     new session starts in the documented default of "chat". */
  try{localStorage.removeItem("socrates-appmode")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.appmodeCache','expected');}
  /* AUDIT-fix — reset the module binding so the next user starts in
      chat mode. setAppMode() syncs window.appMode internally. */
  try{setAppMode("chat")}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.setAppMode');}
  try{localStorage.removeItem(LAST_ACTIVE_ID_KEY)}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.lastActiveId','expected');}
  /* Re-render so the cleared state is visible immediately, not on
     the next user-driven re-render. */
  try{if(typeof renderRecents==="function")_renderRecents()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.renderRecents');}
  try{if(typeof renderMistakes==="function")_renderMistakes()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.renderMistakes');}
  try{if(typeof updateMistakesBadge==="function")_updateMistakesBadge()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.updateMistakesBadge');}
  try{if(typeof renderProviderList==="function")_renderProviderList()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.renderProviderList');}
  try{if(typeof syncModelPills==="function")syncModelPills()}catch(e){reportSwallow(e,'app/lifecycle.clearPerUser.syncModelPills');}
}

export async function signOut(){
  try{await apiFetch("/api/auth/logout",{method:"POST"})}catch(e){reportSwallow(e,'app/lifecycle.signOut.apiLogout');}
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
  try{await fetch("/api/v2/auth/csrf-token",{credentials:"include"})}catch(e){reportSwallow(e,'app/lifecycle.signOut.csrfRefresh');}
  /* P_bleed-signout — drain any in-flight save first, so the
     subsequent saveCurrentSession doesn't cascade into a stale
     saveState.saveDirty chain. */
  if(saveState.saveInFlight){
    try{await saveState.saveInFlight}catch(e){reportSwallow(e,'app/lifecycle.signOut.drainInFlight1');}
  }
  /* P_bleed-signout-v2 — save the current session BEFORE clearing
     any caches or state. Previously (Bug 1&2), clearPerUserClientState
     + CURRENT_USER=null + resetState ran before resetApp's internal
     saveCurrentSession(), causing doSave() to bail because CURRENT_USER
     was null and stateStore.read("topic") was empty — the active session was
     silently lost on every sign-out. */
  saveCurrentSession();
  if(saveState.saveInFlight){
    try{await saveState.saveInFlight}catch(e){reportSwallow(e,'app/lifecycle.signOut.drainInFlight2');}
  }
  /* P_bleed-signout — wipe every per-user cache so the next user on
      this browser starts from a clean slate. Clears _userMemories /
      geo info / turnState.pendingChatContent (in-memory) AND the full module-
      level set (serverCache.sessions, apiConfig, _cmdKIndex, …)
      plus localStorage entries that survive sign-out. */
  clearPerUserClientState();
  try{window.CURRENT_USER=null;}catch(e){reportSwallow(e,'app/lifecycle.signOut.clearCurrentUser');}
  /* Reset state. */
  resetState();
  /* Abort any active chat stream — resetApp() isn't called from
     signOut (to avoid its "Start a new session?" confirm dialog), so
     we inline the essential stream teardown here. */
  if(window._activeChatAbort){try{window._activeChatAbort("signout")}catch(e){reportSwallow(e,'app/lifecycle.signOut.abortActive');}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(e){reportSwallow(e,'app/lifecycle.signOut.abortTurnState');}}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  resetShareToken();
  try{turnState.pendingChatContent=null}catch(e){reportSwallow(e,'app/lifecycle.signOut.clearPendingChat');}
  try{turnState.pendingAttachments=null}catch(e){reportSwallow(e,'app/lifecycle.signOut.clearPendingAttachments');}
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
    if(_sp){try{await _sp}catch(e){reportSwallow(e,'app/lifecycle.toggleAppMode.saveCurrent');}}
    /* The user already confirmed the switch above, so skip resetApp()'s own
       "start a new session?" prompt (it would otherwise fire a second dialog
       for the same session). Awaited: resetApp() is async and the mode must
       not flip until the reset has run — and if an exam-dirty confirm inside
       it is cancelled, the switch is abandoned rather than applied on top of
       the un-reset session. */
    var _resetOk = await resetApp({ confirmActiveSession: false });
    if(_resetOk===false)return;
  }
  /* P_tutor-sync — select the requested module-level mode directly (not
     window.appMode, which could be stale). setAppMode() also synchronizes
     the legacy window binding. */
  setAppMode(nextMode);
  try{localStorage.setItem("socrates-appmode",appMode)}catch (e) {reportSwallow(e, 'app/lifecycle.toggleAppMode'); }
  syncAppModeUI();
  syncSidebarForMode();
  /* v3.0 design — re-render the mode banner after a switch so the
     label and switch-button text flip. */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.renderModeBanner==="function"){
    try{tutorSocratic.renderModeBanner()}catch(e){reportSwallow(e,'app/lifecycle.toggleAppMode.renderModeBanner');}
  }
}
