/* ── Viz / Mermaid rendering subsystem ──
   Formats AI-generated HTML / Mermaid diagrams as sandboxed iframe
   cards. Imported by render/markdown.js for use inside formatMsg. */

var _vizId=0;
var _pendingMermaid=[];

export var VIZ_ICON_RENDER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';
export var VIZ_ICON_RELOAD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
export var VIZ_ICON_EXPAND='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><path d="M9 21 3 21 3 15"/><path d="M21 3 14 10"/><path d="M3 21 10 14"/></svg>';
export var VIZ_ICON_COLLAPSE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><path d="M20 10 14 10 14 4"/><path d="M14 10 21 3"/><path d="M10 14 3 21"/></svg>';

export var VIZ_THEME_RESET=
  '<style>'+
    '*,*::before,*::after{box-sizing:border-box}'+
    'html,body{margin:0;padding:0}'+
    'body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.55;color:#3a3a3a;background:#fff}'+
    '@media (prefers-color-scheme: dark){body{color:#e8e8ec;background:#16181d}}'+
    'a{color:#5b6fdb}a:hover{color:#3f54c4}'+
    'button{padding:6px 12px;border:0.5px solid #d0d2d9;border-radius:8px;background:#f6f7fa;color:#3a3a3a;cursor:pointer;font:inherit}'+
    'button:hover{background:#eef0f4}'+
    '@media (prefers-color-scheme: dark){button{background:#2a2c34;color:#e8e8ec;border-color:#3a3c44}button:hover{background:#34363f}}'+
    'input,select,textarea{font:inherit;color:inherit;background:transparent;border:0.5px solid #d0d2d9;border-radius:6px;padding:4px 8px}'+
    '@media (prefers-color-scheme: dark){input,select,textarea{border-color:#3a3c44;background:#22232a}}'+
    'h1{font-size:1.4em}h2{font-size:1.2em}h3{font-size:1.05em}h1,h2,h3,h4{margin:8px 0 6px;line-height:1.3}'+
    'p{margin:6px 0}'+
    'code{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em;background:rgba(120,120,140,0.12);padding:1px 5px;border-radius:3px}'+
    'pre{background:rgba(120,120,140,0.08);border-radius:8px;padding:10px 12px;overflow:auto;line-height:1.5}'+
    'pre code{background:transparent;padding:0}'+
    'table{border-collapse:collapse;width:100%;font-size:.92em;margin:6px 0}th,td{padding:6px 10px;border:0.5px solid rgba(120,120,140,0.3);text-align:left}'+
    'th{background:rgba(120,120,140,0.08);font-weight:600}'+
    'svg{max-width:100%}'+
  '</style>'+
  '<script>document.documentElement.setAttribute("data-mode","'+
    (document.documentElement.getAttribute("data-mode")||"dark")+'")<\/script>';

import { esc } from './helpers.js';

function vizCardShell(id,statusLabel,state,headActions,bodyHtml){
  return '<div class="viz-card" id="'+id+'" data-viz-state="'+state+'">'+
    '<div class="viz-card-head">'+
      '<span class="viz-card-head-icon">'+VIZ_ICON_RENDER+'</span>'+
      '<span class="viz-card-title">Canvas</span>'+
      '<span class="viz-card-status">'+esc(statusLabel)+'</span>'+
      headActions+
    '</div>'+
    '<div class="viz-card-body">'+bodyHtml+'</div>'+
  '</div>';
}

