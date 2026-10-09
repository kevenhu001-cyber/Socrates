/* Recover a stream whose HTTP connection dropped while its detached
 * server turn continued running. */
import { getChatTurn, subscribeChatTurnEvents } from './turnClient.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

function invoke(callback, args, context) {
  if (typeof callback !== 'function') return;
  try { callback(...args); }
  catch (error) { reportSwallow(error, context); }
}

function abortSubscription(controller, reason, context) {
  try { controller.abort(reason); }
  catch (error) { reportSwallow(error, context); }
}

const EVENT_HANDLERS = new Map([
  ['content', (data, state, context) => {
    if (typeof data.delta !== 'string') return;
    state.full += data.delta;
    invoke(context.onDelta, [data.delta], 'chat/detachedTurnRecovery.onDelta');
  }],
  ['reasoning', (data, _state, context) => {
    if (typeof data.delta === 'string') {
      invoke(context.onThinking, [data.delta], 'chat/detachedTurnRecovery.onThinking');
    }
  }],
  ['tool_use', (data, _state, context) => {
    const calls = Array.isArray(data) ? data : (data.calls || [data]);
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

function applyDetachedTurnFrame(frame, state, context, controller) {
  if (!frame) return;
  try {
    const data = frame.data || {};
    EVENT_HANDLERS.get(frame.event)?.(data, state, context, controller);
    if (typeof frame.sequence === 'number' && frame.sequence > state.maxSeq) {
      state.maxSeq = frame.sequence;
    }
  } catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.applyFrame'); }
}

function isFailedTurn(turn) {
  return turn && (turn.status === 'failed' || turn.status === 'interrupted');
}

function completedTurnResult(turn, state, context, callbackFirst) {
  if (!turn || turn.status !== 'completed') return null;
  const finalText = turn.fullText || state.full;
  if (finalText.length > state.full.length) {
    const remaining = finalText.slice(state.full.length);
    if (callbackFirst) invoke(context.onDelta, [remaining], 'chat/detachedTurnRecovery.onDelta.final');
    state.full = finalText;
    if (!callbackFirst) invoke(context.onDelta, [remaining], 'chat/detachedTurnRecovery.onDelta.remaining');
  }
  return { text: state.full, html: null, widgets: [] };
}

async function pollDetachedTurn(turnId, state, context, controller) {
  for (let attempt = 0; attempt < 30 && !state.done && !state.failed; attempt += 1) {
    if (context.signal && context.signal.aborted) break;

    let snapshot = null;
    try { snapshot = await getChatTurn(turnId); }
    catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.pollCheck'); }
    if (snapshot && snapshot.turn) {
      const completed = completedTurnResult(snapshot.turn, state, context, true);
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
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return state.done ? { text: state.full, html: null, widgets: [] } : null;
}

async function recoverActiveTurn(turnId, state, context, controller) {
  try {
    const initial = await getChatTurn(turnId);
    if (initial && initial.turn) {
      const completed = completedTurnResult(initial.turn, state, context, false);
      if (completed) return completed;
      if (isFailedTurn(initial.turn)) return null;
    }
  } catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.initialCheck'); }
  return pollDetachedTurn(turnId, state, context, controller);
}

export async function recoverDetachedTurn(turnId, context) {
  const state = { full: context.currentFull || '', done: false, failed: false, maxSeq: 0 };
  const controller = new AbortController();
  const signal = context.signal;
  const abortBridge = () => abortSubscription(controller, 'user-abort', 'chat/detachedTurnRecovery.abortBridge');
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener('abort', abortBridge, { once: true });
  }

  try { return await recoverActiveTurn(turnId, state, context, controller); }
  finally {
    if (signal) {
      try { signal.removeEventListener('abort', abortBridge); }
      catch (error) { reportSwallow(error, 'chat/detachedTurnRecovery.removeAbortBridge'); }
    }
  }
}
