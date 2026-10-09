import { apiFetchRaw } from '../../util/api.js';
import {
  AI_MAX_ATTEMPTS,
  isUserAbort,
} from '../retryPolicy.ts';
import { buildChatRequestBody } from './requestBody.js';
import {
  bindAbortSignal,
  errorMessage,
  isAbortError,
  makeAIError,
  setLastCallError,
  waitForRetry,
} from './shared.js';
import { reportSwallow } from '../../util/reportSwallow.ts';

const SEMANTIC_EVENTS = new Set([
  'tool_use', 'tool_result', 'tool_progress', 'execution_start',
  'tool_call_delta', 'agent_step', 'agent_plan',
]);

function parseProbeError(payload) {
  let errorData;
  try { errorData = JSON.parse(payload); }
  catch { return makeAIError(payload); }
  return makeAIError(
    errorData && (errorData.error || errorData.message) || payload,
    errorData && errorData.status,
    errorData,
  );
}

function splitProbeFrame(frame) {
  const data = [];
  let eventName = '';
  for (const line of frame.split(/\r?\n/)) {
    if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
    if (line.indexOf('data:') === 0) data.push(line.slice(5).trim());
  }
  return { eventName, data };
}

function addProbeChoice(payload, state) {
  const choice = payload && payload.choices && payload.choices[0];
  const delta = choice && choice.delta;
  const content = delta && delta.content;
  const reasoning = delta && delta.reasoning_content;
  if (typeof content === 'string' && content) {
    state.full += content;
    state.semanticActivity = true;
  }
  if (typeof reasoning === 'string' && reasoning) state.semanticActivity = true;
}

function addProbeData(raw, state) {
  if (!raw || raw === '[DONE]') return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch { return; } // Ignore keep-alive and unknown frames.

  if (payload && payload.error) {
    state.streamError = makeAIError(
      typeof payload.error === 'string' ? payload.error : (payload.error.message || 'upstream error'),
      payload.status,
      payload,
    );
    return;
  }
  addProbeChoice(payload, state);
}

function processProbeFrame(frame, state) {
  const { eventName, data } = splitProbeFrame(frame);
  if (eventName === 'error' && data.length) {
    state.streamError = parseProbeError(data.join('\n'));
    return;
  }
  if (SEMANTIC_EVENTS.has(eventName)) {
    state.semanticActivity = true;
    return;
  }
  data.forEach((raw) => addProbeData(raw, state));
}

function failedProbe(error, semanticActivity) {
  return { kind: 'failure', error, semanticActivity };
}

async function consumeProbeResponse(response) {
  const state = { full: '', semanticActivity: false, streamError: null };
  if (!response.body || !response.body.getReader) {
    return failedProbe(makeAIError('no stream body'), false);
  }

  let reader = null;
  try {
    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split >= 0) {
        processProbeFrame(buffer.slice(0, split), state);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf('\n\n');
      }
    }
    try { reader.releaseLock(); }
    catch (error) { reportSwallow(error, 'chat/api.probe.releaseReader'); }
    reader = null;
    buffer += decoder.decode();
    if (buffer && buffer.indexOf('data:') >= 0) processProbeFrame(buffer, state);
  } catch (error) {
    return failedProbe(error, state.semanticActivity);
  } finally {
    if (reader) {
      try { await reader.cancel(); }
      catch (error) { reportSwallow(error, 'chat/api.probe.cancelReader'); }
      try { reader.releaseLock(); }
      catch (error) { reportSwallow(error, 'chat/api.probe.releaseFailedReader'); }
    }
  }

  if (state.streamError) return failedProbe(state.streamError, state.semanticActivity);
  if (!state.full) return failedProbe(makeAIError('empty or malformed stream'), state.semanticActivity);
  return {
    kind: 'success',
    result: { text: state.full, html: null, widgets: [], cancelled: false },
  };
}

async function runProbeAttempt(messages, maxTokens, retryOptions) {
  const controller = new AbortController();
  const unbind = bindAbortSignal(retryOptions.signal, controller);
  try {
    const response = await apiFetchRaw('/api/chat/stream', {
      method: 'POST',
      body: buildChatRequestBody(messages, maxTokens, 0.2),
      signal: controller.signal,
    });
    const outcome = await consumeProbeResponse(response);
    if (outcome.kind === 'failure'
        && (isUserAbort(outcome.error, retryOptions.signal) || isUserAbort(outcome.error, controller.signal))) {
      return { kind: 'cancelled' };
    }
    return outcome;
  } catch (error) {
    if (isUserAbort(error, retryOptions.signal) || isUserAbort(error, controller.signal)) {
      return { kind: 'cancelled' };
    }
    return failedProbe(error, false);
  } finally {
    if (unbind) unbind();
  }
}

/* Non-streaming probe for tool detection: accumulate privately and only
   expose a complete answer. Probe retries stop after semantic activity. */
export async function callAPIChat(messages, maxTokens, options) {
  const retryOptions = Object.assign({}, options || {}, { source: 'probe' });
  if (!window.getActiveProvider()) {
    setLastCallError('no provider');
    return null;
  }
  setLastCallError(null);

  const maxAttempts = retryOptions.maxRetries == null
    ? AI_MAX_ATTEMPTS
    : Math.max(0, retryOptions.maxRetries) + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = await runProbeAttempt(messages, maxTokens, retryOptions);
    if (outcome.kind === 'success') return outcome.result;
    if (outcome.kind === 'cancelled') {
      setLastCallError('request cancelled');
      return null;
    }

    lastError = outcome.error;
    if (!outcome.semanticActivity) {
      try {
        if (await waitForRetry(attempt, lastError, retryOptions)) continue;
      } catch (error) {
        if (isAbortError(error) && isUserAbort(error, retryOptions.signal)) {
          setLastCallError('request cancelled');
          return null;
        }
        lastError = error;
      }
    }
    setLastCallError(errorMessage(lastError, 'probe request failed'));
    return null;
  }

  setLastCallError(errorMessage(lastError, 'probe request failed'));
  return null;
}
