/* viz.js — Interactive canvas/HTML/SVG/Mermaid/Plot renderer.
 *
 * Renders a fenced ```html / ```viz / ```svg / ```plot block inside a
 * sandboxed <iframe srcdoc="..."> so the user's canvas / WebGL / DOM
 * code can run without leaking into the parent page. The card chrome
 * (.viz / .viz-body / .viz-actions) lives in the parent; the iframe
 * itself only holds the user's content.
 *
 * Lifecycle for each card:
 *   1. renderViz() / renderPlot() / renderMermaid() builds the
 *      iframe HTML and pushes an id onto _pendingViz / _pendingMermaid.
 *   2. processPendingViz() / processPendingMermaid() runs after the
 *      cards land in the DOM. It attaches a 'load' listener + a
 *      short polling fallback to the iframe, and flips the card's
 *      data-viz-state to "ready" once the iframe fires its
 *      postMessage "viz-ready" event.
 *   3. The iframe content posts {type:'viz-ready'} via parent.postMessage
 *      when it has finished rendering. The parent listens once per
 *      card and resolves the ready state.
 *
 * Why postMessage instead of the load event:
 *   The previous design used `iframe.addEventListener('load', ...)` +
 *   a 80ms setTimeout fallback. Both paths were fragile: the load
 *   event fires before the inline <script> has run (for cached /
 *   synchronous srcdoc parses), and the 80ms timeout was a guess.
 *   With sandbox="allow-scripts" (no allow-same-origin) we cannot
 *   read iframe.contentDocument, so there's no other way to know
 *   when the user's code finished. postMessage is the only signal
 *   that works across all browsers under that sandbox.
 */

var _vizId = 0;
var _pendingMermaid = [];
var _pendingViz = [];

export var VIZ_ICON_RENDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';
export var VIZ_ICON_RELOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
export var VIZ_ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><path d="M9 21 3 21 3 15"/><path d="M21 3 14 10"/><path d="M3 21 10 14"/></svg>';
export var VIZ_ICON_SOURCE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/><path d="m14 5-4 14"/></svg>';

/* VIZ_THEME_RESET — applied INSIDE the iframe so the user's canvas
   inherits the page's design tokens (text color, accent, monospace
   font). We use postMessage from the iframe to ask the parent for
   the live token values once on load, then keep them in CSS vars. */
export var VIZ_THEME_RESET =
  '<style>' +
    '*,*::before,*::after{box-sizing:border-box}' +
    'html,body{margin:0;padding:0}' +
    'body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.55}' +
    'body{color:var(--text-100,#3a3a3a);background:transparent}' +
    '[data-mode=dark] body{color:var(--text-100,#e8e8ec)}' +
    'a{color:var(--accent-000,#5b6fdb)}' +
    'svg{max-width:100%;height:auto;display:block}' +
    'pre{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em;background:rgba(120,120,140,0.08);border-radius:8px;padding:8px 10px;overflow:auto}' +
    'code{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em}' +
  '</style>';

import { esc } from './helpers.js';

/* Runtime snippet that runs at the END of every iframe body. It
   1. Posts {type:'viz-ready'} when the body has parsed + all
      synchronous <script>s have executed. The parent listens for
      this and flips the card to "ready".
   2. Posts {type:'viz-error', message:'...'} if window.onerror or
      an unhandled promise rejection fires after the user's code
      has loaded, so the parent can show a diagnostic.

   Because the snippet is appended AFTER the user's content, it
   runs AFTER every <script> in the user's HTML — so by the time
   we post viz-ready, the user's canvas (if any) is already drawn.

   P_viz-id-safety — the viz id is captured in the IIFE's closure
   (VIZ_ID_LITERAL is interpolated at srcdoc build time) instead of
   being read off `window.__vizId`. The user code may overwrite
   `window.__vizId`, which used to make the parent drop the postMessage
   on the floor (entry lookup on "" failed silently). */
function vizRuntime(vizId) {
  var idJson = JSON.stringify(vizId);
  return '<script>' +
    '(function(){' +
      'var VIZ_ID=' + idJson + ';' +
      'function postReady(){' +
        'try{window.parent.postMessage({type:"viz-ready",vizId:VIZ_ID,h:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight||0)},"*")}catch(e){}' +
      '}' +
      'function postError(msg){try{window.parent.postMessage({type:"viz-error",vizId:VIZ_ID,message:String(msg||"").slice(0,300)},"*")}catch(e){}}' +
      'window.addEventListener("error",function(e){postError((e&&e.message)||"runtime error")});' +
      'window.addEventListener("unhandledrejection",function(e){postError((e&&e.reason&&(e.reason.message||e.reason))||"unhandled rejection")});' +
      'if(document.readyState==="complete"||document.readyState==="interactive"){' +
        'setTimeout(postReady,0)' +
      '}else{' +
        'document.addEventListener("DOMContentLoaded",function(){setTimeout(postReady,0)})' +
      '}' +
    '})();' +
  '<\/script>';
}

