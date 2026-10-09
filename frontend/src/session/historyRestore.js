/* Restore persisted session messages and their local recovery paths.
 * These helpers own the boundary between saved session data, the transcript
 * store, and browser-local history. */
import { stateStore } from '../state/store.js';
import { buildUserContentParts } from '../chat/history.js';
import { quietTurn } from '../chat/turnUi.js';
import { apiFetch } from '../util/api.js';
import { loadLocalMemory, _memKey } from '../storage/localMemory.js';
import { batchSetItem } from '../batchStorage.js';
import { formatMsg } from '../render/markdown.js';
import { esc } from '../render/helpers.js';
import { buildAssistantHtml } from '../render/assistantHtml.ts';
import { generateId } from '../util/ids.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { showToast } from '../ui/toast.js';
import { reportSwallow } from '../util/reportSwallow.ts';

function _t(key) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'session/historyRestore._t'); }
  return key;
}

/* Translate one persisted API row into the transcript shape consumed by the
   React-owned message list. */
export function restoreSessionMessage(m){
  /* Keep the stable clientId for DOM/state and retain the database UUID
     separately. Replacing clientId with m.id makes the next save insert a
     duplicate row and causes message actions to lose their client identity. */
  var clientId = m.clientId || m.id || ("loaded-"+generateId());
  var html = "";
  if (m.role === "assistant" && m.rawText) {
    /* Rebuild assistant markup from the canonical source, never from the
       stored snapshot. This lets current renderers restore old conversations. */
    html = m.html || "";
    if(!html){
      try { html = buildAssistantHtml(m.rawText); }
      catch (_) { html = formatMsg(m.rawText); }
    }
  } else {
    html = m.html || (m.rawText ? formatMsg(m.rawText) : "");
  }
  if (typeof html === "string" && html.indexOf("think-block") !== -1) {
    html = html.replace(/<details class="think-block[\s\S]*?<\/details>/gi, "");
  }
  return {
    clientId: clientId,
    serverId: m.id || null,
    role: m.role,
    rawText: m.rawText || "",
    html: html,
    type: m.type || null,
    restoredFromHistory: true,
    /* The API uses the camelCase schema key. Keep the snake_case fallback
       for any legacy payloads. */
    reasoningContent: m.reasoningContent || m.reasoning_content || null,
    /* P_turn-summary — carry the persisted retrospective so the Summary
       sheet reads the same after a reload as it did live. */
    summary: m.summary || null,
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls.map(function(tc){
      return {
        id: String(tc.id || ''),
        name: String(tc.name || ''),
        input: tc.input == null ? null : tc.input,
        output: tc.output == null ? null : tc.output,
        isError: tc.isError === true,
        artifacts: Array.isArray(tc.artifacts) ? tc.artifacts.map(function(a){
          return { id: String(a.id || ''), mimeType: a.mimeType || null, name: a.name || null };
        }) : [],
        results: Array.isArray(tc.results) ? tc.results.slice(0, 20) : [],
        /* Preserve the split offset and versioned visualization spec so
           inline tool layout survives a reload. */
        textOffset: typeof tc.textOffset === "number" ? tc.textOffset : undefined,
        visualization: (tc.visualization && tc.visualization.version === 1) ? tc.visualization : undefined,
        /* Keep the normalized output list when present. The renderer
           validates entries and can fall back to legacy output fields. */
        outputs: Array.isArray(tc.outputs) ? tc.outputs : undefined,
        /* Terminal fields drive the restored tool row's state and error UI. */
        status: tc.status == null ? null : String(tc.status),
        durationMs: typeof tc.durationMs === "number" ? tc.durationMs : undefined,
        error: tc.error == null ? null : tc.error,
        errorCode: tc.errorCode == null ? null : tc.errorCode,
        retryable: typeof tc.retryable === "boolean" ? tc.retryable : undefined,
        userMessage: tc.userMessage == null ? undefined : tc.userMessage,
        stderr: tc.stderr == null ? undefined : tc.stderr,
        detail: tc.detail == null ? undefined : tc.detail,
      };
    }) : [],
    actions: null
  };
}

/* The server save can lag behind a refresh. Restore assistant messages that
   were already mirrored locally but have not reached the session response. */
export function restoreLocalAssistantFallback(session){
  try{
    var localRecord=loadLocalMemory(session.id);
    var serverMessages=Array.isArray(session.messages)?session.messages:[];
    if(!localRecord||!Array.isArray(localRecord.messages)||localRecord.messages.length<=serverMessages.length)return;
    var extras=localRecord.messages.slice(serverMessages.length);
    for(var i=0;i<extras.length;i++){
      var message=extras[i];
      if(!message||!message.content||message.role!=="assistant")continue;
      stateStore.dispatch({type:"session/append-message",payload:{
        clientId:"local-recovered-"+generateId(),
        role:"assistant",
        rawText:message.content,
        html:buildAssistantHtml(message.content),
        type:"assistant",
        reasoningContent:null,
        attachments:[],
        toolCalls:[],
        actions:null
      }});
    }
    publishReactChatRuntime({ type: "state-synced", reason: "local-recovered-react" });
  }catch (error) { reportSwallow(error, 'session/historyRestore.restoreLocalAssistantFallback'); }
}

/* Show server-persisted partial output after a refresh and attach its retry
   action to the React-owned message list. */
export function restoreInterruptedResponse(session, msgList){
  if(!session.streamingText)return;
  var partialText=session.streamingText||"(partial content)";
  var partialRendered;
  try{partialRendered=formatMsg(partialText)}catch(_){partialRendered="<p>"+esc(partialText)+"</p>"}
  var partialHtml='<div class="msg-content">'+partialRendered+'</div>'+
    '<div class="msg-error" style="margin-top:8px">'+
      '<span class="msg-error-text">(response interrupted — tap Retry to continue)</span>'+
      '<button type="button" class="msg-retry-btn stream-retry-btn" data-stream-retry>Retry</button>'+
    '</div>';
  var partialClientId="stream-recovered-"+Date.now();
  var partialIdx=stateStore.dispatch({type:"session/append-message",payload:{
    role:"assistant",
    clientId:partialClientId,
    rawText:partialText,
    html:partialHtml,
    type:"assistant",
  }});
  var retryDelegated=function(ev){
    var target=ev.target;
    if(!(target && target.matches && target.matches("[data-stream-retry]")))return;
    msgList.removeEventListener("click",retryDelegated);
    stateStore.dispatch({
      type:"session/remove-message-at",index:partialIdx,clientId:partialClientId
    });
    apiFetch("/api/sessions/"+encodeURIComponent(session.id),{
      method:"PATCH",
      body:{streamingText:null,streamingReasoning:null},
    }).catch(function(){});
    var lastUserEntry=null;
    var lastUserMessage=null;
    var messages=stateStore.read("messages");
    for(var i=messages.length-1;i>=0;i--){
      if(messages[i]&&messages[i].role==="user"){
        lastUserEntry=messages[i];
        lastUserMessage=lastUserEntry.rawText||lastUserEntry.content;
        break;
      }
    }
    if(lastUserMessage&&typeof window.askChatTurn==="function"){
      /* askChatTurn slices this user turn out of history; carry multimodal
         parts explicitly so retry preserves its attachments. */
      var lastUserParts=null;
      try{lastUserParts=buildUserContentParts(lastUserMessage,lastUserEntry&&lastUserEntry.attachments);}catch(_){lastUserParts=null;}
      quietTurn(window.askChatTurn(lastUserMessage,lastUserParts));
    }else{
      showToast(_t("toast.noRetryTarget"));
    }
  };
  msgList.addEventListener("click",retryDelegated);
  /* Avoid showing the same server-side partial message on the next reload. */
  apiFetch("/api/sessions/"+encodeURIComponent(session.id),{
    method:"PATCH",
    body:{streamingText:null,streamingReasoning:null},
  }).catch(function(){});
}

/* Build the local fast-path history from server rows only when no local copy
   exists, and defer the work until the browser is idle. */
export function mirrorSessionHistory(session){
  if(loadLocalMemory(session.id))return;
  var sync=function(){
    try{
      var record={topic:session.topic||"",ts:Date.now(),messages:[]};
      (session.messages||[]).forEach(function(message){
        var text="";
        if(message.rawText){
          text=message.rawText;
        }else if(message.html){
          text=message.html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
        }
        text=text.replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
        if(!text)return;
        record.messages.push({role:message.role,content:text});
      });
      if(record.messages.length)batchSetItem(_memKey(session.id),JSON.stringify(record));
    }catch (error) { /* mirror failed */ reportSwallow(error, 'session/historyRestore.mirrorSessionHistory'); }
  };
  if(typeof requestIdleCallback==="function"){
    requestIdleCallback(sync,{timeout:2000});
  }else{
    setTimeout(sync,100);
  }
}
