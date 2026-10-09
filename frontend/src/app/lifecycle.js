/* app/lifecycle.js — application lifecycle entrypoint.
 * Incognito, auth expiry and sign-out live here; reset, user-scoped cleanup,
 * and Chat/Tutor transitions are delegated to focused modules below.
 * Render/list surfaces still owned by the legacy shell resolve via window.*.
 */
import { resetState } from '../state/store.js';
import { turnState } from '../chat/turnState.js';
import { saveState } from '../session/saveState.js';
import { apiFetch } from '../util/api.js';
import { showGate, showAuthSignin } from '../auth/index.js';
import { showToast } from '../ui/toast.js';
import { startNewComposerSession } from '../react/composer-input/lifecycle.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { resetShareToken } from '../ui/share.js';
import { saveCurrentSession } from '../session/persistence.js';
import { renderUserFooter } from '../ui/profile.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { resetApp } from './lifecycle/reset.js';
import { clearPerUserClientState } from './lifecycle/clientState.js';
import { clearUserMemories, getUserMemories } from './lifecycle/userMemory.js';
import { translateLifecycleText as _t } from './lifecycle/helpers.js';
import { toggleAppMode } from './lifecycle/mode.js';

export { resetApp, clearPerUserClientState, clearUserMemories, getUserMemories, toggleAppMode };


/* P_mobile-topbar — incognito flag. Mirrored to window for the save guard. */
var incognitoOn = false;
try { window.incognitoOn = false; } catch (e) { reportSwallow(e, 'app/lifecycle.incognitoMirror'); }

/* Cross-module CURRENT_USER — single source is window.CURRENT_USER (mirrored
   below); no module-local copy so readers never drift. */
try { if (typeof window !== 'undefined' && window.CURRENT_USER === undefined) window.CURRENT_USER = null; } catch (e) { reportSwallow(e, 'app/lifecycle.currentUserMirror'); }

/* Post-auth grace window (see isInAuthGraceWindow). */
var _lastAuthSuccessAt = 0;
var AUTH_GRACE_MS = 3000;

/* Explicit "new chat" entry points (sidebar compose button, nav item,
   mobile top bar, ⌘⇧O). The current conversation is persisted to Recents
   automatically, so asking "start a new session?" there is pure friction:
   switch immediately. The confirm is kept only where work would be lost —
   a reply that is still streaming, or an exam in progress. */
export function startNewChat(){
  return startNewComposerSession(resetApp);
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
       providerConfig / _cmdKIndex, the sign-in gate's flash of
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
      level set (serverCache.sessions, providerConfig, _cmdKIndex, …)
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
