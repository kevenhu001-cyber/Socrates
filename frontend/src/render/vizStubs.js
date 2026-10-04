/* vizStubs.js — eager half of the viz subsystem.
 *
 * Owns the synchronous HTML stub producers (renderViz/renderPlot/
 * renderMermaid/renderVizLoading) plus the pending-work queues they fill.
 * formatMsg() calls these while it builds message HTML — that path must
 * stay synchronous, so this module stays in the entry chunk.
 *
 * The expensive half (iframe handshake, mermaid render, action binding,
 * card lifecycle, modals) lives in ./viz.js and is loaded on demand via
 * loadVizRuntime(); visualization mounting lives in ./visualization.js
 * behind loadVisualization(). Public proxy functions below keep the old
 * call sites working: callers that used to `import {...} from './viz.js'`
 * now import the same names from here, and the proxies forward to the
 * lazy module once it is warm.
 */
import { ensureMermaid } from '../vendor/lazy.js';
var _vizId = 0;
export var _pendingMermaid = [];
export var _pendingViz = [];

export var VIZ_ICON_RENDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>';
export var VIZ_ICON_RELOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
export var VIZ_ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><path d="M9 21 3 21 3 15"/><path d="M21 3 14 10"/><path d="M3 21 10 14"/></svg>';
export var VIZ_ICON_SOURCE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/><path d="m14 5-4 14"/></svg>';

/* VIZ_THEME_RESET — applied INSIDE the iframe so the user's canvas
   inherits the page's design tokens (text color, accent, monospace
   font). We use postMessage from the iframe to ask the parent for
   the live token values once on load, then keep them in CSS vars. */
export var VIZ_THEME_RESET =
  /* P_perf-self-host — the iframe is a separate document and fonts are
     now bundled with the parent app, so it uses the platform font stack
     instead of blocking on fonts.googleapis.com. */
  '<style>' +
    '*,*::before,*::after{box-sizing:border-box}' +
    'html,body{margin:0;padding:0}' +
    'body{font-family:"Noto Sans SC","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;font-size:14px;line-height:1.55}' +
    'body{color:var(--text-100,#3a3a3a);background:transparent}' +
    '[data-mode=dark] body{color:var(--text-100,#e8e8ec)}' +
    'a{color:var(--accent-000,#5b6fdb)}' +
    'svg{max-width:100%;height:auto;display:block}' +
    'pre{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em;background:rgba(120,120,140,0.08);border-radius:8px;padding:8px 10px;overflow:auto}' +
    'code{font-family:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;font-size:.92em}' +
  '</style>';

import { esc } from './helpers.js';
import { reportSwallow } from '../util/reportSwallow.ts';

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
      'function docH(){return Math.max(document.body.scrollHeight,document.documentElement.scrollHeight||0)}' +
      /* errNow() reports the card's failure state — either a runtime
         error caught by our listeners (_err) or a synchronous script
         error recorded by guardUserScripts' try/catch wrapper
         (window.__vizErr), which fires before this snippet even runs.
         The wrapper's one-shot viz-error post can be dropped when the
         parent's listener is not attached yet (the viz runtime chunk
         loads lazily), so postReady and the ping ack re-check the
         recorded state instead of blindly claiming readiness. */
      'function errNow(){return _err||window.__vizErr||null}' +
      /* NOTE — the catch(e){} bodies below are part of the IFRAME source
         string, not parent-frame code. They run inside the sandboxed srcdoc
         document, where `reportSwallow` does not exist: injecting it would
         raise a ReferenceError and break the card outright. Their own error
         channel is the guardUserScripts wrapper (window.__vizErr) plus
         postError(), which posts to the parent. Instrumenting them needs a
         local shim inside the srcdoc, not this module's helper. */
      'function postReady(){' +
        'var er=errNow();if(er!==null){postError(er);return}' +
        'try{window.parent.postMessage({type:"viz-ready",vizId:VIZ_ID,h:docH()},"*")}catch(e){}' +
      '}' +
      'function postError(msg){try{window.parent.postMessage({type:"viz-error",vizId:VIZ_ID,message:String(msg||"").slice(0,300)},"*")}catch(e){}}' +
      /* P_viz-ping-ack — the parent pings us when its max-wait expires
         without a viz-ready (the ready post can race the parent's
         listener attachment). We answer with a fresh viz-ready so the
         parent reuses one code path. vizId check keeps cards from
         answering each other's pings. */
      'var _err=null;' +
      'window.addEventListener("message",function(e){var d=e&&e.data;if(d&&d.type==="viz-ping"&&d.vizId===VIZ_ID){var er=errNow();if(er!==null)postError(er);else postReady()}});' +
      /* P_viz-resize — height is only reported at ready time, but the
         body keeps growing afterwards (late images, animations, async
         layout) and gets clipped by the fixed height. Observe the body
         and post throttled deltas so the parent can grow the iframe. */
      'var _lastH=0;' +
      'function postH(){var h=docH();if(Math.abs(h-_lastH)>=4){_lastH=h;try{window.parent.postMessage({type:"viz-resize",vizId:VIZ_ID,h:h},"*")}catch(e){}}}' +
      'if(typeof ResizeObserver!=="undefined"){try{new ResizeObserver(function(){postH()}).observe(document.body)}catch(e){}}else{setInterval(postH,800)}' +
      'window.addEventListener("error",function(e){_err=(e&&e.message)||"runtime error";postError(_err)});' +
      'window.addEventListener("unhandledrejection",function(e){_err=(e&&e.reason&&(e.reason.message||e.reason))||"unhandled rejection";postError(_err)});' +
      'function ready(){' +
        'var fonts=(document.fonts&&document.fonts.ready)||null;' +
        'var fontsPromise=fonts?fonts.then(function(){return null},function(){return null}):Promise.resolve(null);' +
        'Promise.resolve(fontsPromise).then(setTimeout.bind(null,postReady,0));' +
      '}' +
      'if(document.readyState==="complete"||document.readyState==="interactive"){' +
        'ready()' +
      '}else{' +
        'document.addEventListener("DOMContentLoaded",ready)' +
      '}' +
    '})();' +
  '<\/script>';
}

