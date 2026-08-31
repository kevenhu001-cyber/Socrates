/* chat/agentStream.js — extracted from main.js (Agent Stream).
 * Stream agent text into a single assistant bubble & render run footer.
 *
 * Exports: beginAgentTextStream, appendRunFooter
 *
 * Reads from window.*: scrollMainToBottom, hljs
 */

import { esc } from '../render/helpers.js';
import { formatMsg, formatMsgProgressive } from '../render/markdown.js';
import { getStreamRenderInterval, splitStreamingMarkdown } from '../render/streaming.js';
import { scrollContainer } from '../ui/scroll.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from '../render/viz.js';

/* Stream agent text into a single assistant bubble. Returns the
   controller { append(delta), finalize() }. Same rAF-coalesced
   pattern as addStreamingMessage — so we get the full chat
   markdown renderer (formatMsg -> marked + KaTeX) for headings,
   code blocks, inline code, lists, links, and math. */
export function beginAgentTextStream(){
  var list=document.getElementById("msgList");
  if(!list)return null;
  var div=document.createElement("div");
  div.className="msg assistant";
  /* Override content-visibility:auto so scrollHeight stays accurate
     even when the user scrolls away during streaming. */
  div.style.contentVisibility="visible";
  var body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  list.appendChild(div);
  var full="";
  var finished=false;
  var pending=null;
  var pendingTimer=null;
  var lastRenderAt=0;
  var settledText=null;
  var settled=document.createElement("div");
  settled.className="stream-settled-content";
  var live=document.createElement("div");
  live.className="stream-live-content";
  var cursor=document.createElement("span");
  cursor.className="stream-cursor";
  cursor.textContent="▍";
  body.classList.add("stream-content");
  body.appendChild(settled);
  body.appendChild(live);
  body.appendChild(cursor);
  function cancelScheduled(){
    if(pending){cancelAnimationFrame(pending);pending=null}
    if(pendingTimer){clearTimeout(pendingTimer);pendingTimer=null}
  }
  /* First-delta watchdog: if no text chunk arrives within 45s, surface an
     error so the user isn't left looking at an empty assistant bubble. */
  var FIRST_DELTA_TIMEOUT_MS=45000;
  var firstDelta=true;
  var firstDeltaTimer=setTimeout(function(){
    if(finished||firstDelta===false)return;
    finished=true;
    cancelScheduled();
    body.innerHTML=
      '<div class="msg-error">'+
        '<span class="msg-error-text">Response timed out</span>'+
      '</div>';
  },FIRST_DELTA_TIMEOUT_MS);
  function doRender(){
    pending=null;
    if(finished)return;
    lastRenderAt=performance.now();
    var sc=list||scrollContainer();
    var wasPinned=!!sc&&(!window.state||!window.state._userScrolledAway)&&
      sc.scrollHeight-sc.scrollTop-sc.clientHeight<=96;
    try{
      var parts=splitStreamingMarkdown(full);
      if(parts.prefix){
        if(parts.prefix!==settledText){
          settled.innerHTML=formatMsgProgressive(parts.prefix);
          settledText=parts.prefix;
        }
        live.innerHTML=parts.tail?formatMsgProgressive(parts.tail):"";
      }else{
        if(settledText!==null){settled.innerHTML="";settledText=null}
        live.innerHTML=formatMsgProgressive(full);
      }
      try{processPendingViz()}catch(_){}
      try{processPendingVizActions()}catch(_){}
    }catch {
      live.innerHTML='<p>'+esc(full)+'</p>';
    }
    /* P_scroll-race — re-check user intent in case a passive wheel/touch
       event moved the viewport between the wasPinned measurement and now. */
    if(wasPinned&&sc&&(!window.state||!window.state._userScrolledAway)){
      sc.scrollTop=sc.scrollHeight;
    }
  }
  function schedule(){
    if(pending||pendingTimer||finished)return;
    var wait=Math.max(0,getStreamRenderInterval(full.length)-(performance.now()-lastRenderAt));
    if(wait<=1){pending=requestAnimationFrame(doRender);return}
    pendingTimer=setTimeout(function(){
      pendingTimer=null;
      if(!finished)pending=requestAnimationFrame(doRender);
    },wait);
  }
  return {
    append:function(delta){
      if(finished)return;
      if(firstDelta){
        firstDelta=false;
        clearTimeout(firstDeltaTimer);
      }
      full+=delta||"";
      schedule();
    },
    finalize:function(){
      if(finished)return;
      finished=true;
      clearTimeout(firstDeltaTimer);
      cancelScheduled();
      var sc=list||scrollContainer();
      var wasPinned=!!sc&&(!window.state||!window.state._userScrolledAway)&&
        sc.scrollHeight-sc.scrollTop-sc.clientHeight<=96;
      try{body.innerHTML=formatMsg(full)}catch(_){body.innerHTML='<p>'+esc(full)+'</p>'}
      body.classList.remove("stream-content");
      if(typeof hljs!=="undefined"){
        body.querySelectorAll("pre code").forEach(function(c){
          try{hljs.highlightElement(c)}catch(_){}
        });
      }
      try{processPendingMermaid()}catch(_){}
      try{processPendingViz()}catch(_){}
      try{processPendingVizActions()}catch(_){}
      /* P_scroll-race — re-check user intent after the heavy DOM
         updates (formatMsg, hljs, Mermaid, viz) above. A passive
         wheel/touch event may have scrolled the viewport since the
         wasPinned measurement. */
      if(wasPinned&&sc&&(!window.state||!window.state._userScrolledAway)){
        sc.scrollTop=sc.scrollHeight;
      }
    }
  };
}

/* End a run with a small status footer chip ("Done · 4 steps · 12.4s"). */
export function appendRunFooter(steps,usedTools,durationMs,status){
  var list=document.getElementById("msgList");
  if(!list)return;
  var last=list.lastElementChild;
  if(!last||!last.classList.contains("assistant"))return;
  var body=last.querySelector(".msg-body");
  if(!body)return;
  var chip=document.createElement("div");
  chip.className="agent-run-footer "+(status||"done");
  var s=durationMs>0?(durationMs/1000).toFixed(1)+"s":steps+" steps";
  var tools=(usedTools&&usedTools.length)?" \u00B7 "+usedTools.join(", "):"";
  chip.textContent=(status==="error"?"Error":(status==="stopped"?"Stopped":"Done"))+" \u00B7 "+steps+" steps \u00B7 "+s+tools;
  body.appendChild(chip);
  if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
}
