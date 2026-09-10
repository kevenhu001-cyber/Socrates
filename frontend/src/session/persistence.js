/* session/persistence.js — extracted from main.js (B2 batch).
 * Session save pipeline (requestSave/doSave) + unload keepalive wiring.
 * Zero-behavior-change lift. Main.js-local list/stats surfaces
 * (refreshServerSessions, renderRecents) resolve via window.* at call time.
 */
import { stateStore } from '../state/store.js';
import { saveState, deletedSessionGuard } from './saveState.js';
import { generateId } from '../util/ids.js';
import { pushChatIdToURL } from './store.js';
import { buildBeaconPayload } from './beacon.js';
import { generateSessionTitle } from '../chat/sessionTitle.js';
import { rebuildCmdKIndex } from '../ui/cmdK.js';
import { toggleShareBtn } from '../ui/share.js';
import { apiFetch } from '../util/api.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
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
function _appMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (_) {}
  return 'chat';
}

export function saveCurrentSession(){
  /* P_mobile-topbar — incognito ("无痕对话") sessions are never
     persisted. Entering incognito first saves any prior real session
     (toggleIncognito calls resetApp before flipping this flag), so
     bailing here only blocks the temporary conversation itself. */
  if(typeof window!=="undefined"&&window.incognitoOn)return null;
  if(!stateStore.read("topic"))return null;
  if(!(typeof window!=="undefined"&&window.CURRENT_USER))return null; /* not signed in; do nothing */
  /* P_context-race — discard saves during session loading. The
     loadSession function is in the middle of rebuilding state and
     any intercepted save would capture mismatched sessionId vs
     messages, causing "会话串台" (context cross-contamination). */
  if(saveState.loadingSession) return null;
  /* If a save is already running, mark dirty and let it coalesce. */
  if(saveState.saveInFlight){
    saveState.saveDirty=true;
    return saveState.saveInFlight;  /* return the existing in-flight promise */
  }
  saveState.saveDirty=false;
  doSave();
  /* doSave() sets saveState.saveInFlight to the fetch+then promise, or leaves
     it as-is if early-exit guards (deleted session guard, empty topic)
     fired. Return it for callers that want to await completion. */
  return saveState.saveInFlight;
}


