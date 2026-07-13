var _vizId=0;
var _pendingMermaid=[];
var _pendingViz=[];

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
  /* data-action attributes (no inline onclick) — DOMPurify strips
     inline event handlers in formatMsg/sanitizeHtml, so handlers are
     bound programmatically by processPendingVizActions() after the
     card lands in the DOM. data-viz-card ties the button to its
     owning .viz card root. */
  return '<div class="viz-actions">'+
    '<button type="button" class="viz-btn viz-btn-reload" title="Reload" aria-label="Reload" data-action="viz-reload" data-viz-card="'+cardId+'">'+
      VIZ_ICON_RELOAD+'</button>'+
    '<button type="button" class="viz-btn viz-btn-expand" title="Expand" aria-label="Expand" data-action="viz-expand" data-viz-card="'+cardId+'">'+
      VIZ_ICON_EXPAND+'</button>'+
  '</div>';
}

/* Shared error template. Inline onclick would be stripped by DOMPurify
   when this HTML passes through formatMsg/sanitizeHtml; the matching
   "Show source" toggle is wired up by processPendingVizActions() via
   data-action="viz-toggle-source". */
function vizErrorHtml(message,source){
  var msg=esc(message||'');
  var src=esc(source||'');
  return '<div class="viz-error">'+
    '<span class="viz-error-icon">!</span>'+
    '<span class="viz-error-msg">'+msg+'</span>'+
    '<button type="button" class="viz-error-btn" data-action="viz-toggle-source">Show source</button>'+
    '<pre class="viz-error-source" hidden>'+src+'</pre>'+
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
    return'<div class="viz" data-viz-state="error"><div class="viz-body">'+vizErrorHtml('Diagram syntax error',code)+'</div></div>';
  }
  var id="mermaid-card-"+(++_vizId);
  _pendingMermaid.push({id:id,code:code});
  queueVizActions(id);
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
      body.innerHTML=vizErrorHtml('Diagram syntax error',item.code);
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
          body.innerHTML=vizErrorHtml(msg,src);
          el.setAttribute('data-viz-state','error');
        });
    }catch(e){
      var el=document.getElementById(item.id);
      if(!el)return;
      var body=el.querySelector('.viz-body');
      if(!body)return;
      var msg=esc(e.message||String(e)).slice(0,300);
      var src=esc(item.code||'');
      body.innerHTML=vizErrorHtml(msg,src);
      el.setAttribute('data-viz-state','error');
    }
  });
  try{processPendingVizActions()}catch(_){}
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
    'style="width:100%;border:0;background:transparent;display:block;min-height:120px">'+
    '</iframe>';
  _pendingViz.push({id:id});
  queueVizActions(id);
  return '<div class="viz" id="'+id+'" data-viz-state="loading" data-title="'+esc(title)+'">'+
    vizActions(id)+
    '<div class="viz-body">'+bodyHtml+'</div>'+
  '</div>';
}

/* Parse a ```plot``` spec. Accepted forms:
     <expr>                                  → defaults: x range -10..10
     <expr> from <a> to <b>                  → explicit range
     <expr> from <a> to <b> color=<c> [width=<n>]
   <expr> may reference x, pi, e, and the usual math fns. */
