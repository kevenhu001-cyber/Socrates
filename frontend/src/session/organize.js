/* session/organize.js — extracted from main.js (B6 batch).
 * Session tags, context menu, drag-to-project, row diff/publish helpers.
 * Zero-behavior-change lift. Render surfaces resolve via window.*.
 */
import { stateStore } from '../state/store.js';
import { serverCache } from './serverCache.js';
import { findServerSessionIndex, getKnownTags, getRecents, refreshServerSessions } from './recents.js';
import { getRecentsFilter } from '../sidebar/index.js';
import { filterRecentsByChip } from '../ui/recentsHelpers.js';
import { apiFetch } from '../util/api.js';
import { esc } from '../render/helpers.js';
import { showToast } from '../ui/toast.js';

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

export function openTagEditor(id,e){
  if(e){e.stopPropagation();e.preventDefault()}
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=serverCache.sessions[idx];
  /* Reuse a singleton popover; positioning is recomputed each
     time so the popover lands next to the row the user clicked. */
  var pop=document.getElementById("tagEditorPopover");
  if(!pop){
    pop=document.createElement("div");
    pop.id="tagEditorPopover";
    pop.className="tag-editor-popover";
    document.body.appendChild(pop);
  }
  pop.dataset.sessionId=id;
  var known=getKnownTags().filter(function(t){return!(s.tags||[]).indexOf(t)>=0});
  pop.innerHTML=
    '<div class="tag-editor-head">Tags for this session</div>'+
    '<div class="tag-editor-current">'+
      ((s.tags||[]).map(function(t){
        return '<span class="tag-pill removable" data-tag="'+esc(t)+'">'+esc(t)+
          '<button class="tag-pill-x" data-tag-remove="'+esc(t)+'" title="Remove">×</button>'+
        '</span>';
      }).join("")||'<span class="tag-editor-empty">No tags yet</span>')+
    '</div>'+
    '<div class="tag-editor-input-row">'+
      '<input class="tag-editor-input" id="tagEditorInput" placeholder="'+_t("tag.placeholder")+'" maxlength="30" autocomplete="off">'+
      '<button class="tag-editor-add" id="tagEditorAdd">Add</button>'+
    '</div>'+
    (known.length?'<div class="tag-editor-suggest"><div class="tag-editor-suggest-label">Suggested</div>'+
      known.slice(0,12).map(function(t){
        return '<button class="tag-editor-suggest-btn" data-tag-suggest="'+esc(t)+'">'+esc(t)+'</button>';
      }).join("")+
    '</div>':'')+
    '<div class="tag-editor-foot">'+
      '<button class="tag-editor-done">Done</button>'+
    '</div>';
  /* Position. */
  var row=(e&&e.currentTarget&&e.currentTarget.closest(".recent-item"))||null;
  if(row){
    var r=row.getBoundingClientRect();
    pop.style.top=Math.min(window.innerHeight-300,r.bottom+6)+"px";
    pop.style.left=Math.max(8,Math.min(window.innerWidth-340,r.right-340))+"px";
  }else{
    pop.style.top="20vh";
    pop.style.left="50%";
    pop.style.transform="translateX(-50%)";
  }
  pop.classList.add("visible");
  /* Wire up handlers. */
  var input=pop.querySelector("#tagEditorInput");
  var addBtn=pop.querySelector("#tagEditorAdd");
  function commitInput(){
    var v=(input.value||"").trim();
    if(!v)return;
    /* Accept comma-separated multi-add. */
    v.split(/[,,]/).forEach(function(part){
      var t=part.trim().slice(0,30);
      if(t)addTagToSession(id,t);
    });
    input.value="";
  }
  input.onkeydown=function(ev){
    if(ev.key==="Enter"){ev.preventDefault();commitInput()}
    else if(ev.key==="Escape"){ev.preventDefault();closeTagEditor()}
  };
  addBtn.onclick=commitInput;
  pop.querySelector(".tag-editor-done").onclick=closeTagEditor;
  pop.querySelectorAll("[data-tag-remove]").forEach(function(b){
    b.onclick=function(){
      removeTagFromSession(id,b.getAttribute("data-tag-remove"));
    };
  });
  pop.querySelectorAll("[data-tag-suggest]").forEach(function(b){
    b.onclick=function(){
      addTagToSession(id,b.getAttribute("data-tag-suggest"));
    };
  });
  /* Click-outside dismiss. */
  setTimeout(function(){
    if(!document.body._tagEditorClickBound){
      document.body._tagEditorClickBound=true;
      document.addEventListener("click",function(ev){
        var p=document.getElementById("tagEditorPopover");
        if(p&&p.classList.contains("visible")&&!p.contains(ev.target)&&!ev.target.closest("[data-tag-open]")){
          closeTagEditor();
        }
      });
    }
  },0);
  setTimeout(function(){input.focus()},0);
}
export function closeTagEditor(){
  var pop=document.getElementById("tagEditorPopover");
  if(pop)pop.classList.remove("visible");
}
export function addTagToSession(id,tag){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=serverCache.sessions[idx];
  s.tags=Array.isArray(s.tags)?s.tags.slice():[];
  if(s.tags.indexOf(tag)>=0)return;
  if(s.tags.length>=12){
    showToast(_t("tags.maxTags"));
    return;
  }
  s.tags.push(tag);
  apiFetch("/api/sessions/"+encodeURIComponent(id)+"/tags",{
    method:"PUT",
    body:{tags:s.tags},
  }).catch(function(err){
    console.debug("[tags] server sync failed:",err&&err.message);
  });
  _renderRecents();
  /* Re-open the popover with the updated state. */
  openTagEditor(id,{stopPropagation:function(){},preventDefault:function(){},currentTarget:document.querySelector('.recent-item[data-recent-actual="'+id+'"] .tag-btn')});
}
export function removeTagFromSession(id,tag){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=serverCache.sessions[idx];
  s.tags=(s.tags||[]).filter(function(t){return t!==tag});
  apiFetch("/api/sessions/"+encodeURIComponent(id)+"/tags",{
    method:"PUT",
    body:{tags:s.tags},
  }).catch(function(){
    /* tags sync failed */
  });
  _renderRecents();
  openTagEditor(id,{stopPropagation:function(){},preventDefault:function(){},currentTarget:document.querySelector('.recent-item[data-recent-actual="'+id+'"] .tag-btn')});
}
export function closeSessionContextMenu(){
  serverCache.ctxMenuSessionId=null;
  var sb=document.getElementById("sidebar");
  if(sb)sb.classList.remove("ctx-menu-block");
  var pop=document.getElementById("sessionContextMenu");
  if(pop){pop.classList.remove("visible");setTimeout(function(){if(pop&&pop.parentNode)pop.parentNode.removeChild(pop)},200)}
}

