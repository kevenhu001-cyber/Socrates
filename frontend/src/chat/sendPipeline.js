/* chat/sendPipeline.js — extracted from main.js (B3 batch).
 * submitChatMessage send pipeline (composer snapshot,附件组装, mode dispatch).
 * Zero-behavior-change lift. Turn entries (askChatTurn) and streaming
 * surfaces resolve via window.* at call time.
 */
import { stateStore } from '../state/store.js';
import { turnState } from './turnState.js';
import { isExpectedTurnAbort } from './turnUi.js';
import { hasUsableActive } from '../config/providers.js';
import { _origGenerateFollowUp } from './mocks.js';
import { generateFollowUpStream, askNextQuestion } from '../tutor/socraticTurn.js';
import { toolCallbacksForStream } from './toolCallbacks.js';
import { fetchWebContext, shouldRefreshSearch } from './webSearch.js';
import { shouldAutoSearchTutor } from '../tutor/policy.js';
import { addMessage } from './messages.js';
import { saveCurrentSession } from '../session/persistence.js';
import { updateChatStats } from './stats.js';
import { updateKB } from '../ui/knowledgePanel.js';
import { showToast } from '../ui/toast.js';
import { stripTemplateBodyPrefix, blurChatComposer } from './templateSlash.js';
import {
  clearComposer,
  focusComposer,
  getComposerMarkdown,
} from '../react/composer-input/controller.ts';
import { selectedComposerPlugins } from '../react/composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../react/composer/pluginCatalog.ts';
import {
  buildMessageContent,
  validateImageAttachments,
  resetAttachments,
} from '../attachments.js';
import { renderAttachmentChips } from '../attachments/render.js';
import { updateSendBtn } from '../ui/topicSetup.js';
import { scheduleScrollMainToBottom } from '../ui/scroll.js';
import { isMsgListMounted } from '../react/message-list/MessageList.tsx';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      var v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (_) {}
  return fallback != null ? fallback : key;
}
function _appMode() {
  try {
    if (typeof window !== 'undefined' && window.appMode) return window.appMode;
  } catch (_) {}
  return 'chat';
}
function _webSearchOn() {
  try {
    if (typeof window !== 'undefined' && typeof window.webSearchOn !== 'undefined') return !!window.webSearchOn;
  } catch (_) {}
  return true;
}
function _tutorSocratic() {
  try {
    if (typeof window !== 'undefined' && window.tutorSocratic) return window.tutorSocratic;
  } catch (_) {}
  return null;
}
function _askChatTurn(text, pending, precreatedCtl) {
  if (typeof window !== 'undefined' && typeof window.askChatTurn === 'function') {
    return window.askChatTurn(text, pending, precreatedCtl || null);
  }
  return null;
}
function _addStreamingMessage(opts) {
  if (typeof window !== 'undefined' && typeof window.addStreamingMessage === 'function') {
    return window.addStreamingMessage(opts);
  }
  throw new Error('addStreamingMessage bridge missing');
}

function _deepResearchOn() {
  try { return !!window.deepResearchOn; } catch (_) { return false; }
}

