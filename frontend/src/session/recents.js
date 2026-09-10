/* session/recents.js — extracted from main.js (B2/B6 batch).
 * Recents fetching + session deletion/restore/purge/archive helpers.
 * Zero-behavior-change lift. Render surfaces (renderRecents,
 * renderArchivedList) and app reset resolve via window.* at call time.
 */
import { stateStore, resetState } from '../state/store.js';
import { serverCache } from './serverCache.js';
import { saveState, rememberDeletedSession, forgetDeletedSession } from './saveState.js';
import { getVisibleSessions, getArchivedSessionsFrom, sweepExpiredArchivesFrom, setChatIdInURL } from './store.js';
import { getKnownTagsFromSessions } from '../ui/recentsHelpers.js';
import { apiFetch } from '../util/api.js';
import { clearLocalMemory } from '../storage/localMemory.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { resetShareToken, toggleChatTopBarEls, toggleShareBtn } from '../ui/share.js';
import { showConfirm } from '../ui/confirm.js';
import { showToast } from '../ui/toast.js';
import { clearComposer } from '../react/composer-input/controller.ts';
import { clearComposerPlugins } from '../react/composer/pluginSelection.ts';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.js';
import { updateStartBtn } from '../ui/topicSetup.js';
import { turnState } from '../chat/turnState.js';

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
function _renderArchivedList() {
  try { if (typeof window !== 'undefined' && typeof window.renderArchivedList === 'function') window.renderArchivedList(); } catch (_) {}
}
function _resetApp() {
  return (typeof window !== 'undefined' && typeof window.resetApp === 'function') ? window.resetApp() : Promise.resolve(false);
}
function _saveCurrentSession() {
  try { if (typeof window !== 'undefined' && typeof window.saveCurrentSession === 'function') return window.saveCurrentSession(); } catch (_) {}
  return null;
}
function _currentUser() {
  try { if (typeof window !== 'undefined') return window.CURRENT_USER || null; } catch (_) {}
  return null;
}

export function getRecents(){
  /* P2.3 — sweep local expired archives first so the Recents
     list and the Storage modal never disagree. */
  sweepExpiredArchives();
  /* P2.3 — archived sessions are hidden from the default
     Recents list. Users restore them from the Storage modal. */
  return getVisibleSessions(serverCache.sessions);
}

export function getKnownTags(){
  return getKnownTagsFromSessions(serverCache.sessions);
}

export async function refreshServerSessions(){
  if(!_currentUser())return[];
  /* P_delbug-cleanup — the previous `console.warn("[DEL-BUG] ...")`
     tracing logs (incl. a `new Error().stack` capture on every call)
     were left over from a delete-flow debugging session and flooded
     the console on every login / save / delete. Demoted to
     console.debug so they stay available under Verbose level without
     polluting the default console. */
  var ok=false;
  try{
    var r=await apiFetch("/api/sessions?limit=200");
    serverCache.sessions=Array.isArray(r&&r.sessions)?r.sessions:[];
    ok=true;
  }catch(e){
    /* P_recents-fetch-fail — retry ONCE on transient failures (network
       blip, 5xx, 429). This covers the "some devices" report where a
       flaky connection or a momentary 502/503 left the user with an
       empty Recents list. Non-retryable errors (401/403/404) skip the
       retry so we don't waste a roundtrip on a definitely-broken
       request. The original bug silently swallowed ALL errors here,
       leaving serverCache.sessions=[] and showing "No recent sessions yet."
       even when the user had sessions on the server. */
    var status=e&&e.status;
    var retryable = status===0 || status===408 || status===429 ||
                    (typeof status==="number" && status>=500 && status<600);
    if(retryable){
      try{
        await new Promise(function(res){setTimeout(res,400)});
        var r2=await apiFetch("/api/sessions?limit=200");
        serverCache.sessions=Array.isArray(r2&&r2.sessions)?r2.sessions:[];
        ok=true;
      }catch {/* still failing — surface below */}
    }
  }
  serverCache.fetchFailed=!ok;
  return serverCache.sessions.slice();
}
/* P_recents-fetch-fail — manual retry entry point bound from the
   "Couldn't load sessions — Retry" empty state. Re-runs the fetch,
   then re-renders so the user sees the result immediately. */
export async function retryRecentsFetch(){
  try{showToast(_t("toast.loadingSessions"))}catch(_){}
  try{await refreshServerSessions()}catch(_){}
  try{_renderRecents()}catch(_){}
}
try{window.retryRecentsFetch=retryRecentsFetch}catch(_){}

export function findServerSessionIndex(id){
  for(var i=0;i<serverCache.sessions.length;i++){
    if(serverCache.sessions[i].id===id)return i;
  }
  return -1;
}

