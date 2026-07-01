var _vizId=0;
var _pendingMermaid=[];

export var VIZ_ICON_RENDER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';
export var VIZ_ICON_RELOAD='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
export var VIZ_ICON_EXPAND='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><path d="M9 21 3 21 3 15"/><path d="M21 3 14 10"/><path d="M3 21 10 14"/></svg>';

export var VIZ_THEME_RESET=
  '<style>'+
    '*,*::before,*::after{box-sizing:border-box}'+
    'html,body{margin:0;padding:0}'+
    'body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.55}'+
    'body{color:var(--text-100,#3a3a3a);background:transparent}'+
    '[data-mode=dark] body{color:var(--text-100,#e8e8ec)}'+
    'a{color:var(--accent-000,#5b6fdb)}'+
    'svg{max-width:100%;height:auto;display:block}'+
    'pre{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em;background:rgba(120,120,140,0.08);border-radius:8px;padding:8px 10px;overflow:auto}'+
    'code{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em}'+
  '</style>'+
  '<script>'+
    'var m=document.documentElement.getAttribute("data-mode");if(m)document.documentElement.setAttribute("data-mode",m);'+
    'var root=getComputedStyle(document.documentElement);'+
    '["--text-100","--accent-000"].forEach(function(k){var v=root.getPropertyValue(k).trim();if(v)document.body.style.setProperty(k,v)});'+
  '<\/script>';

import { esc } from './helpers.js';

function vizActions(cardId){
  return '<div class="viz-actions">'+
    '<button type="button" class="viz-btn" title="Reload" aria-label="Reload" '+
      'onclick="(function(){var c=document.getElementById(\''+cardId+'\');var f=c&&c.querySelector(\'iframe\');if(f){f.removeAttribute(\'srcdoc\');var d=f.dataset.srcdoc;if(d)f.setAttribute(\'srcdoc\',d)}})()">'+
      VIZ_ICON_RELOAD+'</button>'+
    '<button type="button" class="viz-btn" title="Expand" aria-label="Expand" '+
      'onclick="window.__vizOpenModal&&window.__vizOpenModal('+
        '(document.getElementById(\''+cardId+'\').querySelector(\'iframe\')||{}).dataset.srcdoc||\'\','+
        'document.getElementById(\''+cardId+'\').dataset.title||\'Canvas\')">'+
      VIZ_ICON_EXPAND+'</button>'+
  '</div>';
}

function vizLoadingHtml(){
  return '<div class="viz-loading"><span class="viz-spinner"></span><span>Rendering…</span></div>';
}

function validMermaid(code){
  try{return typeof mermaid.parse==="function"?mermaid.parse(code,{suppressErrors:true}):true}catch(_){return false}
}

export function renderMermaid(code){
  if(typeof mermaid==="undefined"){
    return'<pre><code class="language-mermaid">'+esc(code)+'</code></pre>';
  }
  if(!validMermaid(code)){
    return'<div class="viz" data-viz-state="error"><div class="viz-body"><div class="viz-error"><span class="viz-error-icon">!</span><span>Diagram syntax error</span><button class="viz-error-btn" onclick="var n=this.nextElementSibling;n.hidden=!n.hidden">Show source</button><pre class="viz-error-source" hidden>'+esc(code)+'</pre></div></div></div>';
  }
  var id="mermaid-card-"+(++_vizId);
  _pendingMermaid.push({id:id,code:code});
  return '<div class="viz" id="'+id+'" data-viz-state="loading">'+
    vizActions(id)+
    '<div class="viz-body">'+vizLoadingHtml()+'</div>'+
  '</div>';
}