export async function submitChatMessage(textOverride,opts){
  opts=opts||{};
  var rawText=(textOverride!=null?textOverride:getComposerMarkdown("chat"));
  var text=rawText.trim();
  /* P5.8 — if a template is active, strip its body prefix
     from the user text. The body is a placeholder the user
     sees in the input ("Paste the text you want summarized:
     ") but should NOT be sent to the LLM or shown in the
     user bubble. We strip on the WAY in so both paths see
     the cleaned text. The template itself stays active so
     the system prompt keeps injecting on follow-up turns. */
  if(window._activeTemplate && textOverride==null){
    text=stripTemplateBodyPrefix(rawText).trim();
    if(!text){
      /* User sent the placeholder without typing anything
         real. Bail with a hint instead of firing an empty
         request at the model. */
      try{showToast(_t("toast.typeTextFirst"));}catch(_){}
      return;
    }
  }
  /* P_attachments — allow sending if there are attachments even when
   * the text is empty (e.g. just a single image with no caption). */
  var hasAtt = Array.isArray(window.attachments) && window.attachments.length>0;
  if(!text && !hasAtt)return;
  var chatPlugins=selectedComposerPlugins("chat").slice();
  var textForModel=serializeSelectedPluginContext(chatPlugins,text);
  /* Snapshot this turn before any focus or attachment state changes. The
     visible submit must commit synchronously: the user bubble, composer
     collapse, and cleared draft now happen in one interaction frame while
     image description / multimodal assembly continues in the background. */
  var isComposerSubmit=textOverride==null;
  var turnAttachments=isComposerSubmit&&Array.isArray(window.attachments)?window.attachments.slice():[];
  /* P_attachments-multimodal — a model switch can happen while an image is
     being read or compressed. Keep the same guard at the send boundary so a
     stale pending image is rejected before the user bubble is committed. */
  if(isComposerSubmit){
    var attachmentValidation=validateImageAttachments(turnAttachments);
    if(!attachmentValidation.ok){
      showToast(attachmentValidation.message);
      return;
    }
  }
  var immediateAttList=turnAttachments.slice(0,20).map(function(a){
    return Object.assign({},a);
  });
  /* P_send-transaction — create the assistant placeholder in the same
   * interaction task as the submitted user row. Model-content assembly may
   * await image work, URL extraction, or another provider-side preparation;
   * none of that is allowed to leave the visible prompt without its turn
   * anchor. Keep the controller local and pass it explicitly to askChatTurn
   * so two fast submits cannot overwrite a global hand-off slot. */
  var precreatedChatCtl=null;
  var precreatedRetry=null;
  function precreateChatTurn() {
    if (_appMode() !== "chat" || _deepResearchOn()) return;
    try {
      precreatedChatCtl=_addStreamingMessage({
        onRetry:function(){
          if (typeof precreatedRetry === "function") return precreatedRetry();
          return _askChatTurn(text, textForModel);
        },
      });
    } catch (_) { precreatedChatCtl=null; }
  }
  if(isComposerSubmit){
    addMessage("user",text,null,null,immediateAttList);
    precreateChatTurn();
    clearComposer("chat");updateSendBtn();
    /* React scrolls after its MessageList commit. Keep the two-frame
       fallback only for legacy/share surfaces where React does not own the
       transcript, so send never has two independent scroll writers. */
    if(!isMsgListMounted()){
      scheduleScrollMainToBottom({force:true,smooth:true});
    }
    /* Click-send (opts.blurAfterSend) ends the typing session: drop the
       editor focus so the composer collapses out of its focus-within
       visuals. Enter-send keeps the classic keep-typing flow by
       re-asserting focus, exactly as before. */
    if(opts.blurAfterSend){
      blurChatComposer();
    }else{
      focusComposer("chat");
    }
  }else{
    /* Origin: quiz — synthetic message from a quiz pick. */
    addMessage("user",text,null,null,immediateAttList);
    precreateChatTurn();
  }
  /* P_attachments — clear the pending chips after the message is
   * committed to the DOM. Render an empty strip so the UI updates. */
  if(isComposerSubmit){
    if(typeof resetAttachments==="function")resetAttachments();
    if(typeof renderAttachmentChips==="function")renderAttachmentChips();
    if(typeof updateSendBtn==="function")updateSendBtn();
  }

  /* Assemble the model payload from the immutable snapshot after the UI has
     committed. buildMessageContent may await vision description, but it can
     no longer read or clear a newer draft's attachments. A description
     failure degrades to the original text + attachment metadata. */
  var built;
  try{
    built=(typeof buildMessageContent==="function")
      ?await buildMessageContent(textForModel,turnAttachments)
      :{rawText:textForModel,parts:textForModel,attachmentList:immediateAttList};
  }catch(_){
    built={rawText:textForModel,parts:textForModel,attachmentList:immediateAttList};
  }
  var chatContent=built.parts;
  var attList=built.attachmentList||immediateAttList;
  precreatedRetry=function(){ return _askChatTurn(text,chatContent); };
  turnState.pendingChatContent=chatContent;
  turnState.pendingAttachments=attList;

  /* AI processes the answer */
  /* Background web-search refresh for tutor follow-ups. Same 5-turn
     rule as chat mode. We do not block the turn on this — the previous
     context stays in stateStore.read("searchContext") until the new one arrives. */
  if(_webSearchOn()&&stateStore.read("topic")&&shouldRefreshSearch()&&shouldAutoSearchTutor(stateStore.read("topic")+" "+text)){
    fetchWebContext(stateStore.read("topic")+" "+text,{background:true});
  }
  setTimeout(async function(){
    /* Deep Research mode — if the extension is active, run research
       instead of a normal chat turn. Read the window-level flag set by
       pickers.js: the EXTENSIONS array is module-scoped in pickers.js
       and is NOT visible here, so `typeof EXTENSIONS` was always
       "undefined" and this branch never fired (P_deep-research-fix). */
    var deepResearchOn = _deepResearchOn();
    if(deepResearchOn && text){
      if(precreatedChatCtl){try{precreatedChatCtl.abort()}catch(_){} precreatedChatCtl=null;}
      if(typeof window.startDeepResearch === "function"){
        await window.startDeepResearch(text);
      }
      return;
    }
    /* Chat mode: plain conversation, no Socratic / KB / mistake book.
       Just stream a reply and save. */
    if(_appMode()==="chat"){
      try{
        await _askChatTurn(text,chatContent,precreatedChatCtl);
      }catch(turnErr){
        /* P_turn-abort-quiet — session-expired / superseded aborts are
           expected (the gate / new turn already owns the UX). Anything
           else is a real bug: log it without the red banner, since the
           stream controller already surfaced the failure in-bubble. */
        if(!isExpectedTurnAbort(turnErr)){try{console.error("[chat] turn failed:",turnErr)}catch(_){}}
      }
      return;
    }

    var node=stateStore.read("kbNodes")[stateStore.read("currentNode")];
    stateStore.dispatch({type:"state/set",key:"stuckCount",value:stateStore.read("stuckCount")+1});

    /* §8.5 — increment the practice-attempt counter when the
       student answers during the exercise stage. The chip in
       the mode banner reads from this. */
    if(stateStore.read("teachingStage")==="exercise"){
      stateStore.dispatch({
        type:"state/set",key:"practiceAttempts",value:(stateStore.read("practiceAttempts")||0)+1
      });
    }

    /* Check if the answer seems substantive.
       P_quiz-count — quiz-origin answers (synthesised by handleQuizPick
       as "I chose A. ... (Result: correct.)") always exceed the length
       threshold. If we count them toward substantiveCount, 3 quiz picks
       would silently bring the user to the advance threshold, letting
       them "master" a node by clicking quiz options without any real
       free-form reasoning. Skip the count for quiz and practice-origin
       answers; they have their own advancement paths (handleQuizPick
       for quiz, the practice widget for practice). */
    var isSubstantive=text.length>40&&text.split(/\s+/).length>8;
    if(isSubstantive&&opts.origin!=="quiz"&&opts.origin!=="practice"){
      stateStore.dispatch({
        type:"state/set",key:"substantiveCount",value:stateStore.read("substantiveCount")+1
      });
    }

    var ADVANCE_THRESHOLD=3;

    /* Task 2.3 — advance the explicit teaching-stage state machine
       one step per substantive free-form answer. Quiz-origin
       answers (opts.origin==="quiz") are stage-driven by
       handleQuizPick and don't bump the stage here. We advance
       motivate → define → develop → illustrate → exercise → check
       and stop at check (the check stage is quiz-driven). */
    if(isSubstantive&&stateStore.read("teachingStage")!=="check"&&opts.origin!=="quiz"){
      var order=["motivate","define","develop","illustrate","exercise","check"];
      var curIdx=order.indexOf(stateStore.read("teachingStage")||"motivate");
      if(curIdx>=0&&curIdx<order.length-1){
        stateStore.dispatch({type:"state/set",key:"teachingStage",value:order[curIdx+1]});
        if(stateStore.read("teachingStage")==="exercise"){
          stateStore.dispatch({type:"state/batch",patch:{
            practiceAttempts:0,practicePhase:"foundation"
          }});
        }
      }
    }
    /* Practice-progress chip — update after every answer so the
       user sees their attempt count climb. */
    if(typeof _tutorSocratic()==="object"&&_tutorSocratic()
       &&typeof _tutorSocratic().renderPracticeProgress==="function"){
      try{_tutorSocratic().renderPracticeProgress()}catch(_){}
    }
    /* U-M1 — the teaching-plan sidebar now shows the substantive-answer
       depth counter (n/3), so re-render it whenever the counter or the
       stage may have moved. */
    if(typeof _tutorSocratic()==="object"&&_tutorSocratic()
       &&typeof _tutorSocratic().renderTeachingPlan==="function"){
      try{_tutorSocratic().renderTeachingPlan()}catch(_){}
    }

    /* P_stage-gate — a node is only internalized when the user has
       progressed far enough in the teaching stage machine AND shown
       sustained engagement. The old logic (3 substantive answers
       regardless of stage) let a user "master" a node during the
       motivate phase — before any definition, example, or practice
       was even presented. Now we require:
       1. At least ADVANCE_THRESHOLD substantive free-form answers
          (proves sustained engagement, not just a one-liner).
       2. The teaching stage has reached at least "exercise" — meaning
          the model has already motivated, defined, developed, and
          illustrated the concept, AND the user has attempted a
          practice problem.
       3. Not a quiz-origin turn (quiz has its own advancement path).
       This ensures the user actually went through the full teaching
       arc before the node is marked internalized. */
    var stageOrder=["motivate","define","develop","illustrate","exercise","check"];
    var curStageIdx=stageOrder.indexOf(stateStore.read("teachingStage")||"motivate");
    var reachedExercise=curStageIdx>=stageOrder.indexOf("exercise");
    if(stateStore.read("substantiveCount")>=ADVANCE_THRESHOLD&&!opts.origin&&reachedExercise){
      /* User has shown depth on this node AND reached the exercise
         stage — advance to internalized. */
      var updatedNode=Object.assign({},node,{
        status:"internalized",questions:(node.questions||0)+1
      });
      var updatedKbNodes=stateStore.read("kbNodes").slice();
      updatedKbNodes[stateStore.read("currentNode")]=updatedNode;
      stateStore.dispatch({type:"state/set",key:"kbNodes",value:updatedKbNodes});
      node=updatedNode;
      stateStore.dispatch({type:"state/set",key:"substantiveCount",value:0});
      /* P_node-sync — find the next sub-topic using the teaching
         plan's SORTED order, NOT the raw kbNodes order. The plan
         sorts blank → fuzzy → internalized so we teach the biggest
         gaps first. We also sync currentSubtopicIdx so the plan
         sidebar stays consistent with what we're actually teaching. */
      var nextKbIdx=-1;
      var planSubs=(stateStore.read("teachingPlan")&&stateStore.read("teachingPlan").subtopics)||[];
      if(planSubs.length){
        /* Find current sub-topic's position in the sorted plan */
        var curPlanIdx=-1;
        for(var pi=0;pi<planSubs.length;pi++){
          if(planSubs[pi].name===node.name){curPlanIdx=pi;break}
        }
        /* Walk forward in the sorted plan to find the next non-internalized */
        var nextPlanIdx=-1;
        for(var pi2=curPlanIdx+1;pi2<planSubs.length;pi2++){
          if(planSubs[pi2].status!=="internalized"){nextPlanIdx=pi2;break}
        }
        if(nextPlanIdx>=0){
          var nextSub=planSubs[nextPlanIdx];
          /* Find the kbNode index matching this sub-topic's name */
          for(var kni=0;kni<stateStore.read("kbNodes").length;kni++){
            if(stateStore.read("kbNodes")[kni].name===nextSub.name){nextKbIdx=kni;break}
          }
          stateStore.dispatch({
            type:"state/set",key:"session.teachingPlan.currentSubtopicIdx",value:nextPlanIdx
          });
        }
      }
      /* Fallback: if the plan-based lookup failed (no plan, or name
         mismatch), use the old raw-order scan as a safety net. */
      if(nextKbIdx<0){
        for(var i=stateStore.read("currentNode")+1;i<stateStore.read("kbNodes").length;i++){
          if(stateStore.read("kbNodes")[i].status!=="internalized"){nextKbIdx=i;break}
        }
      }
      updateKB();
      if(nextKbIdx<0){
        addMessage("assistant","Nice work — you've explored all the key areas of "+stateStore.read("domain")+". Feel free to revisit any node on the left, or start a new topic.");
      }else{
        stateStore.dispatch({type:"state/batch",patch:{
          currentNode:nextKbIdx,
          stuckCount:0,
          teachingStage:"motivate",
          currentExampleIdx:0,
          practiceAttempts:0
        }});
        /* Task 2.3 — reset the teaching-stage state machine for
           the new sub-topic. The new node starts at motivate with
           no examples shown and no practice attempts. */
        var prevName=node.name;
        var nextName=stateStore.read("kbNodes")[nextKbIdx].name;
        addMessage("assistant","Good depth on **"+prevName+"**. Let's move to the next area: **"+nextName+"**.");
        setTimeout(function(){askNextQuestion()},900);
      }
      saveCurrentSession();
    }else if(isSubstantive||stateStore.read("stuckCount")<3||opts.origin==="quiz"){
      /* Defensive: if the user is in tutor mode but the KB is empty
         (e.g. they just switched modes, or the session was loaded
         without KB nodes), fall through to chat-style handling. This
         avoids a downstream "Cannot read properties of undefined
         (reading 'status')" in buildFollowUpMessages. */
      if(!node){
        try{
          await _askChatTurn(text,chatContent);
        }catch(turnErr){
          if(!isExpectedTurnAbort(turnErr)){try{console.error("[chat] turn failed:",turnErr)}catch(_){}}
        }
        stateStore.dispatch({type:"state/set",key:"totalQ",value:stateStore.read("totalQ")+1});
        updateChatStats();
        return;
      }
      /* Follow up within same node — streamed */
      var streamCtl=null;
      if(hasUsableActive()){
        streamCtl=_addStreamingMessage({onRetry:function(){submitChatMessage(text,opts)}});
        var fu=await generateFollowUpStream(
          text,
          node,
          stateStore.read("domain"),
          function(delta){streamCtl.append(delta)},
          function(t){streamCtl.appendThinking(t)},
          toolCallbacksForStream(streamCtl)
        );
        if(fu!=null){
          streamCtl.finish();
        }else{
          if(stateStore.read("lastCallError")){
            /* Keep the placeholder visible with a retry button instead
               of silently swapping to a mock answer — the user just
               spent keystrokes and deserves to see what went wrong. */
            streamCtl.replaceWithError("No response: "+stateStore.read("lastCallError"),function(){
              submitChatMessage(text,opts);
            });
          }else{
            streamCtl.abort();
            addMessage("assistant",_origGenerateFollowUp(text,node,stateStore.read("domain")));
          }
        }
      }else{
        addMessage("assistant",_origGenerateFollowUp(text,node,stateStore.read("domain")));
      }
      /* U-M2 — only a substantive (or quiz-driven) answer proves the
         student isn't stuck. The old unconditional reset here meant
         stuckCount could never reach 3 — the explain-offer escape
         valve below was dead code and genuinely stuck students just
         kept getting harder follow-ups. Short answers now accumulate;
         three in a row trigger the stuck flow. */
      stateStore.dispatch({type:"state/batch",patch:{
        stuckCount:(isSubstantive||opts.origin==="quiz")?0:stateStore.read("stuckCount"),
        totalQ:stateStore.read("totalQ")+1
      }});
    }else{
      /* v3.0 design — §8.2 first offer the "讲解一下 / 再想想"
         two-choice prompt, then escalate to the §8.6 four-option
         dialog if the user keeps refusing. Audit U-H3 noted the
         old path was a one-shot "explain/skip/retry" with no
         escape valve. */
      if(stateStore.read("stuckCount")>=3){
        if(stateStore.read("stuckCheckOffered")&&stateStore.read("stuckCheckRejected")>=1){
          /* Two "再想想" rejections in a row → §8.2 forces the
             four-option dialog (per design). */
          if(typeof _tutorSocratic()==="object"&&_tutorSocratic()
             &&typeof _tutorSocratic().showFourOptionDialog==="function"){
            try{_tutorSocratic().showFourOptionDialog(text)}catch(_){}
          }else{
            addMessage("assistant","Let's try a different approach.","suggest",[
              {text:_t("tutor.explain"),action:"explain",primary:true},
              {text:_t("tutor.skip"),action:"skip"},
              {text:_t("tutor.thinkMore"),action:"retry"}
            ]);
          }
          stateStore.dispatch({type:"state/batch",patch:{
            stuckCount:0,stuckCheckOffered:false,stuckCheckRejected:0
          }});
        }else if(!stateStore.read("stuckCheckOffered")){
          /* First time on this node: ask permission to explain
             instead of dumping a textbook at the user. */
          if(typeof _tutorSocratic()==="object"&&_tutorSocratic()
             &&typeof _tutorSocratic().showExplainPrompt==="function"){
            try{_tutorSocratic().showExplainPrompt()}catch(_){}
          }else{
            addMessage("assistant","Let's try a different approach.","suggest",[
              {text:_t("tutor.explain"),action:"explain",primary:true},
              {text:_t("tutor.skip"),action:"skip"},
              {text:_t("tutor.thinkMore"),action:"retry"}
            ]);
          }
          stateStore.dispatch({type:"state/batch",patch:{
            stuckCheckOffered:true,stuckCount:0
          }});
        }else{
          stateStore.dispatch({type:"state/batch",patch:{
            stuckCheckRejected:(stateStore.read("stuckCheckRejected")||0)+1,stuckCount:0
          }});
          addMessage("assistant",_t("tutor.takeTime"));
        }
      }else{
        addMessage("assistant",_t("tutor.takeTime"));
      }
    }
    updateChatStats();
  },0);
}