function vizActions(cardId, showSource) {
  return '<div class="viz-actions">' +
    '<span class="viz-status" role="status"><span class="viz-status-dot"></span><span class="viz-status-label"></span></span>' +
    (showSource ? '<button type="button" class="viz-btn viz-btn-source" title="View source" aria-label="View source" data-action="viz-source" data-viz-card="' + cardId + '">' +
      VIZ_ICON_SOURCE + '</button>' : '') +
    '<button type="button" class="viz-btn viz-btn-reload" title="Reload" aria-label="Reload" data-action="viz-reload" data-viz-card="' + cardId + '">' +
      VIZ_ICON_RELOAD + '</button>' +
    '<button type="button" class="viz-btn viz-btn-expand" title="Expand" aria-label="Expand" data-action="viz-expand" data-viz-card="' + cardId + '">' +
      VIZ_ICON_EXPAND + '</button>' +
  '</div>';
}

function vizErrorHtml(message, source) {
  var msg = esc(message || '');
  var src = esc(source || '');
  return '<div class="viz-error">' +
    '<span class="viz-error-icon">!</span>' +
    '<span class="viz-error-msg">' + msg + '</span>' +
    '<button type="button" class="viz-error-btn" data-action="viz-toggle-source">Show source</button>' +
    '<pre class="viz-error-source" hidden>' + src + '</pre>' +
  '</div>';
}

function vizLoadingHtml() {
  return '<div class="viz-loading"><span class="viz-spinner"></span><span>Rendering…</span></div>';
}

function validMermaid(code) {
  try { return typeof mermaid.parse === "function" ? mermaid.parse(code, { suppressErrors: true }) : true; }
  catch (_) { return false; }
}

export function renderMermaid(code, opts) {
  opts = opts || {};
  if (typeof mermaid === "undefined") {
    return '<pre><code class="language-mermaid">' + esc(code) + '</code></pre>';
  }
  if (!validMermaid(code)) {
    return '<div class="viz" data-viz-state="error"><div class="viz-body">' + vizErrorHtml('Diagram syntax error', code) + '</div></div>';
  }
  /* P_viz-stable-id — accept opts.stableId so a streaming fence
     keeps the same card id across rAF ticks. Without this the
     streaming renderer (formatMsgProgressive) allocates a new
     viz-card-N every tick, blowing away the previous iframe and
     orphaning the postMessage handshake. */
  var id = opts.stableId || "mermaid-card-" + (++_vizId);
  _pendingMermaid.push({ id: id, code: code });
  queueVizActions(id);
  return '<div class="viz" id="' + id + '" data-viz-state="loading">' +
    vizActions(id) +
    '<div class="viz-body">' + vizLoadingHtml() + '</div>' +
  '</div>';
}

export function processPendingMermaid() {
  if (typeof mermaid === "undefined") return;
  var pending = _pendingMermaid;
  _pendingMermaid = [];
  pending.forEach(function (item) {
    if (!validMermaid(item.code)) {
      var el = document.getElementById(item.id);
      if (!el) return;
      var body = el.querySelector('.viz-body');
      if (!body) return;
      body.innerHTML = vizErrorHtml('Diagram syntax error', item.code);
      el.setAttribute('data-viz-state', 'error');
      return;
    }
    try {
      mermaid.render('mermaid-svg-' + item.id, item.code)
        .then(function (result) {
          var el = document.getElementById(item.id);
          if (!el) return;
          var body = el.querySelector('.viz-body');
          if (!body) return;
          body.innerHTML = result.svg;
          el.setAttribute('data-viz-state', 'ready');
          if (result.bindFunctions) result.bindFunctions(body);
          var svg = body.querySelector('svg');
          if (svg) { svg.style.maxWidth = '100%'; svg.style.height = 'auto'; }
        })
        .catch(function (err) {
          var el = document.getElementById(item.id);
          if (!el) return;
          var body = el.querySelector('.viz-body');
          if (!body) return;
          var msg = esc(err.message || String(err)).slice(0, 300);
          var src = esc(item.code || '');
          body.innerHTML = vizErrorHtml(msg, src);
          el.setAttribute('data-viz-state', 'error');
        });
    } catch (e) {
      var el = document.getElementById(item.id);
      if (!el) return;
      var body = el.querySelector('.viz-body');
      if (!body) return;
      var msg = esc(e.message || String(e)).slice(0, 300);
      var src = esc(item.code || '');
      body.innerHTML = vizErrorHtml(msg, src);
      el.setAttribute('data-viz-state', 'error');
    }
  });
  try { processPendingVizActions(); } catch (_) {}
}

