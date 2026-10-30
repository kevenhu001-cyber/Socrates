import { esc } from '../render/helpers.ts';
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { mountKnowledgeNodeDetail } from '../react/tutor/knowledgeNodeDetailHost.tsx';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function tr(key: string, vars?: Record<string, unknown>) {
  const v = (typeof browserWindow.t === 'function') ? browserWindow.t(key) : key;
  if (!vars) return v;
  return String(v).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
  });
}

function statusLabel(status: string) {
  const s = status || 'blank';
  const key = 'tutor.status' + s.charAt(0).toUpperCase() + s.slice(1);
  const label = tr(key);
  return label === key ? s : label;
}

function saveCurrentSessionSafe() { if (typeof browserWindow.saveCurrentSession === 'function') browserWindow.saveCurrentSession(); }

export function kbNodeHtml(n: { idx: number; name: unknown; questions?: number },cls: string){
  return '<div class="kb-node" data-node-idx="'+n.idx+'"><div class="kb-dot '+cls+'"></div><span class="kb-name">'+esc(n.name)+'</span>'+(n.questions?'<span class="kb-count">'+esc(tr('kb.questions',{n:n.questions}))+'</span>':'')+'</div>';
}

type KnowledgeDetailElement = HTMLDivElement & { _kbDetailRoot?: ReturnType<typeof mountKnowledgeNodeDetail> };

export function toggleKBDetail(idx: number){
  const cont=document.getElementById("kbContent");
  const existing=cont!.querySelector<KnowledgeDetailElement>('.kb-node-detail[data-node-idx="'+idx+'"]');
  if(existing){
    if (existing._kbDetailRoot) existing._kbDetailRoot.destroy();
    existing.remove();
    return;
  }
  const others=cont!.querySelectorAll('.kb-node-detail');
  others.forEach(function(o){const detail = o as KnowledgeDetailElement; if(detail._kbDetailRoot)detail._kbDetailRoot.destroy();o.remove()});
  let node=browserWindow.stateStore.read("kbNodes")[idx];
  if(!node)return;
  const detail=document.createElement("div") as KnowledgeDetailElement;
  detail.className="kb-node-detail";
  detail.setAttribute("data-node-idx",String(idx));
  const row=cont!.querySelector('.kb-node[data-node-idx="'+idx+'"]');
  if(row&&row.parentNode)row.parentNode.insertBefore(detail,row.nextSibling);
  else cont!.appendChild(detail);
  function updateNode(patch: { confidence_score?: number; user_note?: string; }){
    const nodes=stateStore.read('kbNodes')||[];
    const current=nodes[idx];
    if(!current)return null;
    const next=Object.assign({},current,patch);
    stateStore.dispatch({type:'state/set',key:'kbNodes',value:nodes.map(function(item,index){return index===idx?next:item})});
    node=next;
    return next;
  }
  const history=stateStore.read('boundariesHistory')||[];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
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
    history:history.slice(-8).reverse().map(function(item: { date?: string | number; at?: string | number; summary?: string }){
      let date=item&&(item.date||item.at);
      if(typeof date==='number'){
        try{date=new Date(date).toISOString().slice(0,10)}catch(error){reportSwallow(error,'ui/knowledgeDetail.impl.ts:historyDate')}
      }
      return {date:String(date||''),summary:String(item&&item.summary||'')};
    }),
    noHistory:tr('kb.noHistory'),
    onGo:function(){jumpToNode(idx)},
    onConfidenceChange:function(value){updateNode({confidence_score:value});saveCurrentSessionSafe()},
    onUserNoteChange:function(value){
      clearTimeout((debounceTimer ?? undefined));
      debounceTimer=setTimeout(function(){updateNode({user_note:value});saveCurrentSessionSafe()},500);
    }
  });
}

async function jumpToNode(idx: number){
  stateStore.dispatch({type:'state/batch',patch:{currentNode:idx,stuckCount:0,substantiveCount:0}});
  if (typeof browserWindow.askNextQuestion === "function") await browserWindow.askNextQuestion();
  saveCurrentSessionSafe();
}
