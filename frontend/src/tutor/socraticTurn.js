/* tutor/socraticTurn.js — extracted from main.js (B4 batch 2).
 * Socratic execution layer: non-stream/stream question generation,
 * explanation, and follow-up streaming. Zero-behavior-change lift.
 */
import { stateStore } from '../state/store.js';
import { hasUsableActive } from '../config/providers.js';
import { extractHistory } from '../chat/history.js';
import { callAPI } from '../chat/api.js';
import { callAPIStream } from '../chat/stream.js';
import { buildSocraticMessages, buildFollowUpMessages, buildSocraticPrompt } from './flow.ts';
import { BASELINE_LEVEL, fromBasicsDirective } from '../chat/socraticDirectives.js';
import { appendClientContextMessages } from '../chat/promptSuffixes.ts';
import { injectTemplateSystemPrompt } from '../chat/templateSystemPrompt.ts';
import { _origGenerateSocraticQuestion, _origGetExplanation } from '../chat/mocks.js';
import { addMessage as _addMessage } from '../chat/messages.js';
import { scheduleTurnToTopForMessage } from '../chat/turnAnchor.ts';
import { toolCallbacksForStream as _toolCallbacksForStream } from '../chat/toolCallbacks.js';
import { updateChatStats as _updateChatStatsDirect } from '../chat/stats.js';

/* omit entirely; backend passes through */
var MAX_TOKENS_CHAT = undefined;

export async function generateSocraticQuestion(node, domain) {
  if (hasUsableActive()) {
    console.log('[Socratic] non-stream for: ' + node.name);
    var history = extractHistory();
    var isFirst = history.length === 0;
    var msgs = buildSocraticMessages(node, domain, history, isFirst);
    var resp = await callAPI(msgs, MAX_TOKENS_CHAT);
    if (resp && resp.trim()) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return { text: resp.trim(), node: node };
    }
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  return _origGenerateSocraticQuestion(node, domain);
}

export async function generateSocraticQuestionStream(node, domain, onDelta, onThinking, streamOpts) {
  if (hasUsableActive()) {
    console.log('[Socratic] stream for: ' + node.name);
    var history = extractHistory();
    var isFirst = history.length === 0;
    var msgs = buildSocraticMessages(node, domain, history, isFirst);
    var result = await callAPIStream(msgs, MAX_TOKENS_CHAT, onDelta, onThinking, streamOpts);
    if (result && result.text && result.text.trim()) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return result; // {text, html, widgets}
    }
    /* User explicitly clicked Stop — propagate the cancelled flag so
       the caller (askNextQuestion) can clean up the bubble without
       showing an error or falling back to the mock question. */
    if (result && result.cancelled) { return result; }
    if (!stateStore.read('lastCallError')) stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: 'Stream returned no content' });
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  return null;
}

/* Explanation: called from handleQuickAction('explain') — non-stream is fine here. */
export async function getExplanation(status) {
  if (hasUsableActive()) {
    var node = stateStore.read('kbNodes')[stateStore.read('currentNode')];
    var domain = stateStore.read('domain');
    /* Depth hint — modulates how detailed the re-explain is, but still
       mandates starting from the core definition per Principle 2. */
    var depthHint = (status === 'internalized' || status === 'fuzzy')
      ? 'The user has some surface familiarity with this topic, so you can move with less scaffolding and fewer examples, but you MUST still begin from the core definition.'
      : "The user is encountering this topic for the first time, so use more examples, more analogies, and more scaffolding, and you MUST still begin from the core definition.";
    var history = extractHistory();
    var prompt = buildSocraticPrompt(domain, BASELINE_LEVEL,
      fromBasicsDirective({ status: status }) +
      "The user clicked 'Explain this' on: " + node.name + '. ' + depthHint + '\n' +
      'This is a RE-EXPLAIN of material the user has seen before — do not pad it with greetings or meta-commentary, ' +
      'but DO re-ground the explanation in the most essential, foundational core definition before moving to anything advanced. ' +
      'You may reference earlier examples from the chat history briefly, but the explanation itself must stand on its own ' +
      'starting from the foundation.\n' +
      'Write a textbook-quality explanation: systematic, formal, layer-by-layer. Use bold for key terms. Use LaTeX for math. ' +
      'Build from foundation to advanced. Include 1-3 concrete examples inline, scaled by the depth hint above.'
    );
    var msgs = injectTemplateSystemPrompt(
      appendClientContextMessages([{ role: 'system', content: prompt }], true).concat(history).concat([{ role: 'user', content: "Please explain this concept, taking into account what we've already discussed." }])
    );
    var apiResp = await callAPI(msgs, MAX_TOKENS_CHAT);
    if (apiResp) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return apiResp;
    }
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  return _origGetExplanation(status);
}

