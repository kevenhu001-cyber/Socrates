/* chat/turnController.js — extracted from main.js (B3 batch).
 * askChatTurn single-turn controller (history/URL/system-prompt assembly
 * + streaming execution + result handling). Zero-behavior-change lift.
 * Streaming entry and app reset surfaces resolve via window.*.
 */
import { stateStore } from '../state/store.js';
import { turnState } from './turnState.js';
import { quietTurn } from './turnUi.js';
import { hasUsableActive } from '../config/providers.js';
import { extractHistory } from './history.js';
import { callAPIStream } from './stream.js';
import { handleChatApiResult } from './format.js';
import { offlineGuard } from './offline.js';
import {
  appendClientContextMessages,
  beagleSuffix,
  thinkingSuffix,
  toneVoiceSuffix,
} from './promptSuffixes.ts';
import { injectTemplateSystemPrompt } from './templateSystemPrompt.ts';
import { languageDirectiveFor } from './lang.js';
import { CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT } from './systemPrompts.js';
import { extractHttpUrls, fetchPagesForContext, looksLikeUserMentionedSite } from './webLinks.js';
import { renderLinkPreviews, renderNoUrlHint } from '../ui/linkPreviews.js';
import { getReasoningEffort } from '../ui/effortPicker.js';
import { publishThinkingTurnStart } from '../ui/messageSnapshot.js';
import { publishActiveWorkflowEvent, publishActiveWorkflowFinish, publishWorkspaceAgentEvent } from './toolCallbacks.js';
import { clearPendingTurn, createChatTurn, newClientTurnId, savePendingTurn } from './turnClient.ts';
import { addMessage } from './messages.js';
import { saveCurrentSession } from '../session/persistence.js';
import { updateChatStats } from './stats.js';

/* omit entirely; backend passes through (mirrors main.js contract) */
var MAX_TOKENS_CHAT = undefined;

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
}
function _addStreamingMessage(opts) {
  if (typeof window !== 'undefined' && typeof window.addStreamingMessage === 'function') {
    return window.addStreamingMessage(opts);
  }
  throw new Error('addStreamingMessage bridge missing');
}