/* Drag-and-drop session onto a project. */
var _dragSessionId = null;
export function onSessionDragStart(event, sessionId){
  _dragSessionId = sessionId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", sessionId);
  /* Add a class to the dragged element. */
  event.target.classList.add("dragging");
}
export function onSessionDragEnd(event){
  event.target.classList.remove("dragging");
  _dragSessionId = null;
}
/* Drop handler for project rows. Legacy spaces-panel entry point —
   currently unreferenced (drag move goes through the React session list);
   kept with _ prefix so the intent is explicit and lint stays green. */
export function _onProjectDrop(event, projectId){
  event.preventDefault();
  event.stopPropagation();
  var sessionId = _dragSessionId || event.dataTransfer.getData("text/plain");
  if(!sessionId || !projectId) return;
  moveSessionToProject(sessionId, projectId);
}
/* Expose drag functions globally so inline ondragstart/ondragend work. */

/* Move a session to a project. */
export function moveSessionToProject(sessionId, projectId){
  var projects = window.__projectsCache || [];
  var project = projects.filter(function(p){ return p.id === projectId; })[0];
  if(!project) return;
  /* Update the session on the server. */
  if(typeof apiFetch === "function"){
    apiFetch("/api/sessions/" + encodeURIComponent(sessionId), { method: "PATCH", body: { projectId: projectId } })
      .then(function(){
        /* Update local state. */
        if(stateStore.read("currentSessionId") === sessionId){
          stateStore.dispatch({type:"state/set",key:"currentProjectId",value:projectId});
          window.__activeProject = project;
        }
        closeSessionContextMenu();
        if(typeof refreshServerSessions === "function") refreshServerSessions();
        if(typeof renderRecents === "function") _renderRecents();
        if(typeof showToast === "function") showToast(_t("toast.movedToProject").replace("{name}", project.name));
      })
      .catch(function(){
        if(typeof showToast === "function") showToast(_t("toast.moveSessionFailed"));
      });
  }
}
/* Click-outside dismiss for context menu.
   When ctx-menu-block is active (synthetic click from long-press),
   clicks inside #sidebar are ignored — they passed through the
   pointer-events:none barrier and are not intentional. */
;(function(){
  document.addEventListener("click",function(ev){
    var pop=document.getElementById("sessionContextMenu");
    if(!pop||!pop.classList.contains("visible"))return;
    if(pop.contains(ev.target))return;
    var sb=document.getElementById("sidebar");
    if(sb){
      /* If the block class is active and the click is inside the
         sidebar, it's a synthetic click from long-press — ignore. */
      if(sb.classList.contains("ctx-menu-block")&&sb.contains(ev.target))return;
    }
    closeSessionContextMenu();
  });
})();

/* P_render-throttle — coalesce rapid _renderRecents() calls into a
   single animation frame. Without this, saveCurrentSession (called
   3-5x per chat turn) triggers 3-5 full list rebuilds, causing
   visible stutter with 20+ sessions. */
/* React migration bridge — publishes the session list data so the React
   session list component can render declaratively. Works under `?react=1`;
   legacy mode never installs the bridge, so this is a cheap no-op. */
