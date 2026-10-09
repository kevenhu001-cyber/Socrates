/* Parse SSE frames into chat deltas and typed tool/agent events. The HTTP
 * transport owns retries and reader lifecycle; this module owns the wire
 * protocol and its semantic-output state. */
import { createInlineThinkScanner } from './inlineThinkScanner.js';
import { notifySpeedFallbackOnce } from './speedFallback.js';
import { reportSwallow } from '../util/reportSwallow.ts';

const CALLBACK_BY_EVENT = Object.freeze({
  tool_use: 'onToolUse',
  tool_result: 'onToolResult',
  tool_approval: 'onToolApproval',
  agent_step: 'onAgentStep',
  agent_plan: 'onAgentPlan',
  tool_progress: 'onToolProgress',
  execution_start: 'onExecutionStart',
  tool_call_delta: 'onToolCallDelta',
});

const DEV = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) === true;

function warnBadFrame(eventName, error) {
  if (!DEV) return;
  try { console.warn('[stream] failed to handle ' + eventName + ' frame:', error && error.message || error); }
  catch (caught) { reportSwallow(caught, 'chat/streamFrameProcessor.warnBadFrame'); }
}

/* Keep the same error shape for request failures and structured SSE errors. */
export function makeStreamError(message, status, body) {
  const error = new Error(String(message || 'stream request failed'));
  if (status != null) error.status = Number(status);
  if (body != null) error.body = body;
  if (body && body.code) error.code = body.code;
  return error;
}

function parseFrame(frame) {
  const lines = frame.split('\n');
  const dataParts = [];
  let eventName = null;
  for (const line of lines) {
    if (line.indexOf('data:') === 0) dataParts.push(line.slice(5).trim());
    else if (line.indexOf('event:') === 0) {
      const event = line.slice(6).trim();
      if (event) eventName = event;
    }
  }
  return { eventName, dataParts };
}

function dispatchCallbackEvent(state, context, eventName, dataParts) {
  if (!Object.prototype.hasOwnProperty.call(CALLBACK_BY_EVENT, eventName)) return false;
  state.semanticActivity = true;
  const callback = context.opts && context.opts[CALLBACK_BY_EVENT[eventName]];
  if (typeof callback === 'function' && dataParts.length) {
    /* A tool row's text offset must include visible text held for a possible
       split <think> opening tag. */
    if (eventName === 'tool_use') state.thinkScanner.flushVisibleTail();
    try { callback(JSON.parse(dataParts.join('\n'))); }
    catch (error) { warnBadFrame(eventName, error); }
  }
  return true;
}

function handleTurnBound(context, dataParts) {
  if (!dataParts.length) return;
  try {
    const turn = JSON.parse(dataParts.join('\n'));
    if (!turn || typeof turn.turnId !== 'string') return;
    if (typeof context.onActiveTurnBound === 'function') context.onActiveTurnBound(turn.turnId);
    if (context.opts && typeof context.opts.onTurnBound === 'function') {
      context.opts.onTurnBound(turn.turnId);
    }
  } catch (error) { warnBadFrame('turn_bound', error); }
}

function handlePreferenceFallback(dataParts) {
  if (!dataParts.length) return;
  try {
    const fallback = JSON.parse(dataParts.join('\n'));
    if (fallback && fallback.preference === 'response_speed') notifySpeedFallbackOnce();
  } catch (error) { warnBadFrame('preference_fallback', error); }
}

function handleStreamErrorEvent(state, dataParts) {
  try {
    const error = JSON.parse(dataParts.join('\n'));
    state.streamError = makeStreamError(error.error || error.message || JSON.stringify(error), error.status, error);
  } catch (_) {
    state.streamError = makeStreamError(dataParts.join(' ').slice(0, 200));
  }
}

function handleControlEvent(state, context, eventName, dataParts) {
  if (eventName === 'turn_bound') {
    handleTurnBound(context, dataParts);
    return true;
  }
  if (eventName === 'preference_fallback') {
    handlePreferenceFallback(dataParts);
    return true;
  }
  if (eventName === 'error' && dataParts.length) {
    handleStreamErrorEvent(state, dataParts);
    return true;
  }
  return false;
}

