/* tutor/socraticTurn.ts — extracted from main.js (B4 batch 2).
 * Socratic execution layer: non-stream/stream question generation,
 * explanation, and follow-up streaming. Zero-behavior-change lift.
 */
import { stateStore } from '../state/store.ts';
import { hasUsableActive } from '../config/providers.ts';
import { extractHistory } from '../chat/history.ts';
import type { HistoryEntry } from '../chat/history.ts';
import type { PromptMessage } from '../chat/promptSuffixes.ts';
import type { ChatRequestMessage } from '../chat/api/requestBody.ts';
import { callAPI } from '../chat/api.ts';
import { callAPIStream, StreamThinkingHandler, StreamDeltaHandler, StreamCallOptions } from '../chat/stream.ts';
import { buildSocraticMessages, buildFollowUpMessages, buildSocraticPrompt, TutorNode } from './flow.ts';
import { BASELINE_LEVEL, fromBasicsDirective } from '../chat/socraticDirectives.ts';
import { appendClientContextMessages } from '../chat/promptSuffixes.ts';
import { injectTemplateSystemPrompt } from '../chat/templateSystemPrompt.ts';
import { _origGenerateSocraticQuestion, _origGetExplanation } from '../chat/mocks.ts';
import { notifyMockFallbackOnce } from '../chat/mockFallbackNotice.ts';
import { addMessage as _addMessage } from '../chat/messages.ts';
import { scheduleTurnToTopForMessage } from '../chat/turnAnchor.ts';
import { toolCallbacksForStream as _toolCallbacksForStream } from '../chat/toolCallbacks.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


/* omit entirely; backend passes through */
const MAX_TOKENS_CHAT: number|undefined = undefined;

function promptHistory(entries: HistoryEntry[]): PromptMessage[] {
  /* The history builder preserves multimodal content arrays. Prompt builders
     treat messages as opaque and the request wire contract accepts unknown
     content, so keep those payloads intact across this boundary. */
  return entries as unknown as PromptMessage[];
}

export async function generateSocraticQuestion(node: TutorNode, domain: string) {
  if (hasUsableActive()) {
    console.log('[Socratic] non-stream for: ' + node.name);
    const history = promptHistory(extractHistory());
    const isFirst = history.length === 0;
    const msgs = buildSocraticMessages(node, domain, history, isFirst);
    const resp = await callAPI(msgs as unknown as ChatRequestMessage[], MAX_TOKENS_CHAT as number);
    if (typeof resp === 'string' && resp.trim()) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return { text: resp.trim(), node: node };
    }
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  /* Canned prompt, not an AI reply — make the degradation visible. */
  notifyMockFallbackOnce();
  return _origGenerateSocraticQuestion({ ...node, status: node.status || 'blank' }, domain);
}

export async function generateSocraticQuestionStream(node: TutorNode, domain: string, onDelta: StreamDeltaHandler, onThinking: StreamThinkingHandler, streamOpts: StreamCallOptions|null|undefined) {
  if (hasUsableActive()) {
    console.log('[Socratic] stream for: ' + node.name);
    const history = promptHistory(extractHistory());
    const isFirst = history.length === 0;
    const msgs = buildSocraticMessages(node, domain, history, isFirst);
    const result = await callAPIStream(msgs, MAX_TOKENS_CHAT, onDelta, onThinking, streamOpts);
    if (result && result.cancelled) return result;
    if (result && result.text && result.text.trim()) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return result; // {text, html, widgets}
    }
    /* User explicitly clicked Stop — propagate the cancelled flag so
       the caller (askNextQuestion) can clean up the bubble without
       showing an error or falling back to the mock question. */
    if (!stateStore.read('lastCallError')) stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: 'Stream returned no content' });
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  return null;
}

/* Explanation: called from handleQuickAction('explain') — non-stream is fine here. */
export async function getExplanation(status: string) {
  if (hasUsableActive()) {
    const node = stateStore.read('kbNodes')[stateStore.read('currentNode')] as TutorNode;
    const domain = stateStore.read('domain') || '';
    /* Depth hint — modulates how detailed the re-explain is, but still
       mandates starting from the core definition per Principle 2. */
    const depthHint = (status === 'internalized' || status === 'fuzzy')
      ? 'The user has some surface familiarity with this topic, so you can move with less scaffolding and fewer examples, but you MUST still begin from the core definition.'
      : "The user is encountering this topic for the first time, so use more examples, more analogies, and more scaffolding, and you MUST still begin from the core definition.";
    const history = promptHistory(extractHistory());
    const prompt = buildSocraticPrompt(domain, BASELINE_LEVEL,
      fromBasicsDirective({ status: status }) +
      "The user clicked 'Explain this' on: " + node.name + '. ' + depthHint + '\n' +
      'This is a RE-EXPLAIN of material the user has seen before — do not pad it with greetings or meta-commentary, ' +
      'but DO re-ground the explanation in the most essential, foundational core definition before moving to anything advanced. ' +
      'You may reference earlier examples from the chat history briefly, but the explanation itself must stand on its own ' +
      'starting from the foundation.\n' +
      'Write a textbook-quality explanation: systematic, formal, layer-by-layer. Use bold for key terms. Use LaTeX for math. ' +
      'Build from foundation to advanced. Include 1-3 concrete examples inline, scaled by the depth hint above.'
    );
    const msgs = injectTemplateSystemPrompt(
      appendClientContextMessages([{ role: 'system', content: prompt }], true).concat(history).concat([{ role: 'user', content: "Please explain this concept, taking into account what we've already discussed." }])
    );
    const apiResp = await callAPI(msgs as unknown as ChatRequestMessage[], MAX_TOKENS_CHAT as number);
    if (apiResp) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
      return apiResp;
    }
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' });
  } else { stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'mock' }); }
  /* Canned explanation, not an AI reply — make it visible. */
  notifyMockFallbackOnce();
  return _origGetExplanation(status);
}

export async function generateFollowUpStream(answer: string, node: TutorNode, domain: string, onDelta: StreamDeltaHandler, onThinking: StreamThinkingHandler, streamOpts: StreamCallOptions|null|undefined) {
  if (hasUsableActive()) {
    const history = promptHistory(extractHistory());
    const msgs = buildFollowUpMessages(answer, node, domain, history);
    const result = await callAPIStream(msgs, MAX_TOKENS_CHAT, onDelta, onThinking, streamOpts);
    if (result && result.cancelled) return result;
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

function _addStreamingMessage(opts: { onRetry: () => void; }) {
  if (typeof window !== 'undefined' && typeof browserWindow.addStreamingMessage === 'function') {
    return browserWindow.addStreamingMessage(opts);
  }
  throw new Error('addStreamingMessage bridge missing');
}
function _addAnchoredAssistant(text: unknown) {
  const clientId=_addMessage("assistant",text);
  const list=typeof document!=="undefined"?document.getElementById("msgList"):null;
  scheduleTurnToTopForMessage(list,clientId);
  return clientId;
}

export async function askNextQuestion(){
  const node=stateStore.read("kbNodes")[stateStore.read("currentNode")];
  if(hasUsableActive()){
    const ctl=await _addStreamingMessage({onRetry:function(){askNextQuestion()}});
    const result=await generateSocraticQuestionStream(
      node,
      stateStore.read("domain") || '',
      function(delta: string){ctl.append(delta)},
      function(t: string){ctl.appendThinking(t)},
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
  const q=await generateSocraticQuestion(node,stateStore.read("domain") || '');
  _addAnchoredAssistant(q.text);
  stateStore.dispatch({type:"state/batch",patch:{stuckCount:0,totalQ:stateStore.read("totalQ")+1}});
}
