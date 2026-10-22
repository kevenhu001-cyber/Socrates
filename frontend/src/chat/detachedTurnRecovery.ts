/* Recover a stream whose HTTP connection dropped while its detached
 * server turn continued running. */
import { getChatTurn, subscribeChatTurnEvents, type ChatTurn, type TurnEventFrame } from './turnClient.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { abortableDelay } from '../util/abort.ts';

/** Callbacks the recovering stream drives — the same surface stream.js owns. */
export interface DetachedRecoveryContext {
  currentFull?: string;
  signal?: AbortSignal | null;
  onDelta?: ((delta: string) => void) | null;
  onThinking?: ((delta: string) => void) | null;
  opts?: {
    onTurnEvent?: (data: unknown) => void;
    onTurnSnapshot?: (runtime: unknown) => void;
    onToolUse?: (calls: unknown) => void;
    onToolResult?: (result: unknown) => void;
    [key: string]: unknown;
  } | null;
}

interface RecoveryState {
  full: string;
  done: boolean;
  failed: boolean;
  maxSeq: number;
  /** Durable content replay starts at zero; suppress the prefix already shown. */
  replayLength: number;
}

type Snapshot = { turn: ChatTurn; events: TurnEventFrame[] };

function invoke(callback: unknown, args: unknown[], context: string): void {
  if (typeof callback !== 'function') return;
  try { (callback as (...callArgs: unknown[]) => void)(...args); }
  catch (error) { reportSwallow(error, context); }
}

function abortSubscription(controller: AbortController, reason: string, context: string): void {
  try { controller.abort(reason); }
  catch (error) { reportSwallow(error, context); }
}

type FrameHandler = (
  data: unknown,
  state: RecoveryState,
  context: DetachedRecoveryContext,
  controller: AbortController,
) => void;

const EVENT_HANDLERS = new Map<string, FrameHandler>([
  ['turn_event', (data, _state, context) => {
    invoke(context.opts && context.opts.onTurnEvent, [data], 'chat/detachedTurnRecovery.onTurnEvent');
  }],
  ['content', (data, state, context) => {
    const frame = data as { delta?: unknown };
    if (typeof frame.delta !== 'string') return;
    const start = state.replayLength;
    state.replayLength += frame.delta.length;
    const missing = frame.delta.slice(Math.max(0, state.full.length - start));
    if (missing) {
      state.full += missing;
      invoke(context.onDelta, [missing], 'chat/detachedTurnRecovery.onDelta');
    }
  }],
  ['reasoning', (data, _state, context) => {
    const frame = data as { delta?: unknown };
    if (typeof frame.delta === 'string') {
      invoke(context.onThinking, [frame.delta], 'chat/detachedTurnRecovery.onThinking');
    }
  }],
  ['tool_use', (data, _state, context) => {
    const calls = Array.isArray(data) ? data : ((data as { calls?: unknown }).calls || [data]);
    invoke(context.opts && context.opts.onToolUse, [calls], 'chat/detachedTurnRecovery.onToolUse');
  }],
  ['tool_result', (data, _state, context) => {
    invoke(context.opts && context.opts.onToolResult, [data], 'chat/detachedTurnRecovery.onToolResult');
  }],
  ['turn_done', (_data, state, _context, controller) => {
    state.done = true;
    abortSubscription(controller, 'done', 'chat/detachedTurnRecovery.abortDone');
  }],
  ['turn_failed', (_data, state, _context, controller) => {
    state.failed = true;
    abortSubscription(controller, 'failed', 'chat/detachedTurnRecovery.abortFailed');
  }],
]);

function applyDetachedTurnFrame(
  frame: TurnEventFrame | null | undefined,
  state: RecoveryState,
  context: DetachedRecoveryContext,
  controller: AbortController,
): void {
  if (!frame || state.done || state.failed || context.signal?.aborted) return;
  if (!Number.isInteger(frame.sequence) || frame.sequence <= state.maxSeq) return;
  try {
    const data = frame.data || {};
    const handler = EVENT_HANDLERS.get(frame.event);
    if (handler) handler(data, state, context, controller);
    if (typeof frame.sequence === 'number' && frame.sequence > state.maxSeq) {
      state.maxSeq = frame.sequence;
    }
  } catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.applyFrame'); }
}

function isFailedTurn(turn: ChatTurn): boolean {
  return turn.status === 'failed' || turn.status === 'interrupted';
}

function completedTurnResult(
  turn: ChatTurn | null | undefined,
  state: RecoveryState,
  context: DetachedRecoveryContext,
): { text: string; html: null; widgets: never[] } | null {
  if (!turn || turn.status !== 'completed') return null;
  const finalText = turn.fullText || state.full;
  if (finalText.length > state.full.length) {
    const remaining = finalText.slice(state.full.length);
    state.full = finalText;
    invoke(context.onDelta, [remaining], 'chat/detachedTurnRecovery.onDelta.remaining');
  }
  return { text: state.full, html: null, widgets: [] };
}

async function pollDetachedTurn(
  turnId: string,
  state: RecoveryState,
  context: DetachedRecoveryContext,
  controller: AbortController,
): Promise<{ text: string; html: null; widgets: never[] } | null> {
  for (let attempt = 0; attempt < 30 && !state.done && !state.failed; attempt += 1) {
    if (context.signal && context.signal.aborted) break;

    let snapshot: Snapshot | null = null;
    try { snapshot = await getChatTurn(turnId, context.signal); }
    catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.pollCheck'); }
    if (context.signal?.aborted) return null;
    if (snapshot && snapshot.turn) {
      if (snapshot.turn.turnRuntime) {
        invoke(context.opts && context.opts.onTurnSnapshot, [snapshot.turn.turnRuntime], 'chat/detachedTurnRecovery.runtimeSnapshot');
      }
      for (const frame of snapshot.events || []) {
        if (frame.event === 'turn_event') {
          invoke(context.opts && context.opts.onTurnEvent, [frame.data], 'chat/detachedTurnRecovery.snapshot');
        }
      }
      const completed = completedTurnResult(snapshot.turn, state, context);
      if (completed) return completed;
      if (isFailedTurn(snapshot.turn)) return null;
    }

    try {
      await subscribeChatTurnEvents(turnId, state.maxSeq, controller.signal, {
        onEvent: (frame) => applyDetachedTurnFrame(frame, state, context, controller),
      });
    } catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.subscribe'); }

    if (state.done) return { text: state.full, html: null, widgets: [] };
    if (state.failed) return null;
    try { await abortableDelay(800, context.signal); }
    catch { return null; }
  }
  return state.done ? { text: state.full, html: null, widgets: [] } : null;
}

export async function recoverDetachedTurn(
  turnId: string,
  context: DetachedRecoveryContext,
): Promise<{ text: string; html: null; widgets: never[] } | null> {
  const state: RecoveryState = { full: context.currentFull || '', done: false, failed: false, maxSeq: 0, replayLength: 0 };
  const controller = new AbortController();
  const signal = context.signal;
  const abortBridge = () => abortSubscription(controller, 'user-abort', 'chat/detachedTurnRecovery.abortBridge');
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener('abort', abortBridge, { once: true });
  }

  try { return await pollDetachedTurn(turnId, state, context, controller); }
  finally {
    abortSubscription(controller, 'recovery-finished', 'chat/detachedTurnRecovery.cleanup');
    if (signal) {
      try { signal.removeEventListener('abort', abortBridge); }
      catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.removeAbortBridge'); }
    }
  }
}
