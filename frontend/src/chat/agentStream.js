/* chat/agentStream.js — extracted from main.js (Agent Stream).
 * Stream agent text into a single assistant bubble & render run footer.
 *
 * Exports: beginAgentTextStream, appendRunFooter
 *
 * Reads from window.*: scrollMainToBottom, hljs
 */

import { esc } from '../render/helpers.js';
import { formatMsg } from '../render/markdown.js';
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
  var body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  list.appendChild(div);
  var full="";
  var finished=false;
  var pending=null;
  /* First-delta watchdog: if no text chunk arrives within 45s, surface an
     error so the user isn't left looking at an empty assistant bubble. */
  var FIRST_DELTA_TIMEOUT_MS=45000;
  var firstDelta=true;
  var firstDeltaTimer=setTimeout(function(){
    if(finished||firstDelta===false)return;
    finished=true;
    if(pending){cancelAnimationFrame(pending);pending=null}
    body.innerHTML=
      '<div class="msg-error">'+
        '<span class="msg-error-text">Response timed out</span>'+
      '</div>';
  },FIRST_DELTA_TIMEOUT_MS);
  function doRender(){
    pending=null;
    if(finished)return;
    try{
      body.innerHTML=formatMsg(full);
      if(typeof hljs!=="undefined"){
        body.querySelectorAll("pre code").forEach(function(c){
          if(c.dataset&&c.dataset.hljsDone)return;
          if(/```\s*$/.test(c.textContent||""))return;
          try{hljs.highlightElement(c);c.dataset.hljsDone="1"}catch(_){}
        });
      }
      try{processPendingMermaid()}catch(_){}
      try{processPendingViz()}catch(_){}
      try{processPendingVizActions()}catch(_){}
    }catch(e){
      body.innerHTML='<p>'+esc(full)+'</p>';
    }
    if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  }
  function schedule(){
    if(pending||finished)return;
    pending=requestAnimationFrame(doRender);
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
      if(pending){cancelAnimationFrame(pending);pending=null}
      try{body.innerHTML=formatMsg(full)}catch(_){body.innerHTML='<p>'+esc(full)+'</p>'}
      try{processPendingMermaid()}catch(_){}
      try{processPendingViz()}catch(_){}
      try{processPendingVizActions()}catch(_){}
      if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
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