/* Session-level view preference for the Preview/Code toggle. Once a
   user flips any card to "code", subsequently rendered cards honor it
   (streaming re-renders included, since renderViz reads it fresh each
   call). Persisted so the choice survives reloads. */
var _vizViewPref = null;
try { _vizViewPref = localStorage.getItem('socrates-viz-view'); } catch (e) { reportSwallow(e, 'vizStubs.readViewPref'); /* ignore */ }
if (_vizViewPref !== 'code') _vizViewPref = 'preview';

function vizActions(cardId, showSource, viewToggle) {
  return '<div class="viz-actions">' +
    (viewToggle ?
      '<span class="viz-seg" role="group" aria-label="Card view">' +
        '<button type="button" class="viz-seg-btn' + (_vizViewPref === 'code' ? '' : ' is-on') + '" data-viz-card="' + cardId + '" data-viz-view-opt="preview">Preview</button>' +
        '<button type="button" class="viz-seg-btn' + (_vizViewPref === 'code' ? ' is-on' : '') + '" data-viz-card="' + cardId + '" data-viz-view-opt="code">Code</button>' +
      '</span>' : '') +
    '<span class="viz-status" role="status"><span class="viz-status-dot"></span><span class="viz-status-label"></span></span>' +
    (showSource ? '<button type="button" class="viz-btn viz-btn-source" title="View source" aria-label="View source" data-viz-card="' + cardId + '">' +
      VIZ_ICON_SOURCE + '</button>' : '') +
    '<button type="button" class="viz-btn viz-btn-reload" title="Reload" aria-label="Reload" data-viz-card="' + cardId + '">' +
      VIZ_ICON_RELOAD + '</button>' +
    '<button type="button" class="viz-btn viz-btn-expand" title="Expand" aria-label="Expand" data-viz-card="' + cardId + '">' +
      VIZ_ICON_EXPAND + '</button>' +
  '</div>';
}

export function vizErrorHtml(message, source) {
  var msg = esc(message || '');
  var src = esc(source || '');
  return '<div class="viz-error">' +
    '<span class="viz-error-icon">!</span>' +
    '<span class="viz-error-msg">' + msg + '</span>' +
    '<button type="button" class="viz-error-btn">Show source</button>' +
    '<button type="button" class="viz-error-fix">Fix with AI</button>' +
    '<pre class="viz-error-source" hidden>' + src + '</pre>' +
  '</div>';
}

function vizLoadingHtml() {
  return '<div class="viz-loading"><span class="viz-spinner"></span><span>Rendering…</span></div>';
}

export function validMermaid(code) {
  try { return typeof mermaid.parse === "function" ? mermaid.parse(code, { suppressErrors: true }) : true; }
  catch (_) { return false; }
}

/* P_mermaid-parse-cache — during streaming the same stableId is re-rendered
   every painted frame, and each call used to pay a synchronous
   mermaid.parse. The id is derived from the content hash, so a known-good
   id never needs re-validating. */
var _mermaidChecked = Object.create(null);
var _mermaidCheckedCount = 0;
/* The cache is keyed by content hash and grows with every distinct
   diagram a session produces. It's a pure memo — past the cap, reset
   it; the worst case is one redundant mermaid.parse per diagram. */
var MERMAID_CHECKED_MAX = 500;

