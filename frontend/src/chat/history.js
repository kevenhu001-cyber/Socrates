import { loadLocalMemory } from '../storage/localMemory.js';

function getState() { return window.state; }

var HISTORY_MAX_TURNS=30;      /* user+assistant pairs to keep (increased for longer context) */
var HISTORY_MAX_CHARS=2000;    /* per-message truncation ceiling (increased from 500) */

/* Compress a list of message texts into a short summary for when
   the conversation is longer than HISTORY_MAX_TURNS. Drops oldest
   messages but captures their key topics in a condensed form. */
function compressMessages(msgs){
  if(!msgs||!msgs.length)return"";
  var parts=[];
  for(var ci=0;ci<msgs.length;ci++){
    var ct=String(msgs[ci].rawText||msgs[ci].content||"").trim();
    if(!ct)continue;
    /* Take first 120 chars of each older message as a keyphrase. */
    if(ct.length>120)ct=ct.slice(0,117)+"…";
    parts.push(ct);
  }
  if(!parts.length)return"";
  return"[Earlier conversation: "+parts.join(" | ")+"]";
}

/* P0.1 BUG-P01-03 — rebuild a multimodal content parts array from a
   user message's stored attachments so an edit-and-resend (or a
   regenerate) carries the original image / PDF / text to the model
   instead of degrading to plain text. Mirrors the reconstruction inside
   extractHistory() below. Returns the parts array when the message has
   usable multimodal attachments, or null when it's text-only (callers
   then send the plain string). Unlike the history path this does NOT
   truncate — it is the CURRENT turn's content, not compressed context. */
export function buildUserContentParts(rawText, attachments){
  if(!Array.isArray(attachments)||!attachments.length)return null;
  var hasMultimodal=attachments.some(function(att){return att&&((att.kind==="image"&&att.dataUrl)||((att.kind==="text"||att.kind==="pdf")&&att.text));});
  if(!hasMultimodal)return null;
  var txt=String(rawText||"").trim();
  var parts=[];
  if(txt)parts.push({type:"text",text:txt});
  for(var ai=0;ai<attachments.length;ai++){
    var att=attachments[ai];
    if(!att)continue;
    if(att.kind==="image"&&att.dataUrl){
      parts.push({type:"image_url",image_url:{url:att.dataUrl,detail:"auto"}});
    }else if(att.kind==="text"&&att.text){
      parts.push({type:"text",text:"[Parsed file: "+(att.name||"file")+"]\n"+att.text});
    }else if(att.kind==="pdf"&&att.text){
      parts.push({type:"text",text:"[Parsed PDF: "+(att.name||"document")+"]\n"+att.text});
    }
  }
  return parts.length?parts:null;
}