function vizHeadActions(cardId,collapsePersistKey){
  return '<div class="viz-card-actions">'+
    '<button type="button" class="viz-card-btn" title="Reload" aria-label="Reload" '+
      'onclick="var c=document.getElementById(\''+cardId+'\');var f=c.querySelector(\'iframe\');'+
      'if(f){f.removeAttribute(\'srcdoc\');f.setAttribute(\'srcdoc\',f.dataset.srcdoc)}">'+
      VIZ_ICON_RELOAD+'</button>'+
    '<button type="button" class="viz-card-btn" title="Expand" aria-label="Expand" '+
      'onclick="window.__vizOpenModal(document.getElementById(\''+cardId+'\').dataset.srcdoc,document.getElementById(\''+cardId+'\').dataset.title)">'+
      VIZ_ICON_EXPAND+'</button>'+
    '<button type="button" class="viz-card-btn viz-collapse-btn" title="Collapse" aria-label="Collapse" aria-pressed="false" '+
      'onclick="var c=document.getElementById(\''+cardId+'\');'+
      'var collapsed=c.getAttribute(\'data-viz-state\')===\'collapsed\'||c.getAttribute(\'data-viz-collapsed\')===\'1\';'+
      'c.setAttribute(\'data-viz-collapsed\',collapsed?\'0\':\'1\');'+
      'c.setAttribute(\'data-viz-state\',collapsed?\'ready\':\'collapsed\');'+
      'this.setAttribute(\'aria-pressed\',collapsed?\'false\':\'true\');'+
      'this.title=collapsed?\'Collapse\':\'Expand\';'+
      'try{localStorage.setItem(\''+collapsePersistKey+'\',collapsed?\'0\':\'1\')}catch(_){}'+
      '">'+
      VIZ_ICON_COLLAPSE+'</button>'+
  '</div>';
}

function vizSkeletonHtml(){
  return '<div class="viz-vignette"></div>'+
    '<div class="viz-scan"></div>'+
    '<div class="viz-loading-label">'+
      '<span class="viz-loading-spinner"></span>'+
      '<span>Compiling canvas…</span>'+
    '</div>';
}

function vizErrorHtml(message){
  var msg=esc((message||'Could not load canvas').slice(0,240));
  return '<div class="viz-error">'+
    '<div class="viz-error-title">Canvas failed to render</div>'+
    '<div class="viz-error-detail">'+msg+'</div>'+
    '<div class="viz-error-actions">'+
      '<button type="button" class="viz-error-btn" data-viz-copy-source="1">Copy source</button>'+
    '</div>'+
  '</div>';
}

export function renderMermaid(code){
  if(typeof mermaid==="undefined"){
    return'<pre><code class="language-mermaid">'+esc(code)+'</code></pre>';
  }
  var id="mermaid-card-"+(++_vizId);
  _pendingMermaid.push({id:id,code:code});
  return'<div class="viz-card" id="'+id+'" data-viz-state="loading">'+
    '<div class="viz-card-head">'+
      '<span class="viz-card-head-icon">'+VIZ_ICON_RENDER+'</span>'+
      '<span class="viz-card-title">Diagram</span>'+
      '<span class="viz-card-status">Rendering</span>'+
      vizHeadActions(id,'socrates-mermaid-'+id)+
    '</div>'+
    '<div class="viz-card-body">'+vizSkeletonHtml()+'</div>'+
  '</div>';
}

export function processPendingMermaid(){
  if(typeof mermaid==="undefined")return;
  var pending=_pendingMermaid;
  _pendingMermaid=[];
  pending.forEach(function(item){
    try{
      mermaid.render('mermaid-svg-'+item.id,item.code)
        .then(function(result){
          var el=document.getElementById(item.id);
          if(!el)return;
          var body=el.querySelector('.viz-card-body');
          if(!body)return;
          body.innerHTML=result.svg;
          el.setAttribute('data-viz-state','ready');
          if(result.bindFunctions)result.bindFunctions(body);
          var svg=body.querySelector('svg');
          if(svg){
            svg.style.maxWidth='100%';
            svg.style.height='auto';
          }
        })
        .catch(function(err){
          var el=document.getElementById(item.id);
          if(!el)return;
          var body=el.querySelector('.viz-card-body');
          if(!body)return;
          var errMsg=esc(err.message||String(err));
          body.innerHTML='<div class="viz-error">'+
            '<div class="viz-error-icon">!</div>'+
            '<div class="viz-error-detail">Mermaid error: '+errMsg+'</div>'+
          '</div>';
          el.setAttribute('data-viz-state','error');
        });
    }catch(e){
      var el=document.getElementById(item.id);
      if(!el)return;
      var body=el.querySelector('.viz-card-body');
      if(!body)return;
      var errMsg=esc(e.message||String(e));
      body.innerHTML='<div class="viz-error">'+
        '<div class="viz-error-icon">!</div>'+
        '<div class="viz-error-detail">Mermaid error: '+errMsg+'</div>'+
      '</div>';
      el.setAttribute('data-viz-state','error');
    }
  });
}