function doSave(){
  /* Guard against saving after state has been reset — the
     saveState.saveDirty cascade in saveCurrentSession bypasses the
     stateStore.read("topic") check after the first in-flight save finishes.
     Without this guard, deleting a session while a save is
     in-flight causes the queued doSave() to POST empty state
     to the server, creating a ghost session. */
  /* P_delete-resurrect — refuse to POST a session the user has
     already deleted on this page. The check fires BEFORE the
     stateStore.read("topic") guard (which is the original guard) because a
     session whose topic was retained after delete (e.g. the
     "give it back so the user can re-create it" UX I'd half-
     designed at one point) would otherwise bypass the topic
     check and silently re-insert the deleted row. */
  var sid=stateStore.read("currentSessionId");
  if(deletedSessionGuard.has(sid)){
    saveState.saveInFlight=null;
    saveState.saveDirty=false;
    return;
  }
  if(!stateStore.read("topic"))return;
  var now=Date.now();
  /* P1.1 — read from the authoritative stateStore.read("messages") list, NOT
     from the live DOM. The DOM may still hold a half-rendered
     streaming bubble (text content only, no KaTeX), and reading
     partial innerHTML was a known source of "messages got mangled"
     reports on reload. We render once at finish() time and store
     both rawText and html.

     P_streaming-save — EXCLUDE messages whose `type` is "streaming"
     (the in-progress placeholder that addStreamingMessage pushes into
     stateStore.read("messages")). If we save while a stream is in flight, the
     placeholder gets committed to the messages table with an empty /
     partial rawText. The server now upserts by clientId (sessions.js
     onConflictDoUpdate, NOTE-P01-05: this replaced the old insert-only
     path), so a later finish() save CAN overwrite the placeholder, but
     persisting half-rendered content is still wrong: a reload between
     the streaming save and the finish() save would surface a truncated
     reply, and it churns needless writes. Filtering streaming
     placeholders here is the root fix; they are only persisted after
     finish() flips type to "assistant". */
  var messages=stateStore.read("messages")
    .filter(function(m){return m.type!=="streaming"})
    .map(function(m){
    return {
      clientId:m.clientId||null,
      role:m.role,
      html:m.html,
      rawText:m.rawText||null,
      type:m.type||null,
      reasoningContent:m.reasoningContent||null,
      /* P_attachments — round-trip the inlined image dataUrl /
       * parsed text body so reloads restore thumbnails without a
       * re-upload. The server caps to 20 in sessions.js; we
       * trim here too to keep payloads small. */
      attachments:Array.isArray(m.attachments)?m.attachments.slice(0,20):[],
      /* P_tool-history — persist tool-call cards (including artifact
       * image IDs) so session reload re-renders the cards and their
       * images. Without this, toolCalls are silently dropped at save
       * time and never restored on reload. */
      toolCalls:Array.isArray(m.toolCalls)?m.toolCalls.slice(0,20):[],
    };
  });
  var sessionId=stateStore.read("currentSessionId")||generateId();
  /* P_context-race — snapshot the session ID at capture time so the
     POST callback can detect whether a session switch happened while
     the request was in-flight. If the active session changed, the
     POST response (server-adopted id) must NOT overwrite the new
     session's URL / state. */
  var capturedSessionId=sessionId;
  var payload={
    id:sessionId,
    topic:stateStore.read("topic"),
    title:stateStore.read("sessionTitle")||stateStore.read("topic"),
    domain:stateStore.read("domain")||stateStore.read("topic"),
    projectId:stateStore.read("currentProjectId")||null,
    mode:_appMode(),
    messages:messages,
    kbNodes:stateStore.read("kbNodes"),
    mistakes:stateStore.read("mistakes")||[],
    currentNode:stateStore.read("currentNode"),
    totalQ:stateStore.read("totalQ"),
    phase:stateStore.read("phase"),
    /* Task 2.4 — persist the teaching-stage state machine so a
       reloaded session resumes at the right stage. The backend
       sessions.js uses .passthrough() so these extra fields are
       accepted without schema changes. */
    teachingStage:stateStore.read("teachingStage")||"motivate",
    currentExampleIdx:stateStore.read("currentExampleIdx")||0,
    practiceAttempts:stateStore.read("practiceAttempts")||0,
    practicePhase:stateStore.read("practicePhase")||"foundation",
    teachingPlan:stateStore.read("teachingPlan")||null,
    /* v3.0 design — knowledge boundary history (snapshots) and
       mistake filter are also persisted so the sidebar state
       survives reloads. */
    boundariesHistory:stateStore.read("boundariesHistory")||[],
    mistakeFilter:stateStore.read("mistakeFilter")||"all",
    /* P1.1 — persist branchedFrom metadata so a reloaded session
       shows "Branched from ..." in the sidebar. */
    branchedFrom:stateStore.read("branchedFrom")||null,
    updatedAt:now,
  };
  /* P_dup-session — sync the namespace mirror too. Without this,
     a second saveCurrentSession in the same tick reads
     stateStore.read("currentSessionId") (still null because line 1228
     only fires after the server responds), regenerates a new id,
     and the server creates a SECOND session record — the user
     sees the same chat appear twice in Recents. The two fields
     have to stay in lock-step synchronously, not just on the
     async POST response. */
  stateStore.dispatch({type:"state/set",key:"currentSessionId",value:sessionId});
  toggleShareBtn();
  /* Kick off AI title generation based on the user's first input. */
  if(!stateStore.read("sessionTitle"))generateSessionTitle();
  /* P1.2 — rebuild the Cmd-K search index after every save so the
     user can immediately find the message they just sent.
     P_lag-fix — Fuse builds over SERVER_SESSIONS + stateStore.read("messages")
     and can stall the click→paint path on the new-session click by
     100-500ms when there are many sessions. Defer to idle time so
     the greeting stream starts unblocked; Cmd-K still rebuilds
     synchronously the first time it's opened (lazy guard at line 893). */
  if(typeof requestIdleCallback==="function"){
    requestIdleCallback(function(){rebuildCmdKIndex()},{timeout:2000});
  }else{
    setTimeout(function(){rebuildCmdKIndex()},0);
  }
  /* Fire-and-forget write to server. The local SERVER_SESSIONS cache is
     refreshed on next renderRecents; we don't block the UI on the roundtrip.
     P0.0 — adopt the server's canonical session id when it differs
     from what we sent. Pre-UUID fix the client generated identifiers
     like "mq61wc16-ayb8j6" and the server swapped in a fresh UUID
     before inserting. Without this adoption step, every subsequent
     save kept sending the original (rejected) id, breaking the upsert
     and producing duplicate rows. */
  saveState.saveInFlight=apiFetch("/api/sessions",{method:"POST",body:payload}).then(function(r){
    /* P_delete-resurrect — if this session was deleted while the
       POST was in-flight (rememberDeletedSession set a tombstone),
       do NOT adopt the server's id or update state. The server may
       have processed this upsert after the DELETE (race), potentially
       resurrecting the row. Instead, just refresh the server list
       which will reflect the DELETE (or the next DELETE cycle). */
    if(deletedSessionGuard.has(capturedSessionId)){
      return _refreshServerSessions();
    }
    /* P_context-race — if the user switched to a different session
       while this POST was in-flight, do NOT adopt the server's id
       (it belongs to the old session) and do NOT update the URL. */
    if(stateStore.read("currentSessionId")!==capturedSessionId)return _refreshServerSessions();
    if(r&&r.id&&r.id!==sessionId){
      stateStore.dispatch({type:"state/set",key:"currentSessionId",value:r.id});
      pushChatIdToURL(r.id);
    }
    return _refreshServerSessions();
  }).then(function(){
    /* P_streaming-survival — after a successful save (the stream
       completed normally), clear the server-side streaming_text
       so a reload doesn't show partial content. Fire-and-forget;
       failure is harmless. */
    var curSid=stateStore.read("currentSessionId")||stateStore.read("currentSessionId");
    if(curSid){
      apiFetch("/api/sessions/"+encodeURIComponent(curSid),{
        method:"PATCH",
        body:{streamingText:null,streamingReasoning:null},
        timeoutMs:5000,
      }).catch(function(){});
    }
    _renderRecents();}).catch(function(e){
    /* F1a — surface the save failure so the user knows their
       conversation isn't being persisted. Without this the recent
       list can silently lose new entries (Bug1). showToast lives at
       main.js:5226 (signature: msg only); _t() is window.t set by
       i18n.js. The default 1800ms timeout is too short for an error
       toast, so we re-implement a longer-lived variant inline. */
    try{
      var el=document.createElement("div");
      el.className="msg-toast msg-toast-error";
      el.textContent=_t("sessions.save_failed","Save failed")+": "+e.message+(e.requestId?(" (ref "+e.requestId+")"):"");
      document.body.appendChild(el);
      requestAnimationFrame(function(){el.classList.add("visible")});
      setTimeout(function(){
        el.classList.remove("visible");
        setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el)},300);
      },5000);
    }catch(_){}
  }).then(function(){
    /* Clear the in-flight flag BEFORE re-checking dirty so a
       queued save picks up the latest state (and the just-adopted
       server id, if any) instead of re-sending a stale id. */
    saveState.saveInFlight=null;
    if(saveState.saveDirty){
      saveState.saveDirty=false;
      doSave();
    }
  });
}


