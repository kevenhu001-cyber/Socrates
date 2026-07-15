/* ui/thinkingPill.js — extracted from main.js (Thinking Pill).
 * Renders the collapsible "Thinking…" / "Thought" pill inside
 * assistant bubbles during streaming.
 *
 * Exports: looksLikeMetaInstruction, appendThinking
 *
 * Reads from window.*: t, hljs, scrollMainToBottom
 */

import { esc } from '../render/helpers.js';
import { formatMsg } from '../render/markdown.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from '../render/viz.js';

/* Phrases the model tends to echo verbatim from the system prompt's
   "thinking off" / "thinking on" suffixes. If a streamed thinking
   buffer contains any of these it has almost certainly drifted into
   self-restraint meta-text, which is not useful to the user and is
   the bug we are trying to prevent. Matched case-insensitively
   against short phrases (3+ words) so a single passing word like
   "reply" never trips the filter. */
export function looksLikeMetaInstruction(s){
  if(!s)return false;
  var t=s.toLowerCase();
  var phrases=[
    /* the OLD "thinking off" suffix (kept so historical build outputs
       still get filtered) */
    "do not output", "reply directly with", "in clean prose",
    "do not narrate your thought process", "narrate your thought process",
    "chain-of-thought", "internal reasoning",
    /* the NEW "thinking off" suffix (must also be filtered — even
       though we just rewrote it, the model may still echo it) */
    "step-by-step scratch work", "exposing step-by-step",
    "keep your reply focused on the final answer",
    /* the "thinking on" suffix (less common but possible) */
    "rendered as a collapsible section",
  ];
  for(var i=0;i<phrases.length;i++){
    if(t.indexOf(phrases[i])>=0)return true;
  }
  return false;
}

/* Append a small "thinking" pill. The body is rendered through
   formatMsg (marked + KaTeX + highlight.js) so reasoning that
   contains code, math, lists, or links is typeset properly — not
   dumped as raw text. Throttled with rAF so a 1000-token burst
   doesn't fire 1000 innerHTML assignments.

Returns a controller { append(delta), finalize(), remove() } so the
    caller can:
      - append()  more deltas
      - finalize() when the stream signals 'text' (re-render once with cursor)
      - remove()   if thinking should be hidden (e.g. user toggled off mid-run) */
export function appendThinking(text){
  var list=document.getElementById("msgList");
  if(!list)return null;
  var last=list.lastElementChild;
  var body=null;
  if(last&&last.classList.contains("assistant"))body=last.querySelector(".msg-body");
  if(!body){
    var div=document.createElement("div");
    div.className="msg assistant";
    body=document.createElement("div");
    body.className="msg-body";
    div.appendChild(body);
    list.appendChild(div);
  }
  /* Dedupe consecutive thinking: reuse existing think-block if present. */
  var existing=body.lastElementChild;
  var details, thinkContent, buffer, pending;
  function _summarize(streaming){
    var label=streaming
      ?((typeof window.t==="function")?window.t("think.thinking"):"Thinking\u2026")
      :((typeof window.t==="function")?window.t("think.title"):"Thought");
    var icon=streaming
      ?'<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>'
      :'';
    return icon+'<span class="think-summary-label">'+esc(label)+'</span><span class="think-summary-chevron" aria-hidden="true"></span>';
  }
  if(existing&&existing.classList&&existing.classList.contains("think-block")){
    details=existing;
    thinkContent=details.querySelector(".think-content");
    buffer=thinkContent?thinkContent.textContent||"":"";
  }else{
    details=document.createElement("details");
    details.className="think-block think-block-streaming";
    /* P_thinking-collapsed-default — think-block starts collapsed. The
     * summary still shows the live "Thinking…" spinner so the user
     * knows the model is reasoning, but the reasoning content itself
     * is hidden until the user clicks the summary to expand. This
     * matches the "folded by default, expand on demand" convention. */
    details.open=false;
    var sum=document.createElement("summary");
    sum.className="think-summary think-summary-streaming";
    sum.innerHTML=_summarize(true);
    details.appendChild(sum);
    thinkContent=document.createElement("div");
    thinkContent.className="think-content";
    details.appendChild(thinkContent);
    body.appendChild(details);
    buffer="";
    pending=null;
  }
  function doRender(){
    pending=null;
    if(!details.isConnected)return;
    if(buffer){
      try{
        thinkContent.innerHTML=formatMsg(buffer);
        try{processPendingMermaid()}catch(_){}
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
        if(typeof hljs!=="undefined"){
          thinkContent.querySelectorAll("pre code").forEach(function(c){
            if(c.dataset&&c.dataset.hljsDone)return;
            if(/```\s*$/.test(c.textContent||""))return;
            try{hljs.highlightElement(c);c.dataset.hljsDone="1"}catch(_){}
          });
        }
      }catch(e){
        thinkContent.innerHTML='<pre style="white-space:pre-wrap;margin:0">'+esc(buffer)+'</pre>';
      }
    }
    if(typeof window.scrollMainToBottom==="function")window.scrollMainToBottom();
  }
  function schedule(){
    if(pending)return;
    pending=requestAnimationFrame(doRender);
  }
  buffer+=text||"";
  if(looksLikeMetaInstruction(buffer)){
    if(details.parentNode)details.parentNode.removeChild(details);
    buffer="";
  }
  schedule();
  return {
    append:function(delta){
      if(!details.isConnected)return;
      buffer+=delta||"";
      if(looksLikeMetaInstruction(buffer)){
        if(details.parentNode)details.parentNode.removeChild(details);
        buffer="";
        schedule();
        return;
      }
      schedule();
    },
    finalize:function(){
      if(pending){cancelAnimationFrame(pending);pending=null}
      doRender();
      /* P_thinking-collapsed-default — respect the user's expand/collapse
       * choice during streaming. Previously this force-closed the block,
       * which undid any manual click-to-expand the user had done while
       * waiting for the answer. With the collapsed-by-default design,
       * leaving the open state as-is is the right behaviour: a user
       * who expanded during streaming keeps it open after the answer
       * lands; a user who didn't still sees the summary. */
      details.classList.remove("think-block-streaming");
      var sum=details.querySelector("summary");
      if(sum){
        var count=0;
        if(buffer){
          var cjk=(buffer.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g)||[]).length;
          var rest=buffer.replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g," ").trim();
          var words=rest?rest.split(/\s+/).filter(Boolean).length:0;
          count=cjk+words;
        }
        var label=(typeof window.t==="function")?window.t("think.title"):"Thought";
        var meta=count>0?'<span class="think-summary-meta">'+
          (count===1
            ?((typeof window.t==="function")?window.t("think.wordCountOne"):"1 word")
            :(((typeof window.t==="function")?window.t("think.wordCount"):"{n} words").replace("{n}",count)))
          +'</span>':'';
        sum.innerHTML='<span class="think-summary-label">'+esc(label)+'</span>'+
          meta+
          '<span class="think-summary-chevron" aria-hidden="true"></span>';
      }
    },
    remove:function(){
      if(pending){cancelAnimationFrame(pending);pending=null}
      if(details&&details.parentNode)details.parentNode.removeChild(details);
    }
  };
}
