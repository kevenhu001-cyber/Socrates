import { esc } from '../render/helpers.ts';
import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { mountKnowledgeNodeDetail } from '../react/tutor/knowledgeNodeDetailHost.tsx';

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
  if(existing){
    if (existing._kbDetailRoot) existing._kbDetailRoot.destroy();
    existing.remove();
    return;
  }
  var others=cont.querySelectorAll('.kb-node-detail');
  others.forEach(function(o){if(o._kbDetailRoot)o._kbDetailRoot.destroy();o.remove()});
  var node=window.stateStore.read("kbNodes")[idx];
  if(!node)return;
  var detail=document.createElement("div");
  detail.className="kb-node-detail";
  detail.setAttribute("data-node-idx",idx);
  var row=cont.querySelector('.kb-node[data-node-idx="'+idx+'"]');
  if(row&&row.parentNode)row.parentNode.insertBefore(detail,row.nextSibling);
  else cont.appendChild(detail);
  function updateNode(patch){
    var nodes=stateStore.read('kbNodes')||[];
    var current=nodes[idx];
    if(!current)return null;
    var next=Object.assign({},current,patch);
    stateStore.dispatch({type:'state/set',key:'kbNodes',value:nodes.map(function(item,index){return index===idx?next:item})});
    node=next;
    return next;
  }
  var history=stateStore.read('boundariesHistory')||[];
  var debounceTimer=null;
  detail._kbDetailRoot=mountKnowledgeNodeDetail(detail,{
    index:idx,
    status:node.status||'blank',
    statusLabel:statusLabel(node.status),
    goLabel:tr('kb.go'),
    goTitle:tr('kb.goTitle'),
    confidenceLabel:tr('kb.confidence'),
    confidenceSetLabel:function(value){return tr('kb.confidenceSet',{n:value})},
    confidenceScore:typeof node.confidence_score==='number'?node.confidence_score:0,
    systemNoteLabel:tr('kb.systemNote'),
    systemNote:node.system_note||'',
    noSystemNote:tr('kb.noSystemNote'),
    userNoteLabel:tr('kb.yourNote'),
    userNote:node.user_note||'',
    userNotePlaceholder:tr('kb.placeholderNote'),
    historyLabel:tr('kb.history'),
    history:history.slice(-8).reverse().map(function(item){
      var date=item&&(item.date||item.at);
      if(typeof date==='number'){
        try{date=new Date(date).toISOString().slice(0,10)}catch(error){reportSwallow(error,'ui/knowledgeDetail.impl.mjs:historyDate')}
      }
      return {date:String(date||''),summary:String(item&&item.summary||'')};
    }),
    noHistory:tr('kb.noHistory'),
    onGo:function(){jumpToNode(idx)},
    onConfidenceChange:function(value){updateNode({confidence_score:value});saveCurrentSessionSafe()},
    onUserNoteChange:function(value){
      clearTimeout(debounceTimer);
      debounceTimer=setTimeout(function(){updateNode({user_note:value});saveCurrentSessionSafe()},500);
    }
  });
}

async function jumpToNode(idx){
  stateStore.dispatch({type:'state/batch',patch:{currentNode:idx,stuckCount:0,substantiveCount:0}});
  if (typeof window.askNextQuestion === "function") await window.askNextQuestion();
  saveCurrentSessionSafe();
}