export function renderMermaid(code, opts) {
  opts = opts || {};
  var stableId = opts.stableId;
  /* P_mermaid-parse-once — mermaid.parse is synchronous and expensive, so
     whichever check passes here rides along on the queue entry: the drain
     reuses it instead of parsing the same diagram a second time. Only
     mermaid-still-loading callers (validated stays false) are parsed once
     in the drain, which is where they were parsed before. */
  var validated = false;
  if (typeof mermaid !== "undefined") {
    validated = true;
    if (!(stableId && _mermaidChecked[stableId] === 'ok')) {
      var ok = validMermaid(code);
      if (stableId) {
        if (_mermaidCheckedCount >= MERMAID_CHECKED_MAX) {
          _mermaidChecked = Object.create(null);
          _mermaidCheckedCount = 0;
        }
        _mermaidChecked[stableId] = ok ? 'ok' : 'bad';
        _mermaidCheckedCount++;
      }
      if (!ok) {
        return '<div class="viz" data-viz-state="error"><div class="viz-body">' + vizErrorHtml('Diagram syntax error', code) + '</div></div>';
      }
    }
  }
  /* P_viz-stable-id — accept opts.stableId so a streaming fence
     keeps the same card id across rAF ticks. Without this the
     streaming renderer (formatMsgProgressive) allocates a new
     viz-card-N every tick, blowing away the previous iframe and
     orphaning the postMessage handshake. */
  var id = opts.stableId || "mermaid-card-" + (++_vizId);
  /* Same id ⇒ same code (the stable id is a content hash), so a repeat
     push only duplicates queue work. */
  if (!_pendingMermaid.some(function (item) { return item.id === id; })) {
    _pendingMermaid.push({ id: id, code: code, validated: validated });
  }
  queueVizActions(id);
  if (typeof mermaid === "undefined") ensureMermaid();
  return '<div class="viz" id="' + id + '" data-viz-state="loading">' +
    vizActions(id) +
    '<div class="viz-body">' + vizLoadingHtml() + '</div>' +
  '</div>';
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
      'window.__vizErr=String((e&&e.message)||e).slice(0,300);' +
      'try{window.parent.postMessage({type:"viz-error",vizId:' + idJson + ',message:window.__vizErr},"*")}catch(_){}' +
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
  var title = (window.stateStore.read("topic") || "Canvas").toString().slice(0, 40);
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
    /* Code pane — shown when the card's data-viz-view="code". Lives
       inside .viz-body so error banners stay visible in both views. */
    '<pre class="viz-code-pane"><code class="language-html">' + esc(cleaned) + '</code></pre>' +
    vizLoadingHtml() +
    '<iframe data-source="' + encodeSrcdoc(cleaned) + '" data-srcdoc="' + srcdoc + '" srcdoc="' + srcdoc +
    '" sandbox="allow-scripts" title="Canvas" ' +
    'style="width:100%;border:0;background:transparent;display:block;min-height:160px">' +
    '</iframe>';
  if (!_pendingViz.some(function (item) { return item.id === id; })) {
    _pendingViz.push({ id: id });
  }
  queueVizActions(id);
  return '<div class="viz" id="' + id + '" data-viz-state="loading" data-viz-view="' + _vizViewPref + '" data-title="' + esc(title) + '">' +
    vizActions(id, true, true) +
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
  if (!_pendingViz.some(function (item) { return item.id === id; })) {
    _pendingViz.push({ id: id });
  }
  queueVizActions(id);
  return '<div class="viz" id="' + id + '" data-viz-state="loading" data-title="' + esc(title) + '">' +
    vizActions(id, true) +
    '<div class="viz-body">' + bodyHtml + '</div>' +
  '</div>';
}

export var _pendingActions = [];

export function queueVizActions(id) {
  if (id) _pendingActions.push({ id: id });
  loadVizRuntime();
}
/* ── Queue + shared-state accessors (the lazy half imports these) ── */

export function dropPendingVizId(id) {
  _pendingViz = _pendingViz.filter(function (item) { return item.id !== id; });
  _pendingMermaid = _pendingMermaid.filter(function (item) { return item.id !== id; });
}

export function takePendingViz() {
  var q = _pendingViz;
  _pendingViz = [];
  return q;
}

export function takePendingMermaid() {
  var q = _pendingMermaid;
  _pendingMermaid = [];
  return q;
}

export function takePendingActions() {
  var q = _pendingActions;
  _pendingActions = [];
  return q;
}

export function nextVizId() {
  return ++_vizId;
}

export function vizViewPref() {
  return _vizViewPref;
}

export function setVizViewPref(view) {
  _vizViewPref = view;
}

export function pendingVizCounts() {
  return { mermaid: _pendingMermaid.length, viz: _pendingViz.length, actions: _pendingActions.length };
}