/* Encode a doc for use as the value of the iframe's `srcdoc` and
   `data-srcdoc` attributes. The order matters: `&` MUST be replaced
   first so we don't double-encode `&lt;` into `&amp;lt;`. */
function encodeSrcdoc(doc) {
  return doc
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderVizLoading(opts) {
  opts = opts || {};
  /* P_viz-no-streaming-spinner — when called during streaming
     (markdown.js passes opts.streaming=true), the spinner overlay
     is suppressed. The parent message's own thinking indicator
     already provides feedback; flashing a per-card "Rendering…"
     every stream tick produced visible flicker and re-ran the
     skeleton-fadeout animation each tick. The actual spinner
     still appears in the FINAL renderViz path (post-stream) so
     the user gets feedback when the iframe is mounting for
     real.
     P_viz-stable-id — when called during streaming with a stableId,
     reuse that id so the same <div class="viz"> is replaced
     in-place across rAF ticks instead of being torn down and
     re-created. */
  var streaming = opts.streaming;
  var id = opts.stableId || ("viz-card-" + (++_vizId));
  var body = streaming ? '' : vizLoadingHtml();
  return '<div class="viz" id="' + id + '" data-viz-state="loading"' +
    (streaming ? ' data-streaming="1"' : '') + '>' +
    '<div class="viz-body">' + body + '</div>' +
  '</div>';
}

function guardUserScripts(html, vizId) {
  /* P_viz-safety — wrap EVERY inline <script> in a try/catch so any
     synchronous error (not just explicit `throw`) posts a viz-error
     back to the parent. The previous version only wrapped scripts
     containing the `throw` keyword, which silently lost the majority
     of runtime errors (ReferenceError, TypeError, undefined calls,
     JSON parse failures, etc.) and left cards stuck on "Rendering…"
     until the 5s max-timer fired. The wrapper is self-contained —
     no external globals — so it works under sandbox="allow-scripts". */
  var idJson = JSON.stringify(vizId);
  return String(html || '').replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, function (_, attrs, code) {
    var safe = '(function(){' +
      'try{' + code + '}catch(e){' +
      'try{window.parent.postMessage({type:"viz-error",vizId:' + idJson + ',message:String((e&&e.message)||e).slice(0,300)},"*")}catch(_){}' +
      '}' +
    '}).call(this);';
    return '<script' + (attrs || '') + '>' + safe + '<\/script>';
  });
}

export function renderViz(htmlStr, opts) {
  opts = opts || {};
  /* P_viz-stable-id — when formatMsgProgressive closes a fence
     and we transition from a loading placeholder to the real
     iframe, the loading placeholder was already mounted under
     a stable id. Reuse that id so the same <div class="viz"> is
     updated in-place (innerHTML swap), which keeps the layout
     stable and avoids the iframe tearing down + re-mounting. */
  var id = opts.stableId || "viz-card-" + (++_vizId);
  var title = (window.state && window.state.topic || "Canvas").toString().slice(0, 40);
  // P_svg-no-xml-pi — strip the `<?xml version="1.0"?>` processing
  // instruction if the user pasted a standalone SVG document. Inside
  // an HTML <body>, the HTML5 tokenizer turns `<?...?>` into a bogus
  // comment (so it does not break parsing), but some browsers
  // (Safari, older Chrome builds) flip into quirks mode or refuse to
  // parse the SVG namespace when they see the PI inside an HTML
  // document — and the iframe ends up rendering a blank card. The
  // declaration is redundant inside HTML anyway (the iframe's own
  // <meta charset="utf-8"> handles encoding).
  var cleaned = String(htmlStr || '').replace(/^\s*<\?xml[^?]*\?>\s*/i, '');
  // The user HTML is injected into <body>. VIZ_THEME_RESET goes in
  // <head>, and the vizRuntime(id) snippet (which posts viz-ready)
  // is appended at the end of <body> so it runs AFTER all of the
  // user's inline <script>s.
  var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    VIZ_THEME_RESET +
    '<script>window.__vizId=' + JSON.stringify(id) + ';<\/script>' +
    '</head><body>' + guardUserScripts(cleaned, id) + vizRuntime(id) + '</body></html>';
  var srcdoc = encodeSrcdoc(doc);
  var bodyHtml =
    vizLoadingHtml() +
    '<iframe data-source="' + encodeSrcdoc(cleaned) + '" data-srcdoc="' + srcdoc + '" srcdoc="' + srcdoc +
    '" sandbox="allow-scripts" title="Canvas" ' +
    'style="width:100%;border:0;background:transparent;display:block;min-height:160px">' +
    '</iframe>';
  _pendingViz.push({ id: id });
  queueVizActions(id);
  return '<div class="viz" id="' + id + '" data-viz-state="loading" data-title="' + esc(title) + '">' +
    vizActions(id, true) +
    '<div class="viz-body">' + bodyHtml + '</div>' +
  '</div>';
}

