import { esc } from '../render/helpers.js';
import { stateStore } from '../state/store.js';

function tr(key) { return typeof window.t === 'function' ? window.t(key) : key; }
function saveCurrentSessionSafe() { if (typeof window.saveCurrentSession === 'function') window.saveCurrentSession(); }

export function kbNodeHtml(n,cls){
  /* Click on the row toggles the boundary detail panel. A separate small
     "→ go" button (added in mountKBDetail) is what actually jumps the
     chat to this node — so reading a note never accidentally triggers a
     new question. */
  return '<div class="kb-node" data-node-idx="'+n.idx+'"><div class="kb-dot '+cls+'"></div><span class="kb-name">'+esc(n.name)+'</span>'+(n.questions?'<span class="kb-count">'+n.questions+' Qs</span>':'')+'</div>';
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
  html+='<div class="kb-detail-status kb-detail-status-'+(node.status||"blank")+'">'+esc(node.status||"blank")+'</div>';
  html+='<button class="kb-go-btn" data-go="'+idx+'" title="Jump chat to this node">→ go</button>';
  html+='</div>';
  /* Confidence 1-5 dots. */
  var cs=typeof node.confidence_score==="number"?node.confidence_score:0;
  html+='<div class="kb-detail-row"><span class="kb-detail-label">Confidence</span><div class="kb-conf-row">';
  for(var i=1;i<=5;i++){
    html+='<button class="kb-conf-dot'+(i<=cs?' on':'')+'" data-conf="'+i+'" title="Set confidence to '+i+'"></button>';
  }
  html+='</div></div>';
  /* System note (read-only). */
  html+='<div class="kb-detail-row"><span class="kb-detail-label">System note</span>';
  html+='<div class="kb-system-note">'+(node.system_note?esc(node.system_note):'<em style="color:hsl(var(--text-500))">No system note yet.</em>')+'</div></div>';
  /* User note (editable). */
  html+='<div class="kb-detail-row"><label class="kb-detail-label" for="kbUserNote">Your note</label>';
  html+='<textarea class="kb-user-note" id="kbUserNote" name="kbUserNote" rows="3" placeholder="'+tr("kb.placeholderNote")+'">'+esc(node.user_note||"")+'</textarea></div>';
  /* History list. */
  var hist=node.history||[];
  html+='<div class="kb-detail-row"><span class="kb-detail-label">History</span>';
  if(hist.length){
    html+='<ul class="kb-history">';
    hist.forEach(function(h){
      html+='<li><span class="kb-hist-date">'+esc(h.date||"")+'</span> <span class="kb-hist-from kb-hist-from-'+esc(h.from||"")+'">'+esc(h.from||"?")+'</span> → <span class="kb-hist-to kb-hist-to-'+esc(h.to||"")+'">'+esc(h.to||"?")+'</span>'+(h.reason?' <span class="kb-hist-reason">— '+esc(h.reason)+'</span>':'')+'</li>';
    });
    html+='</ul>';
  }else{
    html+='<div class="kb-history-empty">No status changes yet.</div>';
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