export function processPendingMermaid(){
  if(typeof mermaid==="undefined")return;
  var pending=_pendingMermaid;
  _pendingMermaid=[];
  pending.forEach(function(item){
    if(!validMermaid(item.code)){
      var el=document.getElementById(item.id);
      if(!el)return;
      var body=el.querySelector('.viz-body');
      if(!body)return;
      body.innerHTML='<div class="viz-error"><span class="viz-error-icon">!</span><span>Diagram syntax error</span><button class="viz-error-btn" onclick="var n=this.nextElementSibling;n.hidden=!n.hidden">Show source</button><pre class="viz-error-source" hidden>'+esc(item.code)+'</pre></div>';
      el.setAttribute('data-viz-state','error');
      return;
    }
    try{
      mermaid.render('mermaid-svg-'+item.id,item.code)
        .then(function(result){
          var el=document.getElementById(item.id);
          if(!el)return;
          var body=el.querySelector('.viz-body');
          if(!body)return;
          body.innerHTML=result.svg;
          el.setAttribute('data-viz-state','ready');
          if(result.bindFunctions)result.bindFunctions(body);
          var svg=body.querySelector('svg');
          if(svg){svg.style.maxWidth='100%';svg.style.height='auto'}
        })
        .catch(function(err){
          var el=document.getElementById(item.id);
          if(!el)return;
          var body=el.querySelector('.viz-body');
          if(!body)return;
          var msg=esc(err.message||String(err)).slice(0,300);
          var src=esc(item.code||'');
          body.innerHTML='<div class="viz-error"><span class="viz-error-icon">!</span><span>'+msg+'</span><button class="viz-error-btn" onclick="var n=this.nextElementSibling;n.hidden=!n.hidden">Show source</button><pre class="viz-error-source" hidden>'+src+'</pre></div>';
          el.setAttribute('data-viz-state','error');
        });
    }catch(e){
      var el=document.getElementById(item.id);
      if(!el)return;
      var body=el.querySelector('.viz-body');
      if(!body)return;
      var msg=esc(e.message||String(e)).slice(0,300);
      var src=esc(item.code||'');
      body.innerHTML='<div class="viz-error"><span class="viz-error-icon">!</span><span>'+msg+'</span><button class="viz-error-btn" onclick="var n=this.nextElementSibling;n.hidden=!n.hidden">Show source</button><pre class="viz-error-source" hidden>'+src+'</pre></div>';
      el.setAttribute('data-viz-state','error');
    }
  });
}

export function renderVizLoading(){
  var id="viz-card-"+(++_vizId);
  return '<div class="viz" id="'+id+'" data-viz-state="loading">'+
    '<div class="viz-body">'+vizLoadingHtml()+'</div>'+
  '</div>';
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
    vizLoadingHtml()+
    '<iframe data-srcdoc="'+srcdoc+'" srcdoc="'+srcdoc+
    '" sandbox="allow-scripts" title="Canvas" '+
    'style="width:100%;border:0;background:transparent;display:block;min-height:120px" '+
    'onload="'+
      'try{var w=this;var c=w.closest(\'.viz\');if(c)c.setAttribute(\'data-viz-state\',\'ready\');'+
      'var d=w.contentDocument;var h=d&&(d.documentElement.scrollHeight||d.body.scrollHeight)||0;'+
      'if(h>16){w.style.height=h+\'px\'}'+
      'var p=w.previousElementSibling;if(p&&p.classList.contains(\'viz-loading\'))p.style.display=\'none\''+
    '}catch(_){}'+
    '"></iframe>';
  return '<div class="viz" id="'+id+'" data-viz-state="loading" data-title="'+esc(title)+'">'+
    vizActions(id)+
    '<div class="viz-body">'+bodyHtml+'</div>'+
  '</div>';
}

export function renderVizError(htmlStr,errorMsg){
  var id="viz-card-"+(++_vizId);
  var msg=esc((errorMsg||'Could not load canvas').slice(0,240));
  return '<div class="viz" id="'+id+'" data-viz-state="error">'+
    '<div class="viz-body"><div class="viz-error"><span class="viz-error-icon">!</span><span>'+msg+'</span></div></div>'+
  '</div>';
}

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
        '<span class="viz-modal-title">'+esc(title||"Canvas")+'</span>'+
        '<button type="button" class="viz-modal-close" aria-label="Close" onclick="this.closest(\'.viz-modal-backdrop\').remove()">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'+
        '</button>'+
      '</div>'+
      '<div class="viz-modal-body">'+
        '<iframe srcdoc="'+srcdoc+'" sandbox="allow-scripts" title="Canvas fullscreen" style="width:100%;height:100%;border:0;background:transparent;display:block"></iframe>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}