/* Parse a ```plot``` spec. Accepted forms:
     <expr>                                  → defaults: x range -10..10
     <expr> from <a> to <b>                  → explicit range
     <expr> from <a> to <b> color=<c> [width=<n>]
   <expr> may reference x, pi, e, and the usual math fns. */
function parsePlotSpec(spec) {
  var src = String(spec || '').trim();
  if (!src) return { error: 'empty plot spec' };
  var color = '#3a6df0';
  var width = 1.6;
  var colorM = src.match(/\scolor\s*=\s*([a-zA-Z#][a-zA-Z0-9#(),.%\- ]*)/i);
  if (colorM) { color = colorM[1].trim(); src = src.replace(colorM[0], ''); }
  var widthM = src.match(/\swidth\s*=\s*([0-9]*\.?[0-9]+)/i);
  if (widthM) { width = parseFloat(widthM[1]) || width; src = src.replace(widthM[0], ''); }
  var xMin = -10, xMax = 10;
  var rangeM = src.match(/\sfrom\s+(-?[0-9.]+(?:\s*\*\s*pi)?|pi|-pi|e|-e)\s+to\s+(-?[0-9.]+(?:\s*\*\s*pi)?|pi|-pi|e|-e)/i);
  if (rangeM) {
    xMin = parsePlotRangeNumber(rangeM[1]);
    xMax = parsePlotRangeNumber(rangeM[2]);
    src = src.replace(rangeM[0], '');
  }
  var expr = src.trim();
  return { expr: expr, xMin: xMin, xMax: xMax, color: color, width: width, error: expr ? null : 'missing expression' };
}

function parsePlotRangeNumber(tok) {
  tok = String(tok || '').trim();
  if (!tok) return 0;
  if (tok === 'pi') return Math.PI;
  if (tok === '-pi') return -Math.PI;
  if (tok === 'e') return Math.E;
  if (tok === '-e') return -Math.E;
  var m = tok.match(/^(-?[0-9]*\.?[0-9]+)\s*\*\s*pi$/i);
  if (m) return parseFloat(m[1]) * Math.PI;
  var n = parseFloat(tok);
  return isFinite(n) ? n : 0;
}

export function renderPlot(spec, opts) {
  opts = opts || {};
  /* P_viz-stable-id — see renderViz for rationale. */
  var id = opts.stableId || "viz-card-" + (++_vizId);
  var title = "Plot";
  var parsed = parsePlotSpec(spec);
  // Serialize the plot spec. We do NOT inject this into the iframe
  // HTML via a separate <script> that runs AFTER the canvas script
  // — that race was the original bug. Instead we inline the
  // payload into a single <script> that runs BEFORE the canvas
  // init script by placing it at the top of <body>. The init
  // script then reads the payload from a global window.__plot
  // variable.
  var payloadJson = JSON.stringify({
    expr: parsed.expr,
    xMin: parsed.xMin,
    xMax: parsed.xMax,
    color: parsed.color,
    width: parsed.width,
    error: parsed.error || null
  });
  var innerHtml = '<canvas id="cv" style="display:block;width:100%;height:340px;background:transparent"></canvas>' +
    '<script>(function(){' +
      // Read the payload from the global set by the parent-of-this
      // <script> at the top of <body>. Fall back to a parse-error
      // message if the payload is missing (parent forgot to set
      // it, or the iframe was reloaded without re-running the
      // setup script).
      'var p=window.__plot;' +
      'var cv=document.getElementById("cv");' +
      'if(!cv){return;}' +
      'if(!p){var c0=cv.getContext("2d");c0.fillStyle="#a04040";c0.font="13px sans-serif";c0.fillText("Plot payload missing",16,24);return;}' +
      'var dpr=window.devicePixelRatio||1;' +
      'function fit(){var w=cv.clientWidth||600;var h=cv.clientHeight||340;cv.width=Math.max(1,Math.floor(w*dpr));cv.height=Math.max(1,Math.floor(h*dpr));}' +
      'fit();' +
      'window.addEventListener("resize",function(){fit();draw();});' +
      'function compile(src){' +
        'var s=src.replace(/\\s+/g,"");var i=0;' +
        'function peek(){return s[i];}' +
        'function eat(c){if(s[i]===c){i++;return true;}return false;}' +
        'function err(m){throw new Error(m);}' +
        'function bin(a,b,op){if(op==="+")return function(x){return a(x)+b(x)};if(op==="-")return function(x){return a(x)-b(x)};if(op==="*")return function(x){return a(x)*b(x)};if(op==="/")return function(x){return a(x)/b(x)};return function(x){return Math.pow(a(x),b(x))}}' +
        'function expr(){var v=term();while(peek()==="+"||peek()==="-"){var op=s[i++];v=bin(v,term(),op);}return v;}' +
        'function term(){var v=power();while(peek()==="*"||peek()==="/"){var op=s[i++];v=bin(v,power(),op);}return v;}' +
        'function power(){var v=atom();if(eat("^")){v=bin(v,power(),"^");}return v;}' +
        'function atom(){' +
          'var c=peek();' +
          'if(c==="("){i++;var v=expr();if(!eat(")"))err("missing )");return v;}' +
          'if(c==="-"){i++;var n=atom();return function(x){return -n(x)}}' +
          'if(c==="+"){i++;return atom();}' +
          'var n=s.slice(i).match(/^[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?/);if(n){i+=n[0].length;var q=parseFloat(n[0]);return function(){return q};}' +
          'var id=s.slice(i).match(/^[A-Za-z][A-Za-z0-9]*/);if(id){var nm=id[0];i+=nm.length;' +
            'if(nm==="x")return function(x){return x};if(nm==="pi")return function(){return Math.PI};if(nm==="e")return function(){return Math.E};' +
            'var F={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,exp:Math.exp,log:Math.log,ln:Math.log,sqrt:Math.sqrt,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,round:Math.round,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh};' +
            'if(F[nm]){if(!eat("("))err("expected (");var a=expr();if(!eat(")"))err("missing )");return function(x){return F[nm](a(x))};}' +
            'err("unknown: "+nm);}' +
          'err("unexpected "+c);}' +
        'return expr();' +
      '}' +
      'var tree=null;' +
      'try{tree=compile(p.expr||"");}catch(err2){' +
        'var c0=cv.getContext("2d");c0.fillStyle="#a04040";c0.font="13px sans-serif";c0.fillText("Parse error: "+err2.message,16,24);' +
        'return;' +
      '}' +
      'function draw(){' +
        'var ctx=cv.getContext("2d");var w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);' +
        'if(p.error){ctx.fillStyle="#a04040";ctx.font="13px sans-serif";ctx.fillText("Plot error: "+p.error,16,24);return;}' +
        'var N=400;var xs=new Array(N);var ys=new Array(N);' +
        'for(var k=0;k<N;k++){var xv=p.xMin+(p.xMax-p.xMin)*k/(N-1);xs[k]=xv;var yv=tree(xv);ys[k]=isFinite(yv)?yv:NaN;}' +
        'var yMin=Infinity,yMax=-Infinity;' +
        'for(var k2=0;k2<N;k2++){if(isFinite(ys[k2])){if(ys[k2]<yMin)yMin=ys[k2];if(ys[k2]>yMax)yMax=ys[k2];}}' +
        'if(!isFinite(yMin)){yMin=-1;yMax=1;}' +
        'var pad=(yMax-yMin)*0.1||1;yMin-=pad;yMax+=pad;' +
        'var left=Math.floor(40*dpr),right=Math.floor(w-30*dpr),top=Math.floor(20*dpr),bottom=Math.floor(h-30*dpr);' +
        'var W=right-left,H=bottom-top;' +
        'function X(xv){return left+(xv-p.xMin)/(p.xMax-p.xMin)*W;}' +
        'function Y(yv){return bottom-(yv-yMin)/(yMax-yMin)*H;}' +
        'var axisColor=getComputedStyle(document.body).getPropertyValue("--text-300").trim()||"#888";' +
        'ctx.strokeStyle=axisColor;ctx.lineWidth=1;ctx.beginPath();' +
        'ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();' +
        'if(yMin<0&&yMax>0){ctx.strokeStyle=axisColor;ctx.beginPath();ctx.moveTo(left,Y(0));ctx.lineTo(right,Y(0));ctx.stroke();}' +
        'if(p.xMin<0&&p.xMax>0){ctx.strokeStyle=axisColor;ctx.beginPath();ctx.moveTo(X(0),top);ctx.lineTo(X(0),bottom);ctx.stroke();}' +
        'ctx.fillStyle=axisColor;ctx.font=Math.floor(10*dpr)+"px sans-serif";' +
        'ctx.textAlign="right";ctx.textBaseline="middle";' +
        'var yTicks=5;for(var t=0;t<=yTicks;t++){var yv=yMin+(yMax-yMin)*t/yTicks;ctx.fillText(yv.toFixed(2),left-6*dpr,Y(yv));}' +
        'ctx.textAlign="center";ctx.textBaseline="top";' +
        'var xTicks=6;for(var t2=0;t2<=xTicks;t2++){var xv=p.xMin+(p.xMax-p.xMin)*t2/xTicks;ctx.fillText(xv.toFixed(2),X(xv),bottom+4*dpr);}' +
        'ctx.strokeStyle=p.color;ctx.lineWidth=p.width*dpr;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();' +
        'var started=false;' +
        'for(var k3=0;k3<N;k3++){if(!isFinite(ys[k3])){started=false;continue;}var px=X(xs[k3]),py=Y(ys[k3]);if(!started){ctx.moveTo(px,py);started=true;}else{ctx.lineTo(px,py);}}' +
        'ctx.stroke();' +
        'ctx.fillStyle=axisColor;ctx.font="italic "+Math.floor(11*dpr)+"px sans-serif";ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText("f(x) = "+p.expr,left,Math.floor(6*dpr));' +
      '}' +
      'draw();' +
    '})();<\/script>';
  // CRITICAL: set window.__plot BEFORE the canvas init script runs.
  // The previous version placed the setAttribute call AFTER the
  // canvas init, which made the canvas read null and silently fail
  // to draw. We use a <script> at the TOP of <body> that runs
  // synchronously before any subsequent <script>.
  var setupScript = '<script>window.__plot=' + payloadJson + ';<\/script>';
  var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    VIZ_THEME_RESET +
    '<script>window.__vizId=' + JSON.stringify(id) + ';<\/script>' +
    '</head><body>' + setupScript + innerHtml + vizRuntime(id) + '</body></html>';
  var srcdoc = encodeSrcdoc(doc);
  var bodyHtml =
    vizLoadingHtml() +
    '<iframe data-source="' + encodeSrcdoc(String(spec || '')) + '" data-srcdoc="' + srcdoc + '" srcdoc="' + srcdoc +
    '" sandbox="allow-scripts" title="Plot of ' + esc(parsed.expr) + '" ' +
    'style="width:100%;border:0;background:transparent;display:block;min-height:340px">' +
    '</iframe>';
  _pendingViz.push({ id: id });
  queueVizActions(id);
  return '<div class="viz" id="' + id + '" data-viz-state="loading" data-title="' + esc(title) + '">' +
    vizActions(id, true) +
    '<div class="viz-body">' + bodyHtml + '</div>' +
  '</div>';
}

/* Track which card ids we are still waiting for. Each entry holds a
   timeout handle + a list of callbacks. When the iframe posts
   viz-ready (or the max-wait timeout fires), we resolve the entry
   and remove it from the map. */
var _pendingReady = Object.create(null);
var _vizCards = Object.create(null);
var VIZ_MAX_WAIT_MS = 5000;

export function processPendingViz() {
  var pending = _pendingViz;
  _pendingViz = [];
  pending.forEach(function (item) {
    var el = document.getElementById(item.id);
    if (!el) return;
    var iframe = el.querySelector('iframe');
    if (!iframe) return;
    if (_pendingReady[item.id]) return; // already wired up

    // Stash the iframe + a ready resolver on the card so the global
    // postMessage listener (installed once on first use) can find
    // the right iframe to update.
    var entry = {
      iframe: iframe,
      card: el,
      maxTimer: setTimeout(function () {
        // Max wait expired without a viz-ready message. This
        // usually means the iframe never finished loading
        // (network error, infinite loop in the user's script,
        // or the contentDocument was blocked by the sandbox
        // policy). Flip the card to error and surface a
        // diagnostic.
        //
        // P_viz-no-autoreload — the previous version auto-
        // reloaded the iframe here, which produced a visible
        // "Rendering…" → error → "Rendering…" → … flicker. The
        // user can re-trigger via the Reload button, which
        // surfaces the error to them with full intent. We never
        // re-enter `loading` state from a timeout.
        var card = entry.card;
        if (!card || card.getAttribute('data-viz-state') === 'ready') return;
        if (!card.isConnected) return;
        card.setAttribute('data-viz-state', 'error');
        var body = card.querySelector('.viz-body');
        if (body) {
          // Keep the iframe mounted so the user can see what
          // was rendered (it might be partially done) but show
          // a thin warning bar.
          var banner = document.createElement('div');
          banner.className = 'viz-error';
          banner.innerHTML = '<span class="viz-error-icon">!</span><span class="viz-error-msg">Canvas took too long to render</span>' +
            '<button type="button" class="viz-error-btn" data-action="viz-toggle-source">Show source</button>' +
            '<pre class="viz-error-source" hidden>' + esc(iframe.getAttribute('data-srcdoc') || '').slice(0, 2000) + '</pre>';
          // Insert banner ABOVE the iframe
          if (iframe.parentNode === body) body.insertBefore(banner, iframe);
          // Bind the toggle-source button immediately. We no longer
          // rely on the global document-wide [data-action] scan that
          // ran every stream tick, so cards must self-bind.
          _bindAction(banner.querySelector('.viz-error-btn'));
        }
        _hideLoading(card);
        clearTimeout(entry.maxTimer);
        delete _pendingReady[item.id];
        delete _vizCards[item.id];
      }, VIZ_MAX_WAIT_MS),
      ready: false,
    };
    _pendingReady[item.id] = entry;
    _vizCards[item.id] = entry;
  });
  try { processPendingVizActions(); } catch (_) {}
  _ensureMessageListener();
}

function _hideLoading(card) {
  if (!card) return;
  var loading = card.querySelector('.viz-loading');
  if (loading) loading.style.display = 'none';
}

function _markReady(id) {
  var entry = _pendingReady[id];
  if (!entry) return;
  var card = entry.card;
  if (!card) { delete _pendingReady[id]; return; }
  if (card.getAttribute('data-viz-state') === 'ready') {
    clearTimeout(entry.maxTimer);
    delete _pendingReady[id];
    delete _vizCards[id];
    return;
  }
  card.setAttribute('data-viz-state', 'ready');
  // If the iframe posted a height, adopt it so the card doesn't
  // show a fixed min-height when the content is shorter/longer.
  if (entry.lastHeight && entry.lastHeight > 16) {
    entry.iframe.style.height = entry.lastHeight + 'px';
  }
  _hideLoading(card);
  clearTimeout(entry.maxTimer);
  delete _pendingReady[id];
  delete _vizCards[id];
}

function _markError(id, message) {
  /* P_viz-cleanup — the iframe may report a viz-error after the
     registry entry has already been removed (e.g. timeout fired
     first). Resolve the live card via the DOM in that case so the
     error still surfaces without resurrecting a strong reference to
     a card that should be GC-able. */
  var entry = _pendingReady[id] || _vizCards[id];
  var card = entry && entry.card;
  if (!card) card = document.getElementById(id);
  if (!card) { delete _pendingReady[id]; delete _vizCards[id]; return; }
  if (card.getAttribute('data-viz-state') === 'error') return;
  card.setAttribute('data-viz-state', 'error');
  _hideLoading(card);
  var body = card.querySelector('.viz-body');
  if (body) {
    var banner = document.createElement('div');
    banner.className = 'viz-error';
    banner.innerHTML = '<span class="viz-error-icon">!</span><span class="viz-error-msg">' + esc(message || 'Canvas failed to render') + '</span>' +
      '<button type="button" class="viz-error-btn" data-action="viz-toggle-source">Show source</button>' +
      '<pre class="viz-error-source" hidden>' + esc((entry && entry.iframe && entry.iframe.getAttribute('data-srcdoc')) || card.querySelector('iframe') && card.querySelector('iframe').getAttribute('data-srcdoc') || '').slice(0, 2000) + '</pre>';
    var iframeEl = entry && entry.iframe;
    if (!iframeEl) iframeEl = card.querySelector('iframe');
    if (iframeEl && iframeEl.parentNode === body) body.insertBefore(banner, iframeEl);
    _bindAction(banner.querySelector('.viz-error-btn'));
  }
  if (entry && entry.maxTimer) clearTimeout(entry.maxTimer);
  delete _pendingReady[id];
  delete _vizCards[id];
}

var _msgListenerInstalled = false;
function _ensureMessageListener() {
  if (_msgListenerInstalled || typeof window === 'undefined') return;
  _msgListenerInstalled = true;
  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'viz-ready') {
      var id = data.vizId;
      var entry = id && _pendingReady[id];
      if (!entry) return;
      entry.lastHeight = data.h || 0;
      if (!entry.ready) {
        entry.ready = true;
        clearTimeout(entry.maxTimer);
        _markReady(id);
      }
    } else if (data.type === 'viz-error') {
      var id2 = data.vizId;
      _markError(id2, data.message);
    }
  });
}

