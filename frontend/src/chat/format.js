/* chat/format.js — Wave 0b of main-js-split plan.
 * Three pure-ish chat-formatting helpers extracted from main.js region 13
 * (L3965–L4096). One mutates state (handleChatApiResult) via the global
 * window.state proxy — same wiring as if it lived in main.js.
 */

/* Detect a tool envelope in the model's response. Returns:
      null — not a tool call
      {tool:"web_search", query:"..."} — a real tool call
   We search the FULL response text for any recognizable tool call
   format — the model may embed it in conversation text or wrap it
   in [TOOL_CALL] tags despite the instruction to output it alone. */
function parseToolCall(text){
  if(!text||typeof text!=="string")return null;
  var candidates=[];
  try{
    var trimmed=text.trim();
    var obj=JSON.parse(trimmed);
    if(obj&&obj.tool==="web_search"&&typeof obj.query==="string"&&obj.query.trim())
      return{tool:"web_search",query:obj.query.trim().slice(0,200)};
  }catch(_){}
  var fence=text.match(/```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"web_search"[\s\S]*?\})\s*```/i);
  if(fence){
    try{
      var obj2=JSON.parse(fence[1]);
      if(obj2&&obj2.tool==="web_search"&&typeof obj2.query==="string"&&obj2.query.trim())
        return{tool:"web_search",query:obj2.query.trim().slice(0,200)};
    }catch(_){}
  }
  var tcMatch=text.match(/\[TOOL_CALL\]\s*(\{[\s\S]*?["']tool["']\s*:\s*["']web_search["'][\s\S]*?\})\s*\[\/TOOL_CALL\]/i);
  if(tcMatch){
    try{
      var obj3=JSON.parse(tcMatch[1]);
      if(obj3&&obj3.tool==="web_search"&&typeof obj3.query==="string"&&obj3.query.trim())
        return{tool:"web_search",query:obj3.query.trim().slice(0,200)};
    }catch(_){}
  }
  var bare=text.match(/\{\s*["']tool["']\s*:\s*["']web_search["']\s*,\s*["']query["']\s*:\s*["']([^"']+)["']\s*\}/i);
  if(bare){
    return{tool:"web_search",query:bare[1].slice(0,200)};
  }
  var lenient=text.match(/\{\s*["']?tool["']?\s*:\s*["']?web_search["']?\s*,\s*["']?query["']?\s*:\s*["']?([^"'\}\s][^"'\}]*?)["']?\s*\}/i);
  if(lenient){
    return{tool:"web_search",query:lenient[1].slice(0,200)};
  }
  return null;
}

/* Format the search results into the same [Web research] block the
   system used to inject. Used by the round-2 message. */
function formatSourcesBlock(sources,query){
  function stripEmoji(s){
    if(!s)return s;
    return String(s)
      .replace(/[\u{1F000}-\u{1FAFF}]/gu,"")
      .replace(/[\u{2600}-\u{27BF}]/gu,"")
      .replace(/[\u{2B00}-\u{2BFF}]/gu,"")
      .replace(/[\u{FE00}-\u{FE0F}]/gu,"")
      .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu,"")
      .replace(/[\u{1F900}-\u{1F9FF}]/gu,"")
      .replace(/\u200D/g,"")
      .replace(/\s{2,}/g," ")
      .trim();
  }
  var lines=sources.map(function(x,i){
    var title=stripEmoji(x.title)||x.title;
    var head="["+(i+1)+"] "+title;
    if(x.snippet){var snip=stripEmoji(x.snippet);if(snip)head+=" — "+snip}
    head+=" ( "+x.url+" )";
    if(x.matchedQuery)head+="\n    Source query: \""+x.matchedQuery+"\"";
    if(x.fullContent){
      var fc=stripEmoji(x.fullContent);
      var trimmed=(fc.length>3000)?fc.slice(0,3000)+"…":fc;
      head+="\n    Full text: "+trimmed;
    }else{
      head+="\n    (snippet only — full text unavailable)";
    }
    return head;
  });
  return "[Web research] — query: \""+query+"\". "+
    "Each result below was retrieved live from the web. "+
    "If you use a fact from these results, you MUST cite it inline as [1], [2], etc. "+
    "Do NOT invent facts not supported by the results; if a result is irrelevant, ignore it.\n"+
    lines.join("\n");
}

function handleChatApiResult(result,ctl,userText){
  if(result&&result.cancelled){
    ctl.abort();
    return;
  }
  if(result&&result.text&&typeof result.text==="string"&&result.text.trim()){
    window.state.lastCallSource="api";
    ctl.finish();
  }else{
    /* P_lastError_fallback — when callAPIStream returns null WITHOUT
       setting state.lastCallError (should not happen with the current
       stream.js code, but be defensive), construct a diagnostic message
       so the user sees something actionable rather than the generic
       fallback "stream interrupted before completion". */
    var reason=window.state.lastCallError||"empty response (no error detail)";
    var isCancel=/cancel|user-stop|superseded|new-session|session-switch|session-deleted|session-purged|session-reset|msg-edit/i.test(reason);
    if(isCancel){
      window.state.lastCallSource="cancelled";
      ctl.abort();
    }else if(window.state.lastCallError){
      window.state.lastCallSource="error";
      ctl.replaceWithError(window.state.lastCallError,function(){
        window.askChatTurn&&window.askChatTurn(userText);
      });
    }else{
      window.state.lastCallSource="error";
      ctl.abort();
      /* If the result is falsy but lastCallError is null, the stream
         ended with no content but no specific error was captured. Show
         a diagnostic that logs the full state for debugging. */
      console.warn("[chat] stream returned no result with no error. result=",result,"lastCallError=",window.state.lastCallError);
      window.addMessage&&window.addMessage("assistant","(response interrupted — no content received)");
    }
  }
}

export { parseToolCall, formatSourcesBlock, handleChatApiResult };