export async function actuallyDeleteSession(id,ev){
  if(!_currentUser())return;
  /* P_delete-stale-click — the trash button lives inside
     `.recent-item` which has onclick="loadSession(...)". Without
     stopping propagation here, clicking delete would ALSO trigger
     loadSession(deletedId): stateStore.read("currentSessionId") would flip to the
     about-to-be-deleted id, the chat panel would re-render its
     messages, and the user would see "the deleted session's records"
     (verbatim bug report) until the async GET returned 404 and the
     cleanup branch fired. */
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  if(ev&&ev.preventDefault)ev.preventDefault();
  /* P_serialize-delete — await any in-flight save before sending
     the DELETE. Without this, a concurrent _saveCurrentSession()
     POST could land on the server AFTER the DELETE has committed,
     and the upsert would silently re-insert the deleted row —
     the session "comes back to life". Drain the pipeline first
     (including the saveState.saveDirty cascade), then register the tombstone
     so no subsequent save can race with the delete. */
  if(saveState.saveInFlight){
    try{await saveState.saveInFlight}catch(_){}
  }
  /* P_delete-stale — bounce the user out of the chat view if the
     deleted session is EITHER (a) the one currently on screen
     (stateStore.read("currentSessionId")) OR (b) referenced by the
     top-level stateStore.read("currentSessionId") mirror. Without checking
     both, a session whose currentSessionId drifted onto the
     top-level mirror (the duplicate-session bug we fixed) would
     get deleted but the chat view would keep rendering its
     messages because the bounce never fired. Also cancel any
     in-flight chat stream so a half-written reply doesn't
     resurface after the delete. */
  
  var wasActive=stateStore.read("currentSessionId")===id||stateStore.read("currentSessionId")===id;
  if(wasActive){
    if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
    if(window._activeChatAbort){try{window._activeChatAbort("session-deleted")}catch(_){}}
    bounceOutOfArchivedSession();
  }
  /* Drop the session from the local cache immediately so the UI
     updates without waiting for the round-trip. If the server
     call fails, the catch handler re-fetches and re-renders. */
  serverCache.sessions=serverCache.sessions.filter(function(s){return s.id!==id;});
  clearLocalMemory(id);
  _renderRecents();
  /* P_delete-resurrect — register this id with the doSave()
     tombstone set BEFORE the network round-trip. Any POST that
     arrives during the flight window, or any post-flight
     `saveState.saveDirty` cascade triggered by a streaming callback, will
     see the tombstone and bail instead of re-inserting the row.
     We register both the canonical id and any alias we may have
     had for it (defence against the duplicate-session drift that
     made stateStore.read("currentSessionId") / stateStore.read("currentSessionId")
     disagree in past incidents). */
  rememberDeletedSession(id);
  /* Single-step: server's DELETE /api/sessions/:id now deletes
     directly without requiring archive first. */
  apiFetch("/api/sessions/"+encodeURIComponent(id),{
    method:"DELETE"
  }).then(function(){
    showToast(_t("session.deleted"));
    /* P_delete-stale — if no sessions remain, make sure the
       chat view is hidden and the topic-setup is showing so the
       user lands on a clean "start a new conversation" surface
       instead of a blank / stale chat panel. */
    refreshServerSessions().then(function(){
      /* P_delete-resurrect — the server has now confirmed the
         row is gone. From this point on, a streaming-callback
         POST that happens to carry this same id is no longer
         a "resurrection" risk (the row is genuinely deleted),
         and the very next _saveCurrentSession() that creates a
         NEW session with a coincidentally-equivalent id would
         be falsely blocked. Lift the tombstone. */
      forgetDeletedSession(id);
      var remaining=getRecents().length;
      if(remaining===0){
        bounceOutOfArchivedSession();
      }else if(wasActive){
        _renderRecents();
      }
    });
  }).catch(function(err){
    /* delete sync failed */
    try{showToast(_t("session.deleteFailedRefresh").replace("{msg}", err&&err.message||"server error"),4000)}catch(_){}
    /* P_delete-resurrect — keep the tombstone on failure. The
       local mirror no longer has the row (we filtered it at
       t≈0) and the server claim is "404 / error", so any
       pending POST is at best a useless retry and at worst a
       resurrection. Lift it only after a refresh confirms the
       server really is consistent. */
    refreshServerSessions().then(function(){
      var idx=findServerSessionIndex(id);
      if(idx<0)forgetDeletedSession(id);
    });
  });
}

/* P2.3 — record the archive timestamp locally. The local copy
   is the source of truth for the UI (filtered out of
   Recents, surfaced in the Storage modal). The server mirrors
   it via the POST /api/sessions/<id>/archive call in
   actuallyDeleteSession. */