export function renderVizLoading(){
  var id="viz-card-"+(++_vizId);
  return vizCardShell(id,"Loading","loading",
    '<div class="viz-card-actions"></div>',
    vizSkeletonHtml()
  );
}

export function renderViz(htmlStr){
  var id="viz-card-"+(++_vizId);
  var title=(window.state&&window.state.topic||"Canvas").toString().slice(0,40);
  var doc='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    VIZ_THEME_RESET+
    '</head><body>'+htmlStr+'</body></html>';
  var srcdoc=doc
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  var bodyHtml=
    vizSkeletonHtml()+
    '<iframe data-srcdoc="'+srcdoc+'" srcdoc="'+srcdoc+
    '" sandbox="allow-scripts" title="Canvas" '+
    'style="width:100%;height:100%;min-height:160px;border:0;background:transparent" '+
    'onload="try{var c=this.closest(\'.viz-card\');if(c){'+
    'c.setAttribute(\'data-viz-state\',\'ready\');'+
    'this.style.opacity=1;try{var d=this.contentDocument;var h=(d&&(d.documentElement.scrollHeight||d.body.scrollHeight))||0;'+
    'if(h>16){this.style.height=h+\'px\';this.parentElement.classList.add(\'scrollable\')}}catch(_){}}catch(_){}"></iframe>';
  return '<div class="viz-card" id="'+id+'" data-viz-state="loading" data-srcdoc="'+srcdoc+'" data-title="'+esc(title)+'">'+
    '<div class="viz-card-head">'+
      '<span class="viz-card-head-icon">'+VIZ_ICON_RENDER+'</span>'+
      '<span class="viz-card-title">'+esc(title)+'</span>'+
      '<span class="viz-card-status">Rendering</span>'+
      vizHeadActions(id,'socrates-viz-collapsed-'+id)+
    '</div>'+
    '<div class="viz-card-body">'+bodyHtml+'</div>'+
  '</div>';
}

export function renderVizError(htmlStr,errorMsg){
  var id="viz-card-"+(++_vizId);
  var title=(window.state&&window.state.topic||"Canvas").toString().slice(0,40);
  var msg=esc((errorMsg||'Could not load canvas').slice(0,240));
  return vizCardShell(id,"Error","error",
    vizHeadActions(id,'socrates-viz-collapsed-'+id),
    '<div class="viz-error">'+
      '<div class="viz-error-title">Canvas failed to render</div>'+
      '<div class="viz-error-detail">'+msg+'</div>'+
      '<div class="viz-error-actions">'+
        '<button type="button" class="viz-error-btn" data-viz-copy-source="1">Copy source</button>'+
      '</div>'+
    '</div>'
  );
}

/* Public modal — opens a fullscreen view of the canvas. Bound to
   the expand button via window.__vizOpenModal from the inline
   onclick handler. Must be a named export so main.js can re-export
   it to window. */
export function openVizModal(srcdoc,title){
  if(!srcdoc)return;
  var modal=document.createElement("div");
  modal.className="viz-modal-backdrop";
  modal.onclick=function(e){if(e.target===modal)close()};
  function close(){modal.remove();document.removeEventListener("keydown",onKey)};
  function onKey(e){if(e.key==="Escape")close()};
  document.addEventListener("keydown",onKey);
  modal.innerHTML=
    '<div class="viz-modal" role="dialog" aria-label="Canvas fullscreen">'+
      '<div class="viz-modal-head">'+
        '<span class="viz-card-head-icon">'+VIZ_ICON_RENDER+'</span>'+
        '<span class="viz-modal-title">'+esc(title||"Canvas")+'</span>'+
        '<div class="viz-card-actions" style="margin-left:auto">'+
          '<button type="button" class="viz-card-btn" title="Close" aria-label="Close" onclick="this.closest(\'.viz-modal-backdrop\').remove()">'+
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'+
          '</button>'+
        '</div>'+
      '</div>'+
      '<div class="viz-modal-body">'+
        '<iframe srcdoc="'+srcdoc+'" sandbox="allow-scripts" title="Canvas fullscreen" style="width:100%;height:100%;border:0;background:transparent;display:block"></iframe>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}