export async function generateFollowUpStream(answer, node, domain, onDelta, onThinking, streamOpts) {
  if (hasUsableActive()) {
    var history = extractHistory();
    var msgs = buildFollowUpMessages(answer, node, domain, history);
    var result = await callAPIStream(msgs, MAX_TOKENS_CHAT, onDelta, onThinking, streamOpts);
    if (result && result.text && result.text.trim()) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return result.text.trim();
    }
    /* Ensure lastCallError is set so the caller (submitChatMessage)
       shows an error bubble instead of silently falling through to
       a random mock question (_origGenerateFollowUp). */
    if (!stateStore.read('lastCallError')) stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: 'Stream returned no content' });
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  return null;
}


/* Module-local bridges for main.js-owned turn surfaces. */

function _addStreamingMessage(opts) {
  if (typeof window !== 'undefined' && typeof window.addStreamingMessage === 'function') {
    return window.addStreamingMessage(opts);
  }
  throw new Error('addStreamingMessage bridge missing');
}
function _updateChatStats() {
  try { _updateChatStatsDirect(); } catch (_) {}
}
function _addAnchoredAssistant(text) {
  var clientId=_addMessage("assistant",text);
  var list=typeof document!=="undefined"?document.getElementById("msgList"):null;
  scheduleTurnToTopForMessage(list,clientId);
  return clientId;
}

export async function askNextQuestion(){
  var node=stateStore.read("kbNodes")[stateStore.read("currentNode")];
  if(hasUsableActive()){
    var ctl=_addStreamingMessage({onRetry:function(){askNextQuestion()}});
    var result=await generateSocraticQuestionStream(
      node,
      stateStore.read("domain"),
      function(delta){ctl.append(delta)},
      function(t){ctl.appendThinking(t)},
      _toolCallbacksForStream(ctl)
    );
    /* User explicitly clicked Stop on the bubble — clean it up
       silently. Don't fall back to mock (the user wanted to STOP,
       not get a different question), don't show an error. */
    if(result&&result.cancelled){
      ctl.abort();
      return;
    }
    if(result!=null){
      ctl.finish();
      stateStore.dispatch({type:"state/batch",patch:{stuckCount:0,totalQ:stateStore.read("totalQ")+1}});
      _updateChatStats();
      return;
    }
    /* Distinguish upstream error (show retry) from "API returned null
       but no error" (e.g. malformed response) — only show the retry
       button if we have a real lastCallError to surface. */
    if(stateStore.read("lastCallError")){
      ctl.replaceWithError("No response: "+stateStore.read("lastCallError"),function(){
        askNextQuestion();
      });
      return;
    }
    ctl.abort();
  }
  /* fallback: mock or pre-stream API path */
  var q=await generateSocraticQuestion(node,stateStore.read("domain"));
  _addAnchoredAssistant(q.text);
  stateStore.dispatch({type:"state/batch",patch:{stuckCount:0,totalQ:stateStore.read("totalQ")+1}});
  _updateChatStats();
}