/* PERF: returns the PREVIOUS row object when every field is equal, so an
   unchanged row is referentially identical across publishes. Without this
   the mapper minted fresh objects each time and React.memo on SessionRow
   could never hit. */
var _rowCache=Object.create(null);
export function _sessionRowFields(s){
  return {
    id: s.id,
    title: s.title||"",
    topic: s.topic||"",
    updatedAt: s.updated_at||s.updatedAt||null,
    createdAt: s.created_at||s.createdAt||null,
    totalQ: s.total_q||s.totalQ||0,
    mode: s.mode||"",
    phase: s.phase||"",
    kind: s.kind||"",
    pinned: !!s.pinned,
    tags: Array.isArray(s.tags)?s.tags:[],
    label: "",
    archivedAt: typeof s.archivedAt==="number"?s.archivedAt:null,
    branchedFrom: s.branchedFrom||null,
  };
}
export function _sameRow(a,b){
  if(!a||!b)return false;
  if(a.title!==b.title||a.topic!==b.topic||a.updatedAt!==b.updatedAt
    ||a.createdAt!==b.createdAt||a.totalQ!==b.totalQ||a.mode!==b.mode
    ||a.phase!==b.phase||a.kind!==b.kind||a.pinned!==b.pinned
    ||a.label!==b.label||a.archivedAt!==b.archivedAt)return false;
  if(a.branchedFrom!==b.branchedFrom){
    if(!a.branchedFrom||!b.branchedFrom)return false;
    if(a.branchedFrom.sessionId!==b.branchedFrom.sessionId
      ||a.branchedFrom.messageId!==b.branchedFrom.messageId
      ||a.branchedFrom.reExplain!==b.branchedFrom.reExplain)return false;
  }
  if(a.tags!==b.tags){
    if(a.tags.length!==b.tags.length)return false;
    for(var i=0;i<a.tags.length;i++){if(a.tags[i]!==b.tags[i])return false}
  }
  return true;
}
export function _stableSessionRow(s){
  var next=_sessionRowFields(s);
  var prev=_rowCache[next.id];
  if(_sameRow(prev,next))return prev;
  _rowCache[next.id]=next;
  return next;
}
export function _publishSessionList(){
  try{
    var bridge=window.__socratesSessionListBridge;
    if(!bridge||typeof bridge.publish!=="function")return;
    var allSessions=getRecents();
    var sessions=allSessions;
    var filter=getRecentsFilter();
    /* Apply the persistent tag filter, same as doRenderRecents. */
    sessions=filterRecentsByChip(sessions,filter);
    /* Apply search filter. */
    var searchQ=((typeof window!=="undefined"&&window.RECENTS_SEARCH_QUERY)||"").trim().toLowerCase();
    if(searchQ){
      sessions=sessions.filter(function(s){
        var hay=((s.title||"")+" "+(s.topic||"")).toLowerCase();
        return hay.indexOf(searchQ)!==-1;
      });
    }
    /* Drop cache entries for sessions that no longer exist, so deleting
       sessions in a long-lived tab cannot grow _rowCache without bound.
       Keyed off the UNFILTERED list — a row hidden by the current tag or
       search filter is still live and must keep its identity. */
    var _live=Object.create(null);
    for(var _i=0;_i<allSessions.length;_i++){
      if(allSessions[_i]&&allSessions[_i].id)_live[allSessions[_i].id]=true;
    }
    var _keys=Object.keys(_rowCache);
    for(var _k=0;_k<_keys.length;_k++){
      if(!_live[_keys[_k]])delete _rowCache[_keys[_k]];
    }
    bridge.publish({
      sessions: sessions.map(_stableSessionRow),
      currentSessionId: stateStore.read("currentSessionId"),
      searchQuery: searchQ,
      filter: filter,
      fetchFailed: !!window.SERVER_SESSIONS_FETCH_FAILED,
    });
  }catch(_){/* swallow — bridge is best-effort */}
}


export function cycleActiveProject(){
  var projects = window.__projectsCache || [];
  if(!projects.length) return;
  var current = stateStore.read("currentProjectId");
  var idx = -1;
  if(current) idx = projects.findIndex(function(p){ return p.id === current; });
  var next = projects[(idx + 1) % projects.length];
  if(!next) return;
  /* Move current chat to the next project. */
  stateStore.dispatch({type:"state/set",key:"currentProjectId",value:next.id});
  window.__activeProject = next;
  var sessionId = stateStore.read("currentSessionId");
  if(sessionId){
    try{
      apiFetch("/api/sessions/" + encodeURIComponent(sessionId), { method: "PATCH", body: { projectId: next.id } });
    }catch(_){}
  }
  if(typeof refreshServerSessions === "function") refreshServerSessions();
  if(typeof renderRecents === "function") _renderRecents();
  if(typeof showToast === "function") showToast(_t("toast.projectSwitched").replace("{name}", next.name));
}