export function restoreSession(id){
  if(!_currentUser())return;
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  serverCache.sessions[idx].archivedAt=null;
  apiFetch("/api/sessions/"+encodeURIComponent(id)+"/archive",{
    method:"DELETE"
  }).catch(function(){
    /* archive sync failed */
  });
  _renderRecents();
  _renderArchivedList();
}
/* P2.3 — permanent erase. Two-step: only available from the
   Storage modal (not the long-press delete), and requires
   typing the session title. Mirrors the backend's "must be
   archived first" constraint documented in
   docs/api/openapi.yaml P2.3 (409 on active session). */
export function confirmPurgeSession(id){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=serverCache.sessions[idx];
  if(!s.archivedAt){
    showToast(_t("session.archiveFirst"));
    return;
  }
  showConfirm(
    _t("confirm.deleteForever.title"),
    _t("confirm.deleteForever.msg").replace("{title}",s.title||s.topic||"this session"),
    true
  ).then(function(yes){
    if(!yes)return;
    apiFetch("/api/sessions/"+encodeURIComponent(id),{
      method:"DELETE"
    }).then(function(){
      /* P_purge-bounce — if the purged session is the active one,
         bounce out to the topic-setup screen so stale content isn't
         shown. without this, the chat view continues displaying the
         deleted session's messages, topic badge, and knowledge
         graph until the user manually navigates away. */
      var wasActive=stateStore.read("currentSessionId")===id||stateStore.read("currentSessionId")===id;
      if(wasActive){
        if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
        if(window._activeChatAbort){try{window._activeChatAbort("session-purged")}catch(_){}}
        bounceOutOfArchivedSession();
      }
      serverCache.sessions=serverCache.sessions.filter(function(r){return r.id!==id});
      clearLocalMemory(id);
      _renderArchivedList();
      _renderRecents();
      showToast(_t("session.deleted"));
    }).catch(function(err){
      showToast(_t("session.deleteFailedMsg").replace("{msg}", err&&err.message||"server error"));
    });
  });
}

/* P2.3 — return a list of archived sessions, sorted newest
   first, with entries older than 30 days filtered out (the
   server is expected to GC them too, but we mirror the
   policy client-side so the Storage modal doesn't show
   ghost rows). */
export function getArchivedSessions(){
  return getArchivedSessionsFrom(serverCache.sessions);
}
/* P2.3 — the localStorage mirror is swept the same way the
   server is expected to. Called from refreshServerSessions
   and on every read of getArchivedSessions. */
export function sweepExpiredArchives(){
  var result=sweepExpiredArchivesFrom(serverCache.sessions);
  serverCache.sessions=result.sessions;
  return result.changed;
}

/* P2.3 — bounce the user out of an archived session. Used by
   actuallyDeleteSession when the active session is the one
   being archived; the chat view collapses back to the topic
   screen. */
export function bounceOutOfArchivedSession(){
  resetShareToken();
  /* Abort any active chat stream so callbacks don't write to
     state after resetState() has cleared it. */
  if(window._activeChatAbort){try{window._activeChatAbort("archived-session")}catch(_){}}
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
  turnState.activeChatCtl=null;
  window._activeChatAbort=null;
  turnState.chatStreaming=false;
  turnState.chatStopMode=false;
  try{turnState.pendingChatContent=null}catch(_){}
  try{turnState.pendingAttachments=null}catch(_){}
  resetState();
  toggleShareBtn();
  setChatIdInURL(null);
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  if (typeof window.hideMainPages === "function") window.hideMainPages();
  toggleChatTopBarEls(false);
  clearLegacyMsgListChildren();
  publishReactChatRuntime({type:"state-synced",reason:"archived-session-reset"});
  clearComposer("topic");
  clearComposerPlugins("topic");
  clearComposerPlugins("chat");
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">'+(typeof t==="function"?_t("tutor.kbTopicFirst"):"Set a topic to build your knowledge map.")+'</div>';
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc=document.getElementById("teachingPlanContent");if(_tpc)_tpc.innerHTML="";
  document.getElementById("chatStats").textContent="";
  updateStartBtn();
}

/* ─── Session context menu (long-press / right-click) ───
   Delete, pin/unpin, and custom label via a floating popover.
   Uses touch timer for mobile, contextmenu for desktop. */

/* When non-null, the context menu is open for this session id.
   While set, click events on the corresponding .recent-item are
   blocked via pointer-events:none on the row element, preventing
   the synthetic click from navigating. */
/* B2: _ctxMenuSessionId centralized as serverCache.ctxMenuSessionId. */
