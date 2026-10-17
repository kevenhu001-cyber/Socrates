/* Parse SSE frames into chat deltas and typed tool/agent events. The HTTP
 * transport owns retries and reader lifecycle; this module owns the wire
 * protocol and its semantic-output state. */
import { createInlineThinkScanner, type InlineThinkScanner } from './inlineThinkScanner.ts';
import { notifySpeedFallbackOnce } from './speedFallback.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { type ChatApiError } from './api/shared.ts';
import { type StreamCallOptions } from './stream.ts';

const CALLBACK_BY_EVENT: Record<string, string> = Object.freeze({
  tool_use: 'onToolUse',
  tool_result: 'onToolResult',
  tool_approval: 'onToolApproval',
  agent_step: 'onAgentStep',
  agent_plan: 'onAgentPlan',
  tool_progress: 'onToolProgress',
  execution_start: 'onExecutionStart',
  tool_call_delta: 'onToolCallDelta',
  /* Completed observed work, sent before [DONE]. */
  turn_summary: 'onTurnSummary',
  turn_activity: 'onTurnActivity',
  turn_event: 'onTurnEvent',
});

/* The cast stands in for `vite/client` types, which this package does not
   pull in; non-Vite contexts (vitest) leave `env` undefined. */
const DEV = ((typeof import.meta !== 'undefined'
  && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) === true);

/** What the transport hands the frame processor. */
export interface StreamProcessorContext {
  onDelta?: (text: string, full: string) => void;
  onThinking?: (text: string) => void;
  onActiveTurnBound?: (turnId: string) => void;
  opts?: StreamCallOptions | null;
}

interface ProcessorState {
  full: string;
  formattedHtml: Record<string, unknown> | null;
  semanticActivity: boolean;
  streamError: ChatApiError | null;
  hasWarnedMissingThinking: boolean;
  thinkScanner: InlineThinkScanner;
}

function warnBadFrame(eventName: string, error: unknown): void {
  if (!DEV) return;
  try { console.warn('[stream] failed to handle ' + eventName + ' frame:', error && (error as Error).message || error); }
  catch (caught) { reportSwallow(caught, 'chat/streamFrameProcessor.warnBadFrame'); }
}

/* Keep the same error shape for request failures and structured SSE errors. */
export function makeStreamError(
  message: unknown,
  status?: unknown,
  body?: Record<string, unknown> | null,
): ChatApiError {
  const error = new Error(String(message || 'stream request failed')) as ChatApiError;
  if (status != null) error.status = Number(status);
  if (body != null) error.body = body;
  if (body && (body as { code?: string }).code) error.code = (body as { code: string }).code;
  return error;
}

interface ParsedFrame {
  eventName: string | null;
  dataParts: string[];
}

function parseFrame(frame: string): ParsedFrame {
  const lines = frame.split('\n');
  const dataParts: string[] = [];
  let eventName: string | null = null;
  for (const line of lines) {
    if (line.indexOf('data:') === 0) dataParts.push(line.slice(5).trim());
    else if (line.indexOf('event:') === 0) {
      const event = line.slice(6).trim();
      if (event) eventName = event;
    }
  }
  return { eventName, dataParts };
}

function dispatchCallbackEvent(
  state: ProcessorState,
  context: StreamProcessorContext,
  eventName: string | null,
  dataParts: string[],
): boolean {
  if (!eventName || !Object.prototype.hasOwnProperty.call(CALLBACK_BY_EVENT, eventName)) return false;
  if (eventName !== 'turn_activity' && eventName !== 'turn_event') state.semanticActivity = true;
  const callback = context.opts
    && (context.opts as Record<string, unknown>)[CALLBACK_BY_EVENT[eventName]!];
  if (typeof callback === 'function' && dataParts.length) {
    /* A tool row's text offset must include visible text held for a possible
       split <think> opening tag. */
    if (eventName === 'tool_use') state.thinkScanner.flushVisibleTail();
    try { (callback as (payload: unknown) => void)(JSON.parse(dataParts.join('\n'))); }
    catch (error) { warnBadFrame(eventName, error); }
  }
  return true;
}

function handleTurnBound(context: StreamProcessorContext, dataParts: string[]): void {
  if (!dataParts.length) return;
  try {
    const turn = JSON.parse(dataParts.join('\n'));
    if (!turn || typeof turn.turnId !== 'string') return;
    if (typeof context.onActiveTurnBound === 'function') context.onActiveTurnBound(turn.turnId);
    if (context.opts && typeof context.opts.onTurnBound === 'function') {
      (context.opts.onTurnBound as (turnId: string) => void)(turn.turnId);
    }
  } catch (error) { warnBadFrame('turn_bound', error); }
}