/* ── Lazy viz runtime (./viz.js) ──────────────────────────────────
 *
 * The chunk only starts downloading when real viz work exists: the stub
 * producers kick loadVizRuntime() when they queue a card, and the
 * process/reclaim proxies kick it when they see a non-empty queue or a
 * .viz element in the DOM. While the import is in flight the producers
 * keep appending to the queues above; the .then drain below flushes
 * everything once the module lands, so nothing gets stranded.
 */
var _vizRuntime = null;
var _vizRuntimeImport = null;

export function loadVizRuntime() {
  if (!_vizRuntimeImport) {
    _vizRuntimeImport = import('./viz.js').then(function (m) {
      _vizRuntime = m;
      try { m.processPendingViz(); } catch (e) { reportSwallow(e, 'vizStubs.drainViz'); /* drain errors are non-fatal */ }
      try { m.processPendingMermaid(); } catch (e) { reportSwallow(e, 'vizStubs.drainMermaid'); /* drain errors are non-fatal */ }
      try { m.processPendingVizActions(); } catch (e) { reportSwallow(e, 'vizStubs.drainActions'); /* drain errors are non-fatal */ }
      return m;
    });
    _vizRuntimeImport.catch(function (err) {
      _vizRuntimeImport = null;
      console.error('[viz] failed to load runtime', err);
    });
  }
  return _vizRuntimeImport;
}

export function processPendingViz() {
  var m = _vizRuntime;
  if (m) return m.processPendingViz();
  if (_pendingViz.length) loadVizRuntime();
}

export function processPendingVizActions(root) {
  var m = _vizRuntime;
  if (m) return m.processPendingVizActions(root);
  if (_pendingActions.length) loadVizRuntime();
}

export function processPendingMermaid() {
  var m = _vizRuntime;
  if (m) return m.processPendingMermaid();
  if (_pendingMermaid.length) loadVizRuntime();
}

export function schedulePendingMermaid(root) {
  var m = _vizRuntime;
  if (m) return m.schedulePendingMermaid(root);
  if (_pendingMermaid.length) {
    loadVizRuntime().then(function (r) { r.schedulePendingMermaid(root); });
  }
}

export function reclaimVizCards(root) {
  var m = _vizRuntime;
  if (m) return m.reclaimVizCards(root);
  /* Only worth pulling the runtime down when a card actually exists in
     the DOM — reclaim re-adopts .viz elements after innerHTML rewrites. */
  if (root && typeof root.querySelector === 'function' && root.querySelector('.viz')) {
    loadVizRuntime().then(function (r) { r.reclaimVizCards(root); });
  }
}

export function getLiveVizCardIds() {
  return _vizRuntime ? _vizRuntime.getLiveVizCardIds() : [];
}

export function parkVizCardForTest(card) {
  var m = _vizRuntime;
  if (m) return m.parkVizCardForTest(card);
  return loadVizRuntime().then(function (r) { return r.parkVizCardForTest(card); });
}

export function unparkVizCardForTest(card) {
  var m = _vizRuntime;
  if (m) return m.unparkVizCardForTest(card);
  return loadVizRuntime().then(function (r) { return r.unparkVizCardForTest(card); });
}

export function renderVizError(htmlStr, errorMsg) {
  var m = _vizRuntime;
  if (m) return m.renderVizError(htmlStr, errorMsg);
  return loadVizRuntime().then(function (r) { return r.renderVizError(htmlStr, errorMsg); });
}

export function openVizModal(srcdoc, title) {
  loadVizRuntime().then(function (r) { r.openVizModal(srcdoc, title); });
}

export function openVizModalRaw(html, title) {
  loadVizRuntime().then(function (r) { r.openVizModalRaw(html, title); });
}

/* ── Lazy visualization mounts (./visualization.js) ───────────────
 *
 * mountVisualization is only needed when a rendered card carries a viz
 * spec; dispose* only need to reach the module if it was ever loaded
 * (nothing can be mounted before then), so they key off the import
 * promise rather than pulling the chunk for a no-op.
 */
var _visModule = null;
var _visImport = null;

export function loadVisualization() {
  if (!_visImport) {
    _visImport = import('./visualization.js').then(function (m) {
      _visModule = m;
      return m;
    });
    _visImport.catch(function (err) {
      _visImport = null;
      console.error('[viz] failed to load visualization', err);
    });
  }
  return _visImport;
}

export function mountVisualization(spec, host, opts) {
  if (_visModule) return _visModule.mountVisualization(spec, host, opts);
  return loadVisualization().then(function (m) { return m.mountVisualization(spec, host, opts); });
}

export function disposeVisualizations(host) {
  if (_visModule) {
    _visModule.disposeVisualizations(host);
  } else if (_visImport) {
    _visImport.then(function (m) { m.disposeVisualizations(host); });
  }
}

export function disposeVisualization(card) {
  if (_visModule) {
    _visModule.disposeVisualization(card);
  } else if (_visImport) {
    _visImport.then(function (m) { m.disposeVisualization(card); });
  }
}