function parsePlotSpec(spec){
  var src=String(spec||'').trim();
  if(!src)return{error:'empty plot spec'};
  var color='#3a6df0';
  var width=1.6;
  var colorM=src.match(/\scolor\s*=\s*([a-zA-Z#][a-zA-Z0-9#(),.%\- ]*)/i);
  if(colorM){color=colorM[1].trim();src=src.replace(colorM[0],'');}
  var widthM=src.match(/\swidth\s*=\s*([0-9]*\.?[0-9]+)/i);
  if(widthM){width=parseFloat(widthM[1])||width;src=src.replace(widthM[0],'');}
  var xMin=-10,xMax=10;
  var rangeM=src.match(/\sfrom\s+(-?[0-9.]+(?:\s*\*\s*pi)?|pi|-pi|e|-e)\s+to\s+(-?[0-9.]+(?:\s*\*\s*pi)?|pi|-pi|e|-e)/i);
  if(rangeM){
    xMin=parsePlotRangeNumber(rangeM[1]);
    xMax=parsePlotRangeNumber(rangeM[2]);
    src=src.replace(rangeM[0],'');
  }
  var expr=src.trim();
  return{expr:expr,xMin:xMin,xMax:xMax,color:color,width:width,error:expr?null:'missing expression'};
}

function parsePlotRangeNumber(tok){
  tok=String(tok||'').trim();
  if(!tok)return 0;
  if(tok==='pi')return Math.PI;
  if(tok==='-pi')return -Math.PI;
  if(tok==='e')return Math.E;
  if(tok==='-e')return -Math.E;
  var m=tok.match(/^(-?[0-9]*\.?[0-9]+)\s*\*\s*pi$/i);
  if(m)return parseFloat(m[1])*Math.PI;
  var n=parseFloat(tok);
  return isFinite(n)?n:0;
}

export function renderPlot(spec){
  var id="viz-card-"+(++_vizId);
  var title="Plot";
  var parsed=parsePlotSpec(spec);
  var payload=JSON.stringify({
    expr:parsed.expr,
    xMin:parsed.xMin,
    xMax:parsed.xMax,
    color:parsed.color,
    width:parsed.width,
    error:parsed.error||null
  });
  /* The iframe body holds a <canvas> plus a runtime <script> that
     parses the expression and draws axes + curve. We set the payload
     via a separate inline script so we don't need to JSON-escape the
     JSON string inside another string literal. The runtime is fully
     self-contained (no Math/canvas deps from outside the sandbox). */
  var innerHtml='<canvas id="cv" style="display:block;width:100%;height:340px;background:transparent"></canvas>'+
    '<script>(function(){'+
      'var data=document.body.getAttribute("data-plot");'+
      'try{var p=JSON.parse(data);}catch(e){return;}'+
      'var cv=document.getElementById("cv");'+
      'var dpr=window.devicePixelRatio||1;'+
      'function fit(){var w=cv.clientWidth||600;var h=cv.clientHeight||340;cv.width=Math.max(1,Math.floor(w*dpr));cv.height=Math.max(1,Math.floor(h*dpr));}'+
      'fit();'+
      'window.addEventListener("resize",function(){fit();draw();});'+
      'function compile(src){'+
        'var s=src.replace(/\\s+/g,"");var i=0;'+
        'function peek(){return s[i];}'+
        'function eat(c){if(s[i]===c){i++;return true;}return false;}'+
        'function err(m){throw new Error(m);}'+
        'function expr(){var v=term();while(peek()==="+"||peek()==="-"){var op=s[i++];v=op==="+"?term()+v:v-term();}return v;}'+
        'function term(){var v=atom();while(peek()==="*"||peek()==="/"){var op=s[i++];var r=atom();v=op==="*"?v*r:v/r;}return v;}'+
        'function atom(){'+
          'var c=peek();'+
          'if(c==="("){i++;var v=expr();if(!eat(")"))err("missing )");return v;}'+
          'if(c==="-"){i++;return -atom();}'+
          'if(c==="+"){i++;return atom();}'+
          'var n=s.slice(i).match(/^[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?/);if(n){i+=n[0].length;return parseFloat(n[0]);}'+
          'var id=s.slice(i).match(/^[A-Za-z][A-Za-z0-9]*/);if(id){var nm=id[0];i+=nm.length;'+
            'if(nm==="x")return "x";if(nm==="pi")return Math.PI;if(nm==="e")return Math.E;'+
            'var F={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,exp:Math.exp,log:Math.log,ln:Math.log,sqrt:Math.sqrt,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh};'+
            'if(F[nm]){if(!eat("("))err("expected (");var a=expr();if(!eat(")"))err("missing )");return F[nm](a);}'+
            'err("unknown: "+nm);}'+
          'err("unexpected "+c);}'+
        'return expr();'+
      '}'+
      'function ev(n,x){if(typeof n==="number")return n;if(n==="x")return x;return NaN;}'+
      'var tree=null;'+
      'try{tree=compile(p.expr||"");}catch(err2){'+
        'var c0=cv.getContext("2d");c0.fillStyle="#a04040";c0.font="13px sans-serif";c0.fillText("Parse error: "+err2.message,16,24);'+
        'return;'+
      '}'+
      'function draw(){'+
        'var ctx=cv.getContext("2d");var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);'+
        'if(p.error){ctx.fillStyle="#a04040";ctx.font="13px sans-serif";ctx.fillText("Plot error: "+p.error,16,24);return;}'+
        'var N=400;var xs=new Array(N);var ys=new Array(N);'+
        'for(var k=0;k<N;k++){var xv=p.xMin+(p.xMax-p.xMin)*k/(N-1);xs[k]=xv;var yv=ev(tree,xv);ys[k]=isFinite(yv)?yv:NaN;}'+
        'var yMin=Infinity,yMax=-Infinity;'+
        'for(var k2=0;k2<N;k2++){if(isFinite(ys[k2])){if(ys[k2]<yMin)yMin=ys[k2];if(ys[k2]>yMax)yMax=ys[k2];}}'+
        'if(!isFinite(yMin)){yMin=-1;yMax=1;}'+
        'var pad=(yMax-yMin)*0.1||1;yMin-=pad;yMax+=pad;'+
        'var left=Math.floor(40*dpr),right=Math.floor(w-30*dpr),top=Math.floor(20*dpr),bottom=Math.floor(h-30*dpr);'+
        'var W=right-left,H=bottom-top;'+
        'function X(xv){return left+(xv-p.xMin)/(p.xMax-p.xMin)*W;}'+
        'function Y(yv){return bottom-(yv-yMin)/(yMax-yMin)*H;}'+
        'var axisColor=getComputedStyle(document.body).getPropertyValue("--text-300").trim()||"#888";'+
        'ctx.strokeStyle=axisColor;ctx.lineWidth=1;ctx.beginPath();'+
        'ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();'+
        'if(yMin<0&&yMax>0){ctx.strokeStyle=axisColor;ctx.beginPath();ctx.moveTo(left,Y(0));ctx.lineTo(right,Y(0));ctx.stroke();}'+
        'if(p.xMin<0&&p.xMax>0){ctx.strokeStyle=axisColor;ctx.beginPath();ctx.moveTo(X(0),top);ctx.lineTo(X(0),bottom);ctx.stroke();}'+
        'ctx.fillStyle=axisColor;ctx.font=Math.floor(10*dpr)+"px sans-serif";'+
        'ctx.textAlign="right";ctx.textBaseline="middle";'+
        'var yTicks=5;for(var t=0;t<=yTicks;t++){var yv=yMin+(yMax-yMin)*t/yTicks;ctx.fillText(yv.toFixed(2),left-6*dpr,Y(yv));}'+
        'ctx.textAlign="center";ctx.textBaseline="top";'+
        'var xTicks=6;for(var t2=0;t2<=xTicks;t2++){var xv=p.xMin+(p.xMax-p.xMin)*t2/xTicks;ctx.fillText(xv.toFixed(2),X(xv),bottom+4*dpr);}'+
        'ctx.strokeStyle=p.color;ctx.lineWidth=p.width*dpr;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();'+
        'var started=false;'+
        'for(var k3=0;k3<N;k3++){if(!isFinite(ys[k3])){started=false;continue;}var px=X(xs[k3]),py=Y(ys[k3]);if(!started){ctx.moveTo(px,py);started=true;}else{ctx.lineTo(px,py);}}'+
        'ctx.stroke();'+
        'ctx.fillStyle=axisColor;ctx.font="italic "+Math.floor(11*dpr)+"px sans-serif";ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText("f(x) = "+p.expr,left,Math.floor(6*dpr));'+
      '}'+
      'draw();'+
    '})();<\/script>';
  var doc='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    VIZ_THEME_RESET+
    '</head><body>'+innerHtml+
    '<script>document.body.setAttribute("data-plot", '+JSON.stringify(payload)+');<\/script>'+
    '</body></html>';
  var srcdoc=doc
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
  var bodyHtml=
    vizLoadingHtml()+
    '<iframe data-srcdoc="'+srcdoc+'" srcdoc="'+srcdoc+
    '" sandbox="allow-scripts" title="Plot of '+esc(parsed.expr)+'" '+
    'style="width:100%;border:0;background:transparent;display:block;min-height:340px">'+
    '</iframe>';
  _pendingViz.push({id:id});
  queueVizActions(id);
  return '<div class="viz" id="'+id+'" data-viz-state="loading" data-title="'+esc(title)+'">'+
    vizActions(id)+
    '<div class="viz-body">'+bodyHtml+'</div>'+
  '</div>';
}

export function processPendingViz(){
  var pending=_pendingViz;
  _pendingViz=[];
  pending.forEach(function(item){
    var el=document.getElementById(item.id);
    if(!el)return;
    var iframe=el.querySelector('iframe');
    if(!iframe)return;
    /* Three-prong strategy to never leave the card stuck on
       "Rendering…":
       1. Attach a 'load' listener for the normal case where the
          browser fires load asynchronously after parsing srcdoc.
       2. Set a fallback timeout to run the handler after a short
          delay. The browser sometimes fires load BEFORE we attach
          the listener (especially when srcdoc is small/inlined,
          e.g. an empty <svg></svg>). In that case the listener
          never fires — only the timeout catches it. _onVizIframeLoad
          is idempotent so running it twice is safe.
       3. We do NOT probe iframe.contentDocument.readyState: with
          sandbox="allow-scripts" (no allow-same-origin) the iframe
          is treated as a unique origin and contentDocument access
          throws SecurityError / returns null in modern browsers,
          which would falsely route us into the listener-only path
          even when the iframe was already loaded synchronously. */
    iframe.addEventListener('load',function(){_onVizIframeLoad(iframe)});
    setTimeout(function(){_onVizIframeLoad(iframe)},80);
  });
  try{processPendingVizActions()}catch(_){}
}

function _onVizIframeLoad(iframe){
  try{
    var c=iframe.closest('.viz');
    if(c)c.setAttribute('data-viz-state','ready');
    var d=iframe.contentDocument;
    var h=d&&(d.documentElement.scrollHeight||d.body.scrollHeight)||0;
    if(h>16){iframe.style.height=h+'px'}
    var p=iframe.previousElementSibling;
    if(p&&p.classList.contains('viz-loading'))p.style.display='none';
  }catch(_){}
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
        '<button type="button" class="viz-modal-close" aria-label="Close" data-action="viz-close-modal">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'+
        '</button>'+
      '</div>'+
      '<div class="viz-modal-body">'+
        '<iframe srcdoc="'+srcdoc+'" sandbox="allow-scripts" title="Canvas fullscreen" style="width:100%;height:100%;border:0;background:transparent;display:block"></iframe>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}
/* Queue of viz card ids whose data-action buttons still need binding.
   Drained by processPendingVizActions(). Mirrors the _pendingViz /
   _pendingMermaid pattern used by the iframe loader and the mermaid
   renderer. */
var _pendingActions=[];

export function processPendingVizActions(){
  /* Two passes: queued cards first (typical streaming render path),
     then a document-wide scan for any data-action elements that
     appeared via direct innerHTML writes (e.g. openVizModal, restored
     sessions whose HTML was stored before this code shipped, or DOM
     written outside renderViz/renderMermaid). Both passes are
     idempotent via the __vizActionBound dataset flag. */
  var pending=_pendingActions;
  _pendingActions=[];
  pending.forEach(_bindActionsInCard);
  var docEls=document.querySelectorAll('[data-action]');
  for(var i=0;i<docEls.length;i++){
    var el=docEls[i];
    if(!el.__vizActionBound)_bindAction(el);
  }
}

function _bindActionsInCard(item){
  var el=document.getElementById(item&&item.id);
  if(!el)return;
  var actions=el.querySelectorAll('[data-action]');
  for(var i=0;i<actions.length;i++)_bindAction(actions[i]);
}

function _bindAction(el){
  if(!el||el.__vizActionBound)return;
  var act=el.getAttribute('data-action');
  if(act==='viz-reload'){
    el.addEventListener('click',function(ev){
      ev.preventDefault();
      var cardId=el.getAttribute('data-viz-card');
      var c=cardId&&document.getElementById(cardId);
      var f=c&&c.querySelector('iframe');
      if(!f)return;
      f.removeAttribute('srcdoc');
      var d=f.dataset.srcdoc;
      if(d)f.setAttribute('srcdoc',d);
    });
  }else if(act==='viz-expand'){
    el.addEventListener('click',function(ev){
      ev.preventDefault();
      var cardId=el.getAttribute('data-viz-card');
      var c=cardId&&document.getElementById(cardId);
      if(!c)return;
      var f=c.querySelector('iframe');
      window.__vizOpenModal&&window.__vizOpenModal(
        (f&&f.dataset.srcdoc)||'',
        c.dataset.title||'Canvas'
      );
    });
  }else if(act==='viz-toggle-source'){
    el.addEventListener('click',function(ev){
      ev.preventDefault();
      var n=el.nextElementSibling;
      if(n)n.hidden=!n.hidden;
    });
  }else if(act==='viz-close-modal'){
    el.addEventListener('click',function(ev){
      ev.preventDefault();
      var m=el.closest('.viz-modal-backdrop');
      if(m)m.remove();
    });
  }
  el.__vizActionBound=true;
}

/* Called from renderViz() / renderMermaid() to queue a card id so the
   next processPendingVizActions() pass binds its buttons. */
export function queueVizActions(id){
  if(id)_pendingActions.push({id:id});
}