function emitReasoning(state, context, reasoning) {
  if (typeof reasoning !== 'string' || !reasoning.length) return;
  state.semanticActivity = true;
  if (typeof context.onThinking !== 'function') return;
  try { context.onThinking(reasoning); }
  catch (error) { reportSwallow(error, 'chat/streamFrameProcessor.reasoning'); }
}

function warnMissingThinkingCallback(state, context) {
  if (state.hasWarnedMissingThinking || typeof context.onThinking === 'function'
      || (!state.thinkScanner.isOpen && !state.thinkScanner.hasPendingThought)) return;
  state.hasWarnedMissingThinking = true;
  try {
    console.warn('[API stream] inline <think> detected but caller did not provide onThinking; thinking pill will not light up. Pass an onThinking callback in callAPIStream(...,onThinking,opts).');
  } catch (error) { reportSwallow(error, 'chat/streamFrameProcessor.missingThinkingCallback'); }
}

function emitVisibleDelta(state, context, delta) {
  if (typeof delta !== 'string' || !delta.length) return;
  state.semanticActivity = true;
  state.thinkScanner.push(delta);
  warnMissingThinkingCallback(state, context);
}

function emitJsonDelta(state, context, payload) {
  let message;
  try {
    message = JSON.parse(payload);
  } catch (_) {
    /* Ignore [DONE] and unknown frames. Preserve recognizable truncated errors. */
    if ((payload.indexOf('"error"') >= 0 || payload.indexOf("'error'") >= 0)
        && /error|fail|unavailable/i.test(payload)) {
      state.streamError = makeStreamError(payload.slice(0, 200));
    }
    return;
  }

  if (message.error) {
    state.streamError = makeStreamError(
      typeof message.error === 'string' ? message.error : message.error.message || 'upstream error',
      message.status,
      message,
    );
    return;
  }
  const delta = message.choices && message.choices[0] && message.choices[0].delta && message.choices[0].delta.content;
  const reasoning = message.choices && message.choices[0] && message.choices[0].delta && message.choices[0].delta.reasoning_content;
  emitReasoning(state, context, reasoning);
  emitVisibleDelta(state, context, delta);
}

function processDataPayload(state, context, payload) {
  if (!payload || payload === '[DONE]' || payload === '__FORMATTED__') return;

  /* The final server-rendered response is an object with an actual string
     `html` property. Do not mistake fenced HTML inside a text delta for it. */
  if (state.formattedHtml === null && payload.indexOf('{') === 0) {
    try {
      const response = JSON.parse(payload);
      if (response && typeof response.html === 'string') {
        state.formattedHtml = response;
        state.semanticActivity = true;
        return;
      }
    } catch (error) { reportSwallow(error, 'chat/streamFrameProcessor.formattedHtmlProbe'); }
  }
  emitJsonDelta(state, context, payload);
}

function processFrame(state, context, frame) {
  const { eventName, dataParts } = parseFrame(frame);
  if (dispatchCallbackEvent(state, context, eventName, dataParts)) return;
  if (handleControlEvent(state, context, eventName, dataParts)) return;
  if (!dataParts.length) return;
  processDataPayload(state, context, dataParts.join('\n'));
}

function finishFrame(state) {
  if (state.thinkScanner.finish()) state.semanticActivity = true;
}

export function createStreamFrameProcessor(context) {
  const state = {
    full: '',
    formattedHtml: null,
    semanticActivity: false,
    streamError: null,
    hasWarnedMissingThinking: false,
    thinkScanner: null,
  };
  state.thinkScanner = createInlineThinkScanner({
    onVisibleText(text) {
      state.full += text;
      try { if (context.onDelta) context.onDelta(text, state.full); }
      catch (error) { console.warn('[API stream] onDelta threw:', error && error.message); }
    },
    onThinking: context.onThinking,
  });

  return {
    processFrame(frame) { processFrame(state, context, frame); },
    finish() { finishFrame(state); },
    get full() { return state.full; },
    get formattedHtml() { return state.formattedHtml; },
    get semanticActivity() { return state.semanticActivity; },
    get streamError() { return state.streamError; },
  };
}