function handlePreferenceFallback(dataParts: string[]): void {
  if (!dataParts.length) return;
  try {
    const fallback = JSON.parse(dataParts.join('\n'));
    if (fallback && fallback.preference === 'response_speed') notifySpeedFallbackOnce();
  } catch (error) { warnBadFrame('preference_fallback', error); }
}

function handleStreamErrorEvent(state: ProcessorState, dataParts: string[]): void {
  try {
    const error = JSON.parse(dataParts.join('\n'));
    state.streamError = makeStreamError(error.error || error.message || JSON.stringify(error), error.status, error);
  } catch (_) {
    state.streamError = makeStreamError(dataParts.join(' ').slice(0, 200));
  }
}

function handleControlEvent(
  state: ProcessorState,
  context: StreamProcessorContext,
  eventName: string | null,
  dataParts: string[],
): boolean {
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

function emitReasoning(state: ProcessorState, context: StreamProcessorContext, reasoning: unknown): void {
  if (typeof reasoning !== 'string' || !reasoning.length) return;
  state.semanticActivity = true;
  if (typeof context.onThinking !== 'function') return;
  try { context.onThinking(reasoning); }
  catch (error) { reportSwallow(error, 'chat/streamFrameProcessor.reasoning'); }
}

function warnMissingThinkingCallback(state: ProcessorState, context: StreamProcessorContext): void {
  if (state.hasWarnedMissingThinking || typeof context.onThinking === 'function'
      || (!state.thinkScanner.isOpen && !state.thinkScanner.hasPendingThought)) return;
  state.hasWarnedMissingThinking = true;
  try {
    console.warn('[API stream] inline <think> detected but caller did not provide onThinking; thinking pill will not light up. Pass an onThinking callback in callAPIStream(...,onThinking,opts).');
  } catch (error) { reportSwallow(error, 'chat/streamFrameProcessor.missingThinkingCallback'); }
}

function emitVisibleDelta(state: ProcessorState, context: StreamProcessorContext, delta: unknown): void {
  if (typeof delta !== 'string' || !delta.length) return;
  state.semanticActivity = true;
  state.thinkScanner.push(delta);
  warnMissingThinkingCallback(state, context);
}

function emitJsonDelta(state: ProcessorState, context: StreamProcessorContext, payload: string): void {
  let message: Record<string, unknown> | null = null;
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

  const messageError = message && (message as { error?: unknown }).error;
  if (messageError) {
    state.streamError = makeStreamError(
      typeof messageError === 'string'
        ? messageError
        : ((messageError as { message?: string })?.message || 'upstream error'),
      (message as { status?: unknown }).status,
      message as Record<string, unknown>,
    );
    return;
  }
  const choices = (message as { choices?: Array<{ delta?: Record<string, unknown> }> })?.choices;
  const delta = choices && choices[0] && choices[0].delta && choices[0].delta.content;
  const rawReasoning = choices && choices[0] && choices[0].delta && (
    choices[0].delta.reasoning_content
    ?? choices[0].delta.reasoning
    ?? choices[0].delta.thinking
  );
  const reasoning = typeof rawReasoning === 'string'
    ? rawReasoning
    : (rawReasoning && typeof rawReasoning === 'object' && typeof (rawReasoning as { text?: unknown }).text === 'string')
      ? (rawReasoning as { text: string }).text
      : '';
  emitReasoning(state, context, reasoning);
  emitVisibleDelta(state, context, delta);
}

function processDataPayload(state: ProcessorState, context: StreamProcessorContext, payload: string): void {
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

function processFrame(state: ProcessorState, context: StreamProcessorContext, frame: string): void {
  const { eventName, dataParts } = parseFrame(frame);
  if (dispatchCallbackEvent(state, context, eventName, dataParts)) return;
  if (handleControlEvent(state, context, eventName, dataParts)) return;
  if (!dataParts.length) return;
  processDataPayload(state, context, dataParts.join('\n'));
}

function finishFrame(state: ProcessorState): void {
  if (state.thinkScanner.finish()) state.semanticActivity = true;
}

export function createStreamFrameProcessor(context: StreamProcessorContext) {
  const state: ProcessorState = {
    full: '',
    formattedHtml: null,
    semanticActivity: false,
    streamError: null,
    hasWarnedMissingThinking: false,
    thinkScanner: null as unknown as InlineThinkScanner,
  };
  state.thinkScanner = createInlineThinkScanner({
    onVisibleText(text: string) {
      state.full += text;
      try { if (context.onDelta) context.onDelta(text, state.full); }
      catch (error) { console.warn('[API stream] onDelta threw:', error && (error as Error).message); }
    },
    onThinking: context.onThinking,
  });

  return {
    processFrame(frame: string) { processFrame(state, context, frame); },
    finish() { finishFrame(state); },
    get full() { return state.full; },
    get formattedHtml() { return state.formattedHtml; },
    get semanticActivity() { return state.semanticActivity; },
    get streamError() { return state.streamError; },
  };
}
