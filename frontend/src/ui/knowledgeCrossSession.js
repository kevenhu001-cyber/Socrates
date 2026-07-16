import { apiFetch } from '../util/api.js';
import { esc } from '../render/helpers.js';

function tr(key) { return typeof window.t === 'function' ? window.t(key) : key; }

var _crossSessionKBCache={data:null,at:0};
function loadCrossSessionKB(opts){
  opts=opts||{};
  var now=Date.now();
  if(!opts.force&&_crossSessionKBCache.data&&now-_crossSessionKBCache.at<60000){
    return Promise.resolve(_crossSessionKBCache.data);
  }
  return apiFetch("/api/knowledge-boundary",{method:"GET"}).then(function(r){
    _crossSessionKBCache={data:r,at:Date.now()};
    return r;
  }).catch(function(e){
    console.log("[kb] failed to load cross-session boundary");
    return {items:[],summary:{total:0,fuzzy:0,internalized:0,blank:0}};
  });
}

/* Render the cross-session section into #kbCrossBody. Uses the cache
   when fresh; otherwise shows a loading state and fetches. */
export function loadAndRenderCrossSessionKB(force){
  var body=document.getElementById("kbCrossBody");
  if(!body)return;
  var now=Date.now();
  if(!force&&_crossSessionKBCache.data&&now-_crossSessionKBCache.at<60000){
    body.innerHTML=renderCrossSessionKBHtml(_crossSessionKBCache.data);
    return;
  }
  body.textContent=tr("common.loading");
  loadCrossSessionKB({force:force}).then(function(data){
    var b=document.getElementById("kbCrossBody");
    if(b)b.innerHTML=renderCrossSessionKBHtml(data);
  });
}

/* Build the HTML for the cross-session section: summary counts plus
   a compact node list grouped by name, showing the best status across
   sessions (internalized > fuzzy > blank). */
export function renderCrossSessionKBHtml(data){
  if(!data||!data.items)data={items:[],summary:{total:0,fuzzy:0,internalized:0,blank:0}};
  var s=data.summary||{};
  var rank={internalized:3,fuzzy:2,blank:1};
  var byName={};
  (data.items||[]).forEach(function(it){
    if(!it||!it.nodeName)return;
    var cur=byName[it.nodeName];
    if(!cur||(rank[it.status]||0)>(rank[cur.status]||0)){
      byName[it.nodeName]=it;
    }
  });
  var names=Object.keys(byName).sort();
  var html='<div class="kb-cross-summary">';
  html+='<span class="kb-cross-count kb-cross-internalized">internalized: '+esc(String(s.internalized||0))+'</span>';
  html+='<span class="kb-cross-count kb-cross-fuzzy">fuzzy: '+esc(String(s.fuzzy||0))+'</span>';
  html+='<span class="kb-cross-count kb-cross-blank">blank: '+esc(String(s.blank||0))+'</span>';
  html+='</div>';
  if(!names.length){
    html+='<div class="kb-cross-empty">No knowledge-boundary data across sessions yet.</div>';
    return html;
  }
  html+='<div class="kb-cross-nodes">';
  names.forEach(function(n){
    var it=byName[n];
    html+='<div class="kb-cross-node kb-cross-status-'+esc(it.status||"blank")+'">';
    html+='<span class="kb-cross-node-name">'+esc(n)+'</span>';
    html+='<span class="kb-cross-node-status">'+esc(it.status||"blank")+'</span>';
    html+='</div>';
  });
  html+='</div>';
  return html;
}

export function resetCrossSessionKBCache() {
  _crossSessionKBCache = { data: null, at: 0 };
}