/* P_save-on-unload — page lifecycle handlers that prevent loss of
 * the latest AI response when the user refreshes or closes the tab
 * before the async saveCurrentSession() POST completes.
 *
 * beforeunload: Shows a "Leave site?" confirmation dialog if a save
 *   is still in-flight, giving it time to complete. The user can
 *   choose to stay (letting the save finish) or leave anyway.
 *
 * pagehide: Fires after beforeunload, right before the page is torn
 *   down. Uses fetch(keepalive:true) as a last-chance save attempt
 *   so the server receives the session data even if the page unloads. */
export function installUnloadSave(){
  /* P_save-unload-ref — read CSRF token synchronously from the cookie
     (available during page teardown). Same pattern as getCsrfToken in
     util/api.js but inlined to avoid an import dependency. */
  function _beaconCsrf(){
    var m=document.cookie.match(/\bcsrf=([^;]+)/);
    return m?m[1]:null;
  }
  function _beaconSave(){
    /* Only fire if we have data worth saving and a save is pending. */
    if(!saveState.saveInFlight||!stateStore.read("currentSessionId")||!(typeof window!=="undefined"&&window.CURRENT_USER))return;
    /* F3: payload shape lives in session/beacon.js (unit-tested); the
       keepalive wiring stays here because it runs during page teardown. */
    var payload=buildBeaconPayload({
      sessionId:stateStore.read("currentSessionId"),
      topic:stateStore.read("topic"),
      sessionTitle:stateStore.read("sessionTitle"),
      appMode:_appMode(),
      messages:stateStore.read("messages"),
    });
    if(!payload)return;
    var csrf=_beaconCsrf();
    /* Beacon save must stay a raw fetch: apiFetch uses AbortController +
       JSON parsing which is incompatible with keepalive during pagehide. */
    try{
      fetch("/api/v2/sessions",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          ...(csrf?{"X-CSRF-Token":csrf}:{}),
        },
        body:JSON.stringify(payload),
        credentials:"include",
        keepalive:true,
      }).catch(function(){});
    }catch(_){}
  }
  /* beforeunload — show confirmation if a save is in-flight. */
  window.addEventListener("beforeunload",function(e){
    if(saveState.saveInFlight){
      e.preventDefault();
      e.returnValue="";
    }
  });
  /* pagehide — last-chance keepalive fetch (fires before the page is
     torn down). Also fire on visibilitychange as a secondary guard. */
  window.addEventListener("pagehide",_beaconSave);
  window.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="hidden")_beaconSave();
  });
}

installUnloadSave();
