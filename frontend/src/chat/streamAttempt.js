/* Execute one /api/chat/stream attempt. Request errors, stream errors, and
 * successful results use the same small outcome shape so the caller can own
 * the global retry budget and final cleanup. */
import { apiFetchRaw } from '../util/api.js';
import { buildChatRequestBody } from './api/requestBody.js';
import { consumeSseBuffer } from '../../../packages/core/src/index.ts';
import { createChatTurn } from './turnClient.ts';
import { recoverDetachedTurn } from './detachedTurnRecovery.js';
import { createStreamFrameProcessor, makeStreamError } from './streamFrameProcessor.js';
import { isUserAbort } from './retryPolicy.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

function completed(result) {
  return { kind: 'success', result };
}

function failed() {
  return { kind: 'failure' };
}

function cancelled(result) {
  return { kind: 'cancelled', result };
}

function retry(error) {
  return { kind: 'retry', error };
}

function emptyCancelledResult() {
  return { text: '', html: null, widgets: [], cancelled: true };
}

function cancelledStreamResult(processor) {
  return {
    text: processor.full || '',
    html: processor.formattedHtml && processor.formattedHtml.html || null,
    widgets: processor.formattedHtml && processor.formattedHtml.widgets || [],
    cancelled: true,
  };
}

async function retryOrCancel(context, error) {
  if (await context.waitForRetry(context.attempt, error)) return retry(error);
  if (context.retryWasCancelled()) return cancelled(emptyCancelledResult());
  return null;
}

async function retryThenFail(context, error) {
  const retryOutcome = await retryOrCancel(context, error);
  if (retryOutcome) return retryOutcome;
  context.setLastCallError(error.message || 'stream request failed');
  return failed();
}

function buildRequestBody(context) {
  const body = buildChatRequestBody(context.messages, context.maxTokens, 0.7);
  /* The backend can create or re-bind the detached turn from clientTurn in
     the stream POST itself, avoiding a separate request before generation. */
  try {
    if (context.opts && typeof context.opts.turnId === 'string' && context.opts.turnId) {
      body.turnId = context.opts.turnId;
    } else if (context.opts && context.opts.clientTurn && typeof context.opts.clientTurn.id === 'string') {
      body.clientTurn = context.opts.clientTurn;
    }
  } catch (error) { reportSwallow(error, 'chat/streamAttempt.attachTurn'); }
  return body;
}

async function requestStream(context, signal) {
  try {
    const body = buildRequestBody(context);
    const response = await apiFetchRaw('/api/chat/stream', {
      method: 'POST',
      body,
      signal,
      /* Active answer traffic takes priority over background assets. */
      priority: 'high',
    });
    return { kind: 'response', response };
  } catch (error) {
    const status = error && error.status;
    const aborted = error && (error.name === 'AbortError' || signal.aborted);
    const requestError = makeStreamError(
      aborted
        ? 'request was interrupted'
        : (status ? status + ' ' : 'network: ') + (error && error.message || error),
      status,
      error && error.body,
    );
    requestError.code = error && error.code;
    requestError.reason = signal.reason;
    if (isUserAbort(error, signal) || isUserAbort(error, context.turnSignal)) {
      return cancelled(emptyCancelledResult());
    }
    const retryOutcome = await retryOrCancel(context, requestError);
    if (retryOutcome) return retryOutcome;
    console.error('[API stream] request failed:', error);
    context.setLastCallError(requestError.message);
    return failed();
  }
}

async function handleNoStreamBody(context) {
  const error = makeStreamError('no stream body');
  const retryOutcome = await retryOrCancel(context, error);
  if (retryOutcome) return retryOutcome;
  context.setLastCallError(error.message);
  return failed();
}

async function recoverAfterReadError(error, processor, context) {
  if (isUserAbort(error, context.attemptSignal) || isUserAbort(error, context.turnSignal)) return null;

  let turnId = context.activeTurn.current;
  if (!turnId && context.opts && context.opts.clientTurn && typeof context.opts.clientTurn.id === 'string') {
    try {
      const existing = await createChatTurn({ clientTurnId: context.opts.clientTurn.id });
      if (existing && existing.turn && existing.turn.id) turnId = existing.turn.id;
    } catch (caught) { reportSwallow(caught, 'chat/stream.createChatTurn'); }
  }
  if (!turnId) return null;

  try {
    console.info('[API stream] connection dropped, recovering from detached turn:', turnId);
    return await recoverDetachedTurn(turnId, {
      currentFull: processor.full,
      onDelta: context.onDelta,
      onThinking: context.onThinking,
      opts: context.opts,
      signal: context.turnSignal,
    });
  } catch (caught) {
    console.warn('[API stream] detached recovery failed:', caught);
    return null;
  }
}

function isSilentAbort(error, processor, context) {
  return isUserAbort(error, context.attemptSignal)
    || isUserAbort(error, context.turnSignal)
    || (!processor.semanticActivity
      && (!context.attemptSignal.reason || context.attemptSignal.reason === 'user-stop'));
}

