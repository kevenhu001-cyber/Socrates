import { esc } from '../render/helpers.js';
import { stateStore } from '../state/store.js';

/* Locale lookup + {placeholder} substitution. i18n.js's t() deliberately
   does no interpolation, and the established call convention is
   t(key).replace('{n}', v) (see ui/diagnosticQuestion.js), so the
   substitution lives here rather than changing a helper every existing
   caller shares. */
function tr(key, vars) {
  var v = (typeof window.t === 'function') ? window.t(key) : key;
  /* A missing key resolves to the key itself — showing "kb.confidence" in
     the UI is a loud bug, which beats a blank label. */
  if (!vars) return v;
  return String(v).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

/* The model emits raw internalized / fuzzy / blank; the panel shows a
   human label. Unknown values pass through so a future status the backend
   invents is still readable instead of rendering as "undefined". */
function statusLabel(status) {
  var s = status || 'blank';
  return tr('kb.status.' + s);
}

function saveCurrentSessionSafe() { if (typeof window.saveCurrentSession === 'function') window.saveCurrentSession(); }

export function kbNodeHtml(n,cls){
  /* Click on the row toggles the boundary detail panel. A separate small
     "→ go" button (added in mountKBDetail) is what actually jumps the
     chat to this node — so reading a note never accidentally triggers a
     new question. */
  return '<div class="kb-node" data-node-idx="'+n.idx+'"><div class="kb-dot '+cls+'"></div><span class="kb-name">'+esc(n.name)+'</span>'+(n.questions?'<span class="kb-count">'+esc(tr('kb.questions',{n:n.questions}))+'</span>':'')+'</div>';
}

export function toggleKBDetail(idx){
  var cont=document.getElementById("kbContent");
  var existing=cont.querySelector('.kb-node-detail[data-node-idx="'+idx+'"]');
  if(existing){existing.remove();return}
  /* Close any other open detail panels (accordion behaviour). */
  var others=cont.querySelectorAll('.kb-node-detail');
  others.forEach(function(o){o.remove()});
  var node=window.stateStore.read("kbNodes")[idx];
  if(!node)return;
  var detail=document.createElement("div");
  detail.className="kb-node-detail";
  detail.setAttribute("data-node-idx",idx);
  detail.innerHTML=renderKBDetailInner(node,idx);
  /* Insert the detail panel right after the matching .kb-node row. */
  var row=cont.querySelector('.kb-node[data-node-idx="'+idx+'"]');
  if(row&&row.parentNode)row.parentNode.insertBefore(detail,row.nextSibling);
  else cont.appendChild(detail);
  wireKBDetailEvents(detail,idx);
}

function renderKBDetailInner(node,idx){
  var html="";
  html+='<div class="kb-detail-head">';
  html+='<div class="kb-detail-status kb-detail-status-'+(node.status||"blank")+'">'+esc(statusLabel(node.status))+'</div>';
  html+='<button class="kb-go-btn" data-go="'+idx+'" title="'+esc(tr('kb.goTitle'))+'">'+esc(tr('kb.go'))+'</button>';
  html+='</div>';
  /* Confidence 1-5 dots. */
  var cs=typeof node.confidence_score==="number"?node.confidence_score:0;
  html+='<div class="kb-detail-row"><span class="kb-detail-label">'+esc(tr('kb.confidence'))+'</span><div class="kb-conf-row">';
  for(var i=1;i<=5;i++){
    html+='<button class="kb-conf-dot'+(i<=cs?' on':'')+'" data-conf="'+i+'" title="'+esc(tr('kb.confidenceSet',{n:i}))+'"></button>';
  }
  html+='</div></div>';
  /* System note (read-only). */
  html+='<div class="kb-detail-row"><span class="kb-detail-label">'+esc(tr('kb.systemNote'))+'</span>';
  html+='<div class="kb-system-note">'+(node.system_note?esc(node.system_note):'<em style="color:hsl(var(--text-500))">'+esc(tr('kb.noSystemNote'))+'</em>')+'</div></div>';
  /* User note (editable). */
  html+='<div class="kb-detail-row"><label class="kb-detail-label" for="kbUserNote">'+esc(tr('kb.yourNote'))+'</label>';
  html+='<textarea class="kb-user-note" id="kbUserNote" name="kbUserNote" rows="3" placeholder="'+esc(tr('kb.placeholderNote'))+'">'+esc(node.user_note||"")+'</textarea></div>';
  /* Snapshot history.
     P_kb-history-shape — this used to read h.from / h.to off
     node.history and render "<date> ? → ?" for every row. Neither field
     ever existed: saveBoundarySnapshot (tutorSocratic.js) writes
     { date, at, summary, counts } into the SESSION-level
     boundariesHistory, and node.history was always undefined, so the
     section was permanently empty at best. Now reads the snapshots that
     actually exist, so opening a node shows when the map was last saved
     and how it looked. */
  var hist=stateStore.read('boundariesHistory')||[];
  html+='<div class="kb-detail-row"><span class="kb-detail-label">'+esc(tr('kb.history'))+'</span>';
  if(hist.length){
    html+='<ul class="kb-history">';
    hist.slice(-8).reverse().forEach(function(h){
      /* Tolerate both shapes: older rows may carry a numeric `at`. */
      var when=h&&(h.date||h.at);
      if(typeof when==="number"){
        try{when=new Date(when).toISOString().slice(0,10)}catch(_){}
      }
      html+='<li><span class="kb-hist-date">'+esc(when||"")+'</span>'
          +(h&&h.summary?esc(h.summary):'')+'</li>';
    });
    html+='</ul>';
  }else{
    html+='<div class="kb-history-empty">'+esc(tr('kb.noHistory'))+'</div>';
  }
  html+='</div>';
  return html;
}

function wireKBDetailEvents(detail,idx){
  var node=window.stateStore.read("kbNodes")[idx];
  if(!node)return;
  function updateNode(patch){
    var nodes=stateStore.read('kbNodes')||[];
    var current=nodes[idx];
    if(!current)return null;
    var next=Object.assign({},current,patch);
    stateStore.dispatch({type:'state/set',key:'kbNodes',value:nodes.map(function(item,index){return index===idx?next:item})});
    node=next;
    return next;
  }
  /* "→ go" button. */
  var goBtn=detail.querySelector('[data-go]');
  if(goBtn){goBtn.onclick=function(e){e.stopPropagation();jumpToNode(idx)}}
  /* Confidence dots. */
  detail.querySelectorAll('[data-conf]').forEach(function(btn){
    btn.onclick=function(e){
      e.stopPropagation();
      var v=parseInt(btn.getAttribute("data-conf"),10);
      updateNode({confidence_score:(node.confidence_score===v)?0:v});
      detail.querySelectorAll('[data-conf]').forEach(function(b){
        var n=parseInt(b.getAttribute("data-conf"),10);
        b.classList.toggle("on",n<=node.confidence_score);
      });
      saveCurrentSessionSafe();
    };
  });
  /* User note textarea — debounced save. */
  var ta=detail.querySelector(".kb-user-note");
  if(ta){
    var debounceTimer=null;
    ta.oninput=function(){
      clearTimeout(debounceTimer);
      debounceTimer=setTimeout(function(){
        updateNode({user_note:ta.value});
        saveCurrentSessionSafe();
      },500);
    };
    ta.onclick=function(e){e.stopPropagation()};
  }
}

async function jumpToNode(idx){
  stateStore.dispatch({type:'state/batch',patch:{currentNode:idx,stuckCount:0,substantiveCount:0}});
  if (typeof window.askNextQuestion === "function") await window.askNextQuestion();
  saveCurrentSessionSafe();
}