export async function askChatTurn(userText,pendingOverride){
  publishThinkingTurnStart();
  /* Abort the previous in-flight chat stream, if any. Without this the
     old streamCtl stays in "正在思考…" until its own 45 s timer fires,
     which makes the UI feel frozen when the user fires a follow-up
     while the previous reply is still in flight. */
  if(turnState.activeChatCtl){try{turnState.activeChatCtl.abort()}catch(_){}}
  if(window._activeChatAbort){try{window._activeChatAbort("superseded")}catch(_){}}
  /* Capture this turn before any guard or await. New submit paths pass an
     immutable override; legacy edit/regenerate paths can still use the
     consume-once window bridge. */
  var pendingContent = arguments.length>1 ? pendingOverride : turnState.pendingChatContent;
  try{turnState.pendingChatContent=null;}catch(_){}
  /* No API configured: provide a minimal local echo so the chat panel
     is not dead. Tells the user how to enable a real model. */
  if(!hasUsableActive()){
    var fallback=userText
      ?"You said: \""+userText+"\". I can't actually reply yet because no model is configured — open Settings and add a provider to enable Chat mode."
      :"I'm in Chat mode but no model is configured. Open Settings to add a provider, and I'll be able to talk about \""+stateStore.read("topic")+"\" for real.";
    addMessage("assistant",fallback);
    return;
  }
  /* Offline precheck — surface a clear "you're offline" message instead
     of waiting 120s for the stream to fail. */
  if(offlineGuard()){
    var retryThisTurn=function(){
      quietTurn(askChatTurn(userText,pendingContent));
    };
    var ctlOff=_addStreamingMessage({onRetry:retryThisTurn});
    ctlOff.replaceWithError("You appear to be offline — check your connection and retry.",retryThisTurn);
    return;
  }
  var history=extractHistory();
  /* P_crosstalk-diag — temporary diagnostic for "new session inherits
     old context" bug. Logs the history length, stateStore.read("messages") length,
     current session id, and a short preview of each history entry so
     we can see exactly where the stale context comes from. */
  
  /* The "user" message we feed the model: if the user just opened the
     chat and hasn't typed anything, synthesize a short opener so the
     model has something to greet them with. */
  var userMsg=userText||("Let's talk about "+stateStore.read("topic")+".");
  /* P_attachments — submitChatMessage stores the assembled LLM
   * content (text string OR multimodal parts array) on
   * turnState.pendingChatContent. Prefer it when present so images
   * flow through to vision-capable upstreams. */
  /* AUDIT-R4 — consume-once. Leaving the pending content on window
     after this read meant a later askChatTurn call that didn't set
     it (retry of an OLDER turn, re-explain, recovered-stream retry)
     would silently replay whichever multimodal payload happened to
     be there last. Retry closures below capture the local snapshot
     and restore it before re-entering, so retrying THIS turn still
     carries its own attachments. */
  /* The fallback `userMsg` (synthesized opener) is plain text — if
   * there's no pending content we keep using it. */
  var userContent = (pendingContent !== undefined && pendingContent !== null)
    ? pendingContent
    : userMsg;
  /* If the user's message contains any http(s) URL, fetch each one and
     append the page text to the prompt as a [Referenced page] block.
     This gives the assistant the ability to read links the user
     pastes in — same as agent mode. We cap at 3 URLs to keep the
     prompt sane; each fetch is bounded by 8 s server-side. Failures
     fall back gracefully (just skip the block). */
  var urls=extractHttpUrls(userMsg);
  var pageBlocks=[];
  var pageResults=[];
  if(urls.length){
    try{
      var fetched=await fetchPagesForContext(urls);
      pageBlocks=fetched.blocks||[];
      pageResults=fetched.results||[];
    }catch(_){pageBlocks=[];pageResults=[]}
    /* Surface the URL previews inside the user's bubble so the user
       sees exactly what the model is reading. The most recently
       appended <div class="msg user"> is the bubble for this turn. */
    try{
      var list=document.getElementById("msgList");
      var last=list&&list.lastElementChild;
      if(last&&last.classList.contains("user")){
        renderLinkPreviews(last,urls,pageResults);
      }
    }catch(_){}
  }else if(looksLikeUserMentionedSite(userMsg)){
    /* User talked about a site but we couldn't pull a clean URL. Show
       a small inline reminder card so they know to paste a full URL
       (with https://) on the next turn. The model-side hint below
       makes the assistant ask the same thing in prose. */
    try{
      var list2=document.getElementById("msgList");
      var last2=list2&&list2.lastElementChild;
      if(last2&&last2.classList.contains("user")){
        renderNoUrlHint(last2);
      }
    }catch(_){}
  }
  /* P_lang-directive — inject a strong language directive at the very
   * top of the system message, derived from the user's actual input.
   * Earlier the prompt itself only said "match the user's language",
   * which the model frequently ignored (Chinese input would still get
   * a mostly-English reply). The directive is the FIRST thing the
   * model reads, so it gets priority over the rest of the system
   * prompt and any tendency to default to the prompt's own language. */
  var langDir=languageDirectiveFor(userText||(stateStore.read("topic")||""));
  /* P_chat-prompt-switch — chat-mode prompt is one of two siblings:
   * CHAT_SYSTEM_PROMPT (verbose scholar voice + <think> suffix) or
   * CHAT_CONCISE_PROMPT (direct, no preamble, no thinking block).
   * Deep thinking is no longer a standalone toggle: it is driven by the
   * reasoning-effort picker — High effort selects the verbose prompt,
   * Medium/Low select the concise one. We derive it here (and keep
   * window.extensiveThinkingOn in sync) so the choice always matches the
   * picker regardless of load order. */
  var _effortHigh = (typeof getReasoningEffort === "function" && getReasoningEffort() === "high");
  try{ window.extensiveThinkingOn = _effortHigh; }catch(_){}
  var chatPrompt = _effortHigh ? CHAT_SYSTEM_PROMPT : CHAT_CONCISE_PROMPT;
  var thinkSuffix = _effortHigh ? thinkingSuffix() : "";
  var toneSuffix = toneVoiceSuffix();
  var msgs=[{role:"system",content:"[Assistant mode instructions]\n"+langDir+chatPrompt+toneSuffix+beagleSuffix()+thinkSuffix}];
  msgs=appendClientContextMessages(msgs);
  /* P5.8 — active prompt template: inject the template's
     specialized system prompt as a fresh system message so
     the model commits to that role for this turn. */
  msgs=injectTemplateSystemPrompt(msgs);
  /* Skip a trailing user message in history — `stateStore.read("messages")` already
     holds the just-added (or just-edited) user entry, and the explicit
     `msgs.push({role:"user",content:userMsg})` below carries it. Without
     this filter the model sees the user message twice on every turn
     (and again on every edit-and-resend). */
  if(history.length&&history[history.length-1].role==="user"){
    history=history.slice(0,-1);
  }
  msgs=msgs.concat(history);
  /* P_attachments — append the user turn using userContent (which is
   * the multimodal parts array when attachments are present, or the
   * plain text otherwise). Page blocks and the URL-mention hint are
   * appended as additional text parts so multimodal content stays
   * a flat array of parts rather than getting coerced back to a
   * string (which would drop the image parts). */
  if(pageBlocks.length){
    var pagesText=userMsg+"\n\n"+pageBlocks.join("\n\n");
    msgs.push({role:"user",content:Array.isArray(userContent)?userContent.concat({type:"text",text:pagesText}):pagesText});
  }else if(looksLikeUserMentionedSite(userMsg)){
    /* The user said something like "look up topodrive.top" or "看看
       example.com 的首页" but we couldn't extract a URL. Inject a
       short hint to the model so it asks for the full URL with an
       http(s):// prefix instead of guessing. */
    var hintText=userMsg+"\n\n[System] The user appears to be referring to a website, but no complete URL was provided in this turn (the system only auto-fetches text that contains a full http(s):// link or a recognizable bare domain like example.com / www.foo.bar). Reply briefly asking them to paste the full URL — including the https:// prefix — so you can read the page. Do NOT invent or guess the page contents.";
    msgs.push({role:"user",content:Array.isArray(userContent)?userContent.concat({type:"text",text:hintText}):hintText});
  }else{
    msgs.push({role:"user",content:userContent});
  }

  /* Unified streaming path with native tool-calling. The former
     legacy round-1 text-parsing branch was removed because it
     conflicted with the backend's function-calling tool interface. */
  /* P_crosstalk-diag — log the FULL message array sent to the LLM so
     we can see exactly what context the model receives. If the model
     "continues an old session", the stale content must be in here.
     Spread the preview as individual console.warn lines so they show
     in the text output without needing to expand Array(2). */
  
  var ctl=_addStreamingMessage({onRetry:function(){
    /* Carry this turn's immutable content directly so retrying an older
       multimodal turn can never pick up a newer draft's attachments. */
    quietTurn(askChatTurn(userText,pendingContent));
  }});
  /* M1 async — create the detached turn before streaming so a socket
     drop mid-turn leaves a resumable server-side run. Best-effort:
     a failed create falls back to the legacy unbound stream. The
     pending pointer survives reloads; it is cleared on finish/cancel
     below and re-attached by loadSession when still open. */
  var _turnId=null;
  var _turnSessionId=stateStore.read("currentSessionId")||null;
  try{
    var _clientTurnId=newClientTurnId();
    var _created=await createChatTurn({
      clientTurnId:_clientTurnId,
      sessionId:_turnSessionId,
      input:{ text:String(userText||"").slice(0,20000) },
    });
    if(_created&&_created.turn&&_created.turn.id){
      _turnId=_created.turn.id;
      if(_turnSessionId)savePendingTurn(_turnSessionId,{turnId:_turnId,clientTurnId:_clientTurnId,lastSeq:0});
    }
  }catch(_){_turnId=null}
  /* P_inline-tools — tool status is now carried by the inline
     .tool-inline rows inside the bubble (created via the streaming
     controller's onInlineTool), so the transient thinking-pill label
     swap ("Searching…" / "已找到 N 条…") is gone. */
  var result=await callAPIStream(msgs,MAX_TOKENS_CHAT,function(delta){ctl.append(delta)},function(t){ctl.appendThinking(t)},{
    onRetry:function(notice){
      if(ctl&&typeof ctl.setRetryStatus==="function")ctl.setRetryStatus(notice);
    },
    onToolUse:function(calls){
      for(var i=0;i<calls.length;i++){
        ctl.recordToolUse(calls[i]);
        if(calls[i]&&calls[i].name==="web_search"){
          publishActiveWorkflowEvent("searching","running",
            {message:"Searching sources…",toolCallIds:[calls[i].id]});
        }
      }
    },
    onToolResult:function(r){
      ctl.recordToolResult(r);
      if(r&&r.runId){var _agentWaiting2=r.status==="awaiting_approval";publishWorkspaceAgentEvent(r.runId,_agentWaiting2?"awaiting_approval":r.ok===false?"failed":"completed",_agentWaiting2?"running":r.ok===false?"failed":"succeeded",{message:r.error||(_agentWaiting2?"Approval required":"Workspace run finished")});}
      if(r&&r.id&&window._activeTemplate&&window._activeTemplate.runId){
        publishActiveWorkflowEvent("reading","running",{message:"Reading results…",toolCallIds:[r.id]});
      }
    },
    onToolApproval:function(approval){
      if(ctl&&typeof ctl.recordToolApproval==="function")ctl.recordToolApproval(approval);
      if(approval&&approval.runId)publishWorkspaceAgentEvent(approval.runId,"awaiting_approval","running",{message:"Approval required"});
    },
    onToolProgress:function(p){
      if(ctl.recordToolProgress)ctl.recordToolProgress(p);
      if(p&&p.runId)publishWorkspaceAgentEvent(p.runId,p.phase==="planning"?"planning":"working","running",{message:p.event||p.phase||"Working"});
    },
    onExecutionStart:function(ev){if(ctl.recordExecutionStart)ctl.recordExecutionStart(ev)},
    /* P_codex-steps — see toolCallbacksForStream: each Codex thread item
       becomes a step row, and its todo list a plan card that updates in
       place. */
    onAgentStep:function(step){if(step&&typeof ctl.recordAgentStep==="function")ctl.recordAgentStep(step)},
    onAgentPlan:function(plan){if(plan&&typeof ctl.recordAgentPlan==="function")ctl.recordAgentPlan(plan)},
    /* P_tool_stream — forward the live tool_call_delta frames to
       the streaming controller so the code / query inside each
       tool card streams in real time, instead of appearing all at
       once when the upstream signals finish_reason='tool_calls'. */
    onToolCallDelta:function(d){
      if(!d)return;
      if(typeof ctl.recordToolCallDelta==="function")ctl.recordToolCallDelta(d);
    },
    turnId:_turnId,
  });
  handleChatApiResult(result,ctl,userText);
  /* M1 async — finish/cancel consume the pending pointer; a transport
     failure keeps it so reload/reconnect can re-attach to the detached
     run instead of opening a duplicate LLM call. */
  try{
    if(_turnSessionId&&(result&&(result.text||result.cancelled)))clearPendingTurn(_turnSessionId);
  }catch(_){}
  publishActiveWorkflowFinish(!!(result&&result.text&&String(result.text).trim()));
  updateChatStats();
  if(stateStore.read("phase")==="chat"||(stateStore.read("topic")&&stateStore.read("kbNodes").length))saveCurrentSession();
}