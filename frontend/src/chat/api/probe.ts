import { apiFetchRaw } from '../../util/api.ts';
import { getActiveProvider } from '../../config/providerConfig.service.ts';
import { AI_MAX_ATTEMPTS, isUserAbort } from '../retryPolicy.ts';
import type { AIRequestOptions } from '../retryPolicy.ts';
import { buildChatRequestBody } from './requestBody.ts';
import type { ChatRequestMessage } from './requestBody.ts';
import {
  bindAbortSignal,
  errorMessage,
  isAbortError,
  makeAIError,
  setLastCallError,
  waitForRetry,
} from './shared.ts';
import type { ChatApiError } from './shared.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

const SEMANTIC_EVENTS = new Set([
  'tool_use', 'tool_result', 'tool_progress', 'execution_start',
  'tool_call_delta', 'agent_step', 'agent_plan',
]);

/** Shape the probe hands back to the tool-detection callers. */
export interface ProbeResult {
  text: string;
  html: null;
  widgets: never[];
  cancelled: false;
}

interface ProbeState {
  full: string;
  semanticActivity: boolean;
  streamError: ChatApiError | null;
}

interface ProbeFrame {
  eventName: string;
  data: string[];
}

interface ProbePayload {
  choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
  error?: unknown;
  status?: number;
  message?: unknown;
}

type ProbeOutcome =
  | { kind: 'success'; result: ProbeResult }
  | { kind: 'failure'; error: unknown; semanticActivity: boolean }
  | { kind: 'cancelled' };

function parseProbeError(payload: string): ChatApiError {
  let errorData: ProbePayload | null;
  try { errorData = JSON.parse(payload) as ProbePayload; }
  catch { return makeAIError(payload); }
  return makeAIError(
    errorData && (errorData.error || errorData.message) || payload,
    errorData && errorData.status,
    errorData as Record<string, unknown> | null,
  );
}

function splitProbeFrame(frame: string): ProbeFrame {
  const data: string[] = [];
  let eventName = '';
  for (const line of frame.split(/\r?\n/)) {
    if (line.indexOf('event:') === 0) eventName = line.slice(6).trim();
    if (line.indexOf('data:') === 0) data.push(line.slice(5).trim());
  }
  return { eventName, data };
}

function addProbeChoice(payload: ProbePayload | null, state: ProbeState): void {
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

function addProbeData(raw: string, state: ProbeState): void {
  if (!raw || raw === '[DONE]') return;
  let payload: ProbePayload | null;
  try { payload = JSON.parse(raw) as ProbePayload; }
  catch { return; } // Ignore keep-alive and unknown frames.

  if (payload && payload.error) {
    state.streamError = makeAIError(
      typeof payload.error === 'string'
        ? payload.error
        : ((payload.error as { message?: unknown }).message || 'upstream error'),
      payload.status,
      payload as Record<string, unknown>,
    );
    return;
  }
  addProbeChoice(payload, state);
}

function processProbeFrame(frame: string, state: ProbeState): void {
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

function failedProbe(error: unknown, semanticActivity: boolean): ProbeOutcome {
  return { kind: 'failure', error, semanticActivity };
}

async function consumeProbeResponse(response: Response): Promise<ProbeOutcome> {
  const state: ProbeState = { full: '', semanticActivity: false, streamError: null };
  if (!response.body || !response.body.getReader) {
    return failedProbe(makeAIError('no stream body'), false);
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
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

async function runProbeAttempt(
  messages: ChatRequestMessage[],
  maxTokens: number,
  retryOptions: AIRequestOptions,
): Promise<ProbeOutcome> {
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
export async function callAPIChat(
  messages: ChatRequestMessage[],
  maxTokens: number,
  options?: AIRequestOptions,
): Promise<ProbeResult | null> {
  const retryOptions: AIRequestOptions = Object.assign({}, options || {}, { source: 'probe' });
  if (!getActiveProvider()) {
    setLastCallError('no provider');
    return null;
  }
  setLastCallError(null);

  const maxAttempts = retryOptions.maxRetries == null
    ? AI_MAX_ATTEMPTS
    : Math.max(0, retryOptions.maxRetries) + 1;
  let lastError: unknown = null;

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