async function handleAbortReadError(error, reader, processor, context) {
  /* Retry transport interruptions only before visible or side-effectful
     output; replaying an active turn would duplicate text and tool calls. */
  const attemptError = makeStreamError('stream was interrupted before it completed');
  attemptError.reason = context.attemptSignal.reason;
  if (!isUserAbort(error, context.attemptSignal)
      && !isUserAbort(error, context.turnSignal)
      && !processor.semanticActivity) {
    const retryOutcome = await retryOrCancel(context, attemptError);
    if (retryOutcome) {
      if (retryOutcome.kind === 'retry') {
        console.warn('[API stream]', attemptError.message + ', retrying before visible output');
        try { await reader.cancel(); } catch (caught) { reportSwallow(caught, 'chat/streamAttempt.cancelRetryReader'); }
        try { reader.releaseLock(); } catch (caught) { reportSwallow(caught, 'chat/streamAttempt.releaseRetryReader'); }
      }
      return retryOutcome;
    }
  }

  /* A Stop or lifecycle abort returns partial text without creating an
     error banner. The fallback supports browsers that omit abort reasons. */
  if (isSilentAbort(error, processor, context)) return cancelled(cancelledStreamResult(processor));
  context.setLastCallError(context.lastError || attemptError.message);
  return null;
}

async function handleReadError(error, reader, processor, context) {
  console.error('[API stream] read error:', error);
  const isAbort = error && (error.name === 'AbortError' || error.code === 20);
  if (isAbort) {
    const outcome = await handleAbortReadError(error, reader, processor, context);
    if (outcome) return outcome;
  } else {
    context.setLastCallError(String(error && error.message || error));
  }

  const recovered = await recoverAfterReadError(error, processor, context);
  if (recovered) return completed(recovered);
  return failed();
}

async function consumeStream(reader, processor) {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let bytesReceived = 0;
  let gotAnyData = false;

  try {
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      bytesReceived += step.value.byteLength;
      gotAnyData = gotAnyData || step.value.byteLength > 0;
      buffer += decoder.decode(step.value, { stream: true });
      buffer = consumeSseBuffer(buffer, processor.processFrame);
    }
    /* Return the HTTP/2 stream slot to the browser connection pool. */
    try { reader.releaseLock(); }
    catch (error) { reportSwallow(error, 'chat/streamAttempt.releaseReader'); }
    buffer += decoder.decode();
    /* A server may close without its final SSE delimiter. */
    if (buffer && buffer.indexOf('data:') >= 0) processor.processFrame(buffer);
    processor.finish();
    return { bytesReceived, gotAnyData, error: null };
  } catch (error) {
    return { bytesReceived, gotAnyData, error };
  }
}

function cancelResponseBody(body) {
  try {
    if (body.cancel) {
      body.cancel().catch((error) => reportSwallow(error, 'chat/streamAttempt.cancelReject'));
    }
  } catch (error) { reportSwallow(error, 'chat/streamAttempt.cancelGuard'); }
}

async function finishStreamResponse(processor, stream, context) {
  if (processor.streamError) {
    if (!processor.semanticActivity) return retryThenFail(context, processor.streamError);
    context.setLastCallError(processor.streamError.message || 'stream request failed');
    return failed();
  }

  if (!processor.full && !processor.formattedHtml) {
    const message = stream.gotAnyData
      ? 'empty stream (server returned no content)'
      : 'empty stream (' + stream.bytesReceived + ' bytes received)';
    const error = makeStreamError(message);
    const outcome = await retryThenFail(context, error);
    if (outcome.kind === 'retry' && !stream.gotAnyData) {
      console.warn('[API stream]', error.message + ', retrying');
    }
    return outcome;
  }

  return completed({
    text: processor.full,
    html: processor.formattedHtml && processor.formattedHtml.html || null,
    widgets: processor.formattedHtml && processor.formattedHtml.widgets || [],
    cancelled: false,
  });
}

async function readStreamResponse(response, context) {
  if (!response.body || !response.body.getReader) return handleNoStreamBody(context);

  const reader = response.body.getReader();
  const processor = createStreamFrameProcessor({
    opts: context.opts,
    onDelta: context.onDelta,
    onThinking: context.onThinking,
    onActiveTurnBound: (turnId) => { context.activeTurn.current = turnId; },
  });
  const stream = await consumeStream(reader, processor);
  if (stream.error) return handleReadError(stream.error, reader, processor, context);
  cancelResponseBody(response.body);
  return finishStreamResponse(processor, stream, context);
}

export async function runStreamAttempt(context) {
  const attemptController = new AbortController();
  const unbindAttempt = context.bindAttemptSignal(attemptController);
  context.attemptSignal = attemptController.signal;
  const activeAbortHandle = (reason) => {
    try { context.turnController.abort(reason); }
    catch (error) { reportSwallow(error, 'chat/streamAttempt.abortTurn'); }
    try { attemptController.abort(reason); }
    catch (error) { reportSwallow(error, 'chat/streamAttempt.abortAttempt'); }
  };
  window._activeChatAbort = activeAbortHandle;
  context.onAbortHandle(activeAbortHandle);

  try {
    const request = await requestStream(context, attemptController.signal);
    if (request.kind !== 'response') return request;
    return await readStreamResponse(request.response, context);
  } finally {
    unbindAttempt();
  }
}