export function renderVizError(htmlStr, errorMsg) {
  var id = "viz-card-" + (++_vizId);
  var msg = esc((errorMsg || 'Could not load canvas').slice(0, 240));
  return '<div class="viz" id="' + id + '" data-viz-state="error">' +
    '<div class="viz-body"><div class="viz-error"><span class="viz-error-icon">!</span><span>' + msg + '</span></div></div>' +
  '</div>';
}

function decodeSrcdoc(srcdoc) {
  return String(srcdoc || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function openVizModal(srcdoc, title) {
  if (!srcdoc) return;
  // srcdoc is HTML-attribute-encoded when it comes from
  // data-srcdoc. Decode it back to raw HTML before stuffing it
  // into the modal iframe, which expects a raw srcdoc value.
  var decoded = decodeSrcdoc(srcdoc);
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  var dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas fullscreen");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";

  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Canvas";
  head.appendChild(titleEl);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body";

  var iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("title", "Canvas fullscreen");
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.display = "block";
  iframe.srcdoc = decoded;
  modalBody.appendChild(iframe);

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

/* P_modal-raw — like openVizModal but the body is raw HTML, not a
   sandboxed iframe. Used by the image lightbox (matplotlib output)
   and the code-block fullscreen view where we don't need sandboxing
   — the content is our own, not user-input. Shares the same shell,
   close button, Esc handler, and click-outside-to-close behaviour
   as the sandboxed version so the two modals feel identical. */
export function openVizModalRaw(html, title) {
  if (!html) return;
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  var dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", title || "Fullscreen");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";
  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Fullscreen";
  head.appendChild(titleEl);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body viz-modal-body-raw";
  modalBody.innerHTML = html;

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

function openVizSourceModal(srcdoc, title) {
  if (!srcdoc) return;
  var decoded = decodeSrcdoc(srcdoc);
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", function (event) { if (event.target === modal) close(); });

  var dialog = document.createElement("div");
  dialog.className = "viz-modal viz-source-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas source");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";
  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = (title || "Canvas") + " source";
  head.appendChild(titleEl);

  var copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "viz-source-copy";
  copyButton.textContent = "Copy source";
  copyButton.addEventListener("click", function () {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    navigator.clipboard.writeText(decoded).then(function () {
      copyButton.textContent = "Copied";
      setTimeout(function () { copyButton.textContent = "Copy source"; }, 1200);
    }).catch(function () { copyButton.textContent = "Copy failed"; });
  });
  head.appendChild(copyButton);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var body = document.createElement("div");
  body.className = "viz-modal-body viz-source-body";
  var pre = document.createElement("pre");
  pre.className = "viz-source-code";
  pre.textContent = decoded;
  body.appendChild(pre);

  dialog.appendChild(head);
  dialog.appendChild(body);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

var _pendingActions = [];

export function processPendingVizActions() {
  var pending = _pendingActions;
  _pendingActions = [];
  pending.forEach(_bindActionsInCard);
}

function _bindActionsInCard(item) {
  var el = document.getElementById(item && item.id);
  if (!el) return;
  var actions = el.querySelectorAll('[data-action]');
  for (var i = 0; i < actions.length; i++) _bindAction(actions[i]);
}

function _bindAction(el) {
  if (!el || el.__vizActionBound) return;
  var act = el.getAttribute('data-action');
  if (act === 'viz-reload') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      reloadVizCard(c);
    });
  } else if (act === 'viz-source') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      if (!c) return;
      var f = c.querySelector('iframe');
      openVizSourceModal((f && (f.dataset.source || f.dataset.srcdoc)) || '', c.dataset.title || 'Canvas');
    });
  } else if (act === 'viz-expand') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      if (!c) return;
      var f = c.querySelector('iframe');
      window.__vizOpenModal && window.__vizOpenModal(
        (f && f.dataset.srcdoc) || '',
        c.dataset.title || 'Canvas'
      );
    });
  } else if (act === 'viz-toggle-source') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var n = el.nextElementSibling;
      if (n) n.hidden = !n.hidden;
    });
  } else if (act === 'viz-close-modal') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var m = el.closest('.viz-modal-backdrop');
      if (m) m.remove();
    });
  }
  el.__vizActionBound = true;
}

function reloadVizCard(card) {
  var iframe = card && card.querySelector('iframe');
  if (!iframe || !iframe.dataset.srcdoc) return;
  if (card.id && _pendingReady[card.id]) {
    clearTimeout(_pendingReady[card.id].maxTimer);
    delete _pendingReady[card.id];
  }
  if (card.id) delete _vizCards[card.id];
  card.setAttribute('data-viz-state', 'loading');
  var oldError = card.querySelector('.viz-error');
  if (oldError) oldError.remove();
  var loading = card.querySelector('.viz-loading');
  if (loading) loading.style.display = '';
  iframe.removeAttribute('srcdoc');
  iframe.setAttribute('srcdoc', iframe.dataset.srcdoc);
  if (card.id) _pendingViz.push({ id: card.id });
  processPendingViz();
}

export function queueVizActions(id) {
  if (id) _pendingActions.push({ id: id });
}
