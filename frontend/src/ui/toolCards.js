/* ui/toolCards.js — extracted from main.js (Tool-Calling UI Helpers).
 * Renders collapsible tool-call cards inside assistant bubbles.
 *
 * Exports: TOOL_META, toolFormatInput, appendToolModule,
 *          setLastToolOutput, makeArtifactError, appendInlineArtifact
 *
 * Reads from window.*: esc, t, hljs, scrollMainToBottom
 */

import { esc } from '../render/helpers.js';
import { sanitizeUrl } from '../util/safe.js';

/* ============================================================
   TOOL-CALLING UI HELPERS
   The live chat's /api/chat/stream route emits `event: tool_use` /
   `tool_progress` / `tool_result` / `execution_start` frames when
   the model decides to call the code_interpreter tool. These
   helpers render the resulting card in the last assistant bubble
   and stream live stdout/stderr into it. Reusable for any future
   tool the route registers with the upstream provider.
   ============================================================ */

export var TOOL_META={
  Read:    {letter:"R", cls:"read",    label:"Read",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2v12l6-3 6 3V2l-6 3L2 2z"/></svg>'},
  Write:   {letter:"W", cls:"write",   label:"Write",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3M5 11l-3.5 4 4-3.5M11.5 1.5L4 9l-1 3 3-1 7.5-7.5a2 2 0 0 0-2-2z"/></svg>'},
  Edit:    {letter:"E", cls:"edit",    label:"Edit",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5a2 2 0 0 0-2.8 0l-9 9L1 15l3.5-1.7 9-9a2 2 0 0 0 0-2.8z"/><path d="M10.5 4.5l3 3"/></svg>'},
  Glob:    {letter:"G", cls:"glob",    label:"Find",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5h13l-1.5 8H3z"/><path d="M3.5 5V2h4l2 3"/></svg>'},
  Grep:    {letter:"F", cls:"grep",    label:"Search",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="5"/><path d="M10.3 10.3l4.2 4.2"/></svg>'},
  Bash:    {letter:"$", cls:"bash",    label:"Bash",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4l5 4-5 4"/><path d="M10 12h4"/></svg>'},
  WebFetch:{letter:"\u2197", cls:"webfetch",label:"Fetch",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M2 8h12"/><path d="M8 1.5a11 11 0 0 1 0 13 11 11 0 0 1 0-13z"/></svg>'},
  Code:    {letter:"\u03BB", cls:"code",    label:"Python",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4L2 8l4 4"/><path d="M10 4l4 4-4 4"/></svg>'},
  web_search:{letter:"W", cls:"websearch",label:"Web Search",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3.5 3.5"/><path d="M7 2.5a6 6 0 0 1 0 9"/><path d="M2.5 7h9"/></svg>'},
  code_interpreter:{letter:"C", cls:"codeint",label:"Code",
    svg:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l6 4-6 4z"/><path d="M2 3v10"/><path d="M14 3v10"/></svg>'},
};

export function toolFormatInput(name,inp){
  if(!inp||typeof inp!=="object")return"";
  if(name==="Read")    return inp.path+(inp.limit?("  lines "+(inp.offset||0)+"\u2013"+(inp.offset+inp.limit)):"");
  if(name==="Write")   return inp.path+"  ("+((inp.content||"").length)+" bytes)";
  if(name==="Edit")    return inp.path+(inp.allOccurrences?"  (all occurrences)":"");
  if(name==="Glob")    return inp.pattern;
  if(name==="Grep")    return (inp.path||"workspace")+"  /  "+inp.pattern;
  if(name==="Bash")    return inp.command;
  if(name==="WebFetch")return inp.url;
  if(name==="Code")    return (inp.language||"python")+"  \u00B7  "+((inp.code||"").split("\n")[0]||"").slice(0,80);
  if(name==="web_search")return inp.query||"";
  if(name==="code_interpreter")return inp.code?(inp.language||"python")+"  \u00B7  "+((inp.code||"").split("\n")[0]||"").slice(0,80):"";
  return JSON.stringify(inp).slice(0,200);
}

/* Append a "tool module" to the target assistant bubble. Layout:
   [icon][name: input]  \u25BC  (collapsible output).
   - body (optional): explicit .msg-body to append into. The chat
     streaming controller passes the current bubble's body. Falls
     back to the last assistant bubble in msgList when omitted. */
export function appendToolModule(toolName,toolInput,body){
  if(!body){
    var list=document.getElementById("msgList");
    if(!list)return null;
    var last=list.lastElementChild;
    if(last&&last.classList.contains("assistant")){
      body=last.querySelector(".msg-body");
    }
  }
  if(!body){
    var list2=document.getElementById("msgList");
    var div=document.createElement("div");
    div.className="msg assistant";
    body=document.createElement("div");
    body.className="msg-body";
    div.appendChild(body);
    list2.appendChild(div);
  }
  var meta=TOOL_META[toolName]||{letter:"?",cls:"",label:toolName};

  /* Card. */
  var card=document.createElement("div");
  card.className="agent-tool-card "+meta.cls;
  card.innerHTML=
    '<div class="agent-tool-head">'+
      '<span class="agent-tool-icon"></span>'+
      '<span class="agent-tool-name"></span>'+
      '<span class="agent-tool-input"></span>'+
      '<span class="agent-tool-chev">\u25BE</span>'+
    '</div>'+
    '<div class="agent-tool-code-wrap"><pre class="agent-tool-code" style="display:none"><code></code></pre></div>'+
    '<div class="agent-tool-out"></div>';
  card.querySelector(".agent-tool-icon").innerHTML=meta.svg||meta.letter;
  card.querySelector(".agent-tool-name").textContent=meta.label;
  card.querySelector(".agent-tool-input").textContent=toolFormatInput(toolName,toolInput);
  /* Insert the tool's source code/command between head and output
     when we have it. code_interpreter / Code share the python
     source (toolInput.code). Bash has toolInput.command. WebFetch
     shows the URL on its own line. Other tools (Grep, Glob, \u2026)
     don't carry a meaningful source body, so we leave the code
     block hidden and the input line in the head is enough. */
  var codeEl=card.querySelector('.agent-tool-code');
  var codeWrap=card.querySelector('.agent-tool-code-wrap');
  var srcBody=null;
  var srcLang='';
  if(toolName==='code_interpreter'||toolName==='Code'){
    srcBody=(toolInput&&toolInput.code)||'';
    srcLang=(toolInput&&toolInput.language)||'python';
  }else if(toolName==='Bash'){
    srcBody=(toolInput&&toolInput.command)||'';
    srcLang='bash';
  }else if(toolName==='WebFetch'||toolName==='web_fetch'){
    srcBody=(toolInput&&toolInput.url)||'';
    srcLang='';
  }
  if(srcBody){
    var codeInner=codeEl.querySelector('code');
    if(srcLang)codeInner.className='language-'+srcLang;
    codeEl.style.display='';
    /* P3_code-stream — typewriter animation: reveal the code line-by-line. */
    var lines=srcBody.split('\n');
    if(lines.length<=4||srcBody.length<100){
      codeInner.textContent=srcBody;
      if(typeof hljs!=='undefined'){
        try{hljs.highlightElement(codeInner);codeInner.dataset.hljsDone='1'}catch(_){}
      }
    }else{
      codeWrap.classList.add('agent-tool-code-streaming');
      var lineIdx=0;
      var displayed='';
      function typeNextLine(){
        if(lineIdx>=lines.length){
          codeWrap.classList.remove('agent-tool-code-streaming');
          codeInner.textContent=srcBody;
          if(typeof hljs!=='undefined'){
            try{hljs.highlightElement(codeInner);codeInner.dataset.hljsDone='1'}catch(_){}
          }
          return;
        }
        displayed+=(lineIdx>0?'\n':'')+lines[lineIdx];
        lineIdx++;
        codeInner.textContent=displayed;
        codeEl.scrollTop=codeEl.scrollHeight;
        var delay=lines.length>20?15:30;
        setTimeout(typeNextLine,delay);
      }
      typeNextLine();
    }
  }else{
    codeWrap.parentNode.removeChild(codeWrap);
  }
  var head=card.querySelector(".agent-tool-head");
  function toggleCard(){
    var open=card.classList.toggle("open");
    head.setAttribute('aria-expanded',open?'true':'false');
  }
  head.setAttribute('role','button');
  head.setAttribute('tabindex','0');
  head.setAttribute('aria-expanded','false');
  head.addEventListener("click",toggleCard);
  head.addEventListener('keydown',function(event){
    if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCard();}
  });
  body.appendChild(card);
  if(typeof window.scrollMainToBottom==='function')window.scrollMainToBottom();
  return card.querySelector(".agent-tool-out");
}

/* Update the most recently appended tool card's output.
   When outEl is provided, write directly to it (avoids the
   fragile last-card selector). */
export function setLastToolOutput(text,isError,outEl){
  var out=outEl||null;
  if(!out){
    var list=document.getElementById("msgList");
    if(!list)return;
    out=list.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  }
  if(!out)return;
  out.textContent=text||"";
  if(isError)out.classList.add("error");else out.classList.remove("error");
  if(text&&text.length>200){
    var card=out.parentElement;
    if(card)card.classList.add("open");
  }
}

/* Build search result nodes directly so untrusted provider payloads cannot
 * escape into card markup. A result card opens with a real, usable list. */
export function renderWebSearchResults(out,results){
  if(!out||!Array.isArray(results)||!results.length)return false;
  var wrap=document.createElement('div');
  wrap.className='web-search-results';
  for(var i=0;i<results.length;i++){
    var source=results[i]||{};
    var item=document.createElement('article');
    item.className='wsr-item';
    var url=sanitizeUrl(String(source.url||''));
    var title=document.createElement('a');
    title.className='wsr-title';
    title.href=url;
    title.target='_blank';
    title.rel='noopener noreferrer';
    title.textContent=source.title||source.url||'Untitled result';
    item.appendChild(title);
    if(source.url){
      var meta=document.createElement('div');
      meta.className='wsr-url';
      meta.textContent=source.url;
      if(source.date){
        var date=document.createElement('span');
        date.className='wsr-date';
        date.textContent=source.date;
        meta.appendChild(date);
      }
      item.appendChild(meta);
    }
    if(source.snippet){
      var snippet=document.createElement('div');
      snippet.className='wsr-snippet';
      snippet.textContent=source.snippet;
      item.appendChild(snippet);
    }
    wrap.appendChild(item);
  }
  out.replaceChildren(wrap);
  return true;
}

/* Build the diagnostic placeholder shown when an inline artifact
   fails to load. */
export function makeArtifactError(fileId,mimeType,url,reason){
  var box=document.createElement("div");
  box.className="artifact-error";
  box.innerHTML=
    '<svg class="artifact-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
      '<rect x="3" y="3" width="18" height="18" rx="2"/>'+
      '<circle cx="9" cy="9" r="2"/>'+
      '<path d="m21 15-5-5L5 21"/>'+
    '</svg>'+
    '<span class="artifact-error-text">Could not load '+esc(mimeType||'file')+' \u00B7 '+esc(fileId)+''+(reason?' ('+esc(reason)+')':'')+'</span>'+
    '<button type="button" class="artifact-error-retry">Retry</button>';
  box.querySelector('.artifact-error-retry').addEventListener('click',function(){
    var fresh=document.createElement('img');
    fresh.src=url+(url.indexOf('?')>=0?'&':'?')+'_='+Date.now();
    fresh.alt="execution artifact";
    fresh.className="exec-artifact-image";
    fresh.addEventListener('error',function(){fresh.replaceWith(makeArtifactError(fileId,mimeType,url,'load failed'))});
    if(box.parentNode)box.parentNode.replaceChild(fresh,box);
  });
  return box;
}

/* Append an inline artifact (matplotlib PNG, CSV download link, etc.)
   produced by the code interpreter to the last tool card's output. */
export function appendInlineArtifact(fileId,mimeType,outEl){
  var t=window.t||function(k){return k};
  var out=outEl||document.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  if(!out||!fileId)return;
  var url="/api/files/"+encodeURIComponent(fileId)+"/raw";
  if((mimeType||"").indexOf("image/")===0){
    var skeleton=document.createElement("div");
    skeleton.className="exec-artifact-skeleton";
    skeleton.innerHTML='<span class="exec-artifact-skeleton-pulse"></span>';
    out.appendChild(skeleton);
    var img=document.createElement("img");
    img.src=url+(url.indexOf('?')>=0?'&':'?')+'_t='+Date.now();
    img.alt="execution artifact";
    img.className="exec-artifact-image";
    /* Results are shown immediately after an execution completes. Lazy
       loading can indefinitely defer images nested in a collapsed <details>
       card, leaving a permanent skeleton in Chromium and Safari. */
    img.loading="eager";
    img.addEventListener('load',function(){
      if(skeleton.parentNode)skeleton.parentNode.removeChild(skeleton);
      img.style.display='';
    });
    img.addEventListener('error',function(){
      try{
        if(skeleton.parentNode)skeleton.parentNode.removeChild(skeleton);
        if(img.parentNode)img.parentNode.replaceChild(makeArtifactError(fileId,mimeType,url,'load failed'),img);
      }catch(_){}
    });
    img.style.display='none';
    out.appendChild(img);
    var card=out.closest(".agent-tool-card");
    if(card)card.classList.add("open");
  }else{
    var a=document.createElement("a");
    a.href=url;
    a.textContent=t("common.downloadFile").replace("{type}",mimeType||"file");
    a.target="_blank";
    a.rel="noopener";
    a.className="exec-artifact-link";
    if(typeof fetch==='function'){
      try{
        fetch(url,{method:'HEAD',credentials:'same-origin'}).then(function(r){
          if(!r.ok&&a.parentNode){
            a.parentNode.replaceChild(makeArtifactError(fileId,mimeType,url,'HTTP '+r.status),a);
          }
        }).catch(function(){});
      }catch(_){}
    }
    out.appendChild(a);
  }
}