export function extractHistory(){
  /* P1.1 — three-tier source-of-truth, preferred in order:
     1. getState().messages.rawText (authoritative, in-memory, never
       re-rendered, never has half-streamed text)
     2. localStorage mirror (good for cross-tab / post-reload)
     3. live DOM (legacy fallback — only used when neither 1 nor 2
       is available, e.g. a session that was loaded from the server
       but the in-memory list hasn't been hydrated yet) */
  if(Array.isArray(getState().messages)&&getState().messages.length){
    var maxTurns=HISTORY_MAX_TURNS*2;
    var tooMany=getState().messages.length>maxTurns;
    var summary=null;
    if(tooMany){
      /* Compress the overflow messages into a summary prefix. */
      var overflow=getState().messages.slice(0,getState().messages.length-maxTurns);
      summary=compressMessages(overflow);
    }
    var out=[];
    if(summary){
      out.push({role:"system",content:"[Conversation summary of earlier messages]: "+summary});
    }
    for(var i=Math.max(0,getState().messages.length-maxTurns);i<getState().messages.length;i++){
      var m=getState().messages[i];
      if(!m||!m.rawText)continue;
      var txt=String(m.rawText).replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
      /* P_regen-empty-stream — strip embedded <think>…</think> blocks
       * from assistant messages before sending them back to the model.
       * MiniMax M3 (and other reasoning models) sometimes emit a
       * `<think>…</think>` block inline in their content text instead
       * of (or in addition to) a separate reasoning_content channel.
       * When that raw text is sent back as assistant context on a
       * later turn (regenerate, edit-and-resend, or a long
       * conversation), the model sometimes interprets the trailing
       * </think> as "thinking complete, return [DONE]" and emits
       * zero content deltas — which the client surfaces as
       * "No response: empty stream". The reasoning content is
       * preserved separately in m.reasoningContent and re-sent as a
       * dedicated reasoning_content field below, so stripping the
       * inline copy is loss-free for the model context. */
      if(m.role==="assistant"||m.role==="system"){
        txt=txt.replace(/<think>[\s\S]*?<\/think>/g,"").replace(/<\/?think>/g,"").trim();
      }
      if(!txt&&!(m.role==="user"&&Array.isArray(m.attachments)&&m.attachments.length))continue;
      /* P_attachments-extractHistory — for user messages with stored
       * image/text/PDF attachments, reconstruct a proper multimodal
       * content parts array so the LLM receives the actual image data
       * (not just the rawText string) on every turn. Without this, the
       * image is only sent on the first turn (via _pendingChatContent)
       * and subsequent history turns degrade to text-only. */
      var content;
      if(m.role==="user" && Array.isArray(m.attachments) && m.attachments.length){
        var hasMultimodal=m.attachments.some(function(att){return att&&((att.kind==="image"&&att.dataUrl)||((att.kind==="text"||att.kind==="pdf")&&att.text));});
        if(hasMultimodal){
          var parts=[];
          if(txt)parts.push({type:"text",text:txt.length>HISTORY_MAX_CHARS?txt.slice(0,HISTORY_MAX_CHARS)+"…":txt});
          for(var ai=0;ai<m.attachments.length;ai++){
            var att=m.attachments[ai];
            if(!att)continue;
            if(att.kind==="image"&&att.dataUrl){
              parts.push({type:"image_url",image_url:{url:att.dataUrl,detail:"auto"}});
            }else if(att.kind==="text"&&att.text){
              var attTxt=att.text.length>HISTORY_MAX_CHARS?att.text.slice(0,HISTORY_MAX_CHARS)+"…":att.text;
              parts.push({type:"text",text:"[Parsed file: "+att.name+"]\n"+attTxt});
            }else if(att.kind==="pdf"&&att.text){
              var pdfTxt=att.text.length>HISTORY_MAX_CHARS?att.text.slice(0,HISTORY_MAX_CHARS)+"…":att.text;
              parts.push({type:"text",text:"[Parsed PDF: "+att.name+"]\n"+pdfTxt});
            }
          }
          content=parts;
        }else{
          if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
          content=txt;
        }
      }else{
        if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
        content=txt;
      }
      var msg={role:m.role==="user"?"user":"assistant",content:content};
      if(m.reasoningContent){
        msg.reasoning_content=m.reasoningContent;
      }
      out.push(msg);
    }
    if(out.length) return out;
  }
  /* P_context-race — if currentSessionId is null (state was reset
     but no session loaded yet), skip the localStorage fallback.
     _memKey(null) resolves to "socrates-memory-default" which is a
     shared key that may contain stale messages from a previous
     session — reading it would inject wrong history into the LLM
     context ("会话串台"). */
  var sid=getState().currentSessionId;
  if(!sid)return[];
  var rec=loadLocalMemory(sid);
  if(rec&&rec.messages&&rec.messages.length){
    var maxTurns=HISTORY_MAX_TURNS*2;
    var tooMany=rec.messages.length>maxTurns;
    var summary=null;
    if(tooMany){
      var overflow=rec.messages.slice(0,rec.messages.length-maxTurns);
      summary=compressMessages(overflow);
    }
    var out=[];
    if(summary){
      out.push({role:"system",content:"[Conversation summary of earlier messages]: "+summary});
    }
    for(var ri=Math.max(0,rec.messages.length-maxTurns);ri<rec.messages.length;ri++){
      var m=rec.messages[ri];
      if(!m||!m.content)continue;
      var txt=String(m.content).replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
      if(!txt)continue;
      if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
      out.push({role:m.role==="user"?"user":"assistant",content:txt});
    }
    if(out.length) return out;
    /* Fall through to DOM if local cache has nothing usable */
  }
  var list=document.getElementById("msgList");
  if(!list)return[];
  var out=[];
  var children=list.children;
  for(var i=children.length-1;i>=0&&out.length<HISTORY_MAX_TURNS*2;i--){
    var el=children[i];
    if(!el.classList.contains("user")&&!el.classList.contains("assistant"))continue;
    var body=el.querySelector(".msg-body");
    if(!body)continue;
    /* Pull the rendered text and clean it up. */
    var txt=(body.innerText||body.textContent||"").trim();
    if(!txt)continue;
    /* Strip leaked UI affordances that may have been serialised into history. */
    txt=txt.replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
    if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
    out.unshift({role:el.classList.contains("user")?"user":"assistant",content:txt});
  }
  
  return out;
}
