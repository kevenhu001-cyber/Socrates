import { esc } from '../render/helpers.ts';
import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';

function tr(key, vars) {
  var v = (typeof window.t === 'function') ? window.t(key) : key;
  if (!vars) return v;
  return String(v).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

function statusLabel(status) {
  var s = status || 'blank';
  var key = 'tutor.status' + s.charAt(0).toUpperCase() + s.slice(1);
  var label = tr(key);
  return label === key ? s : label;
}

function saveCurrentSessionSafe() { if (typeof window.saveCurrentSession === 'function') window.saveCurrentSession(); }

export function kbNodeHtml(n,cls){
  return '<div class="kb-node" data-node-idx="'+n.idx+'"><div class="kb-dot '+cls+'"></div><span class="kb-name">'+esc(n.name)+'</span>'+(n.questions?'<span class="kb-count">'+esc(tr('kb.questions',{n:n.questions}))+'</span>':'')+'</div>';
}

export function toggleKBDetail(idx){
  var cont=document.getElementById("kbContent");
  var existing=cont.querySelector('.kb-node-detail[data-node-idx="'+idx+'"]');
  if(existing){existing.remove();return}
  var others=cont.querySelectorAll('.kb-node-detail');
  others.forEach(function(o){o.remove()});
  var node=window.stateStore.read("kbNodes")[idx];
  if(!node)return;
  var detail=document.createElement("div");
  detail.className="kb-node-detail";
  detail.setAttribute("data-node-idx",idx);
  detail.innerHTML=renderKBDetailInner(node,idx);
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
  var cs=typeof node.confidence_score==="number"?node.confidence_score:0;
  html+='<div class="kb-detail-row"><span class="kb-detail-label">'+esc(tr('kb.confidence'))+'</span><div class="kb-conf-row">';
  for(var i=1;i<=5;i++){
    html+='<button class="kb-conf-dot'+(i<=cs?' on':'')+'" data-conf="'+i+'" title="'+esc(tr('kb.confidenceSet',{n:i}))+'"></button>';
  }
  html+='</div></div>';
  html+='<div class="kb-detail-row"><span class="kb-detail-label">'+esc(tr('kb.systemNote'))+'</span>';
  html+='<div class="kb-system-note">'+(node.system_note?esc(node.system_note):'<em style="color:hsl(var(--text-500))">'+esc(tr('kb.noSystemNote'))+'</em>')+'</div></div>';
  html+='<div class="kb-detail-row"><label class="kb-detail-label" for="kbUserNote">'+esc(tr('kb.yourNote'))+'</label>';
  html+='<textarea class="kb-user-note" id="kbUserNote" name="kbUserNote" rows="3" placeholder="'+esc(tr('kb.placeholderNote'))+'">'+esc(node.user_note||"")+'</textarea></div>';
  var hist=stateStore.read('boundariesHistory')||[];
  html+='<div class="kb-detail-row"><span class="kb-detail-label">'+esc(tr('kb.history'))+'</span>';
  if(hist.length){
    html+='<ul class="kb-history">';
    hist.slice(-8).reverse().forEach(function(h){
      var when=h&&(h.date||h.at);
      if(typeof when==="number"){
        try{when=new Date(when).toISOString().slice(0,10)}catch (error) { reportSwallow(error, 'ui/knowledgeDetail.impl.mjs:66'); }
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
  var goBtn=detail.querySelector('[data-go]');
  if(goBtn){goBtn.onclick=function(e){e.stopPropagation();jumpToNode(idx)}}
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
