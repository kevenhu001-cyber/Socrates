/**
 * runChatStreamPipeline — the chat stream orchestrator.
 *
 * It owns only the lifecycle around the stages:
 *   1. streamSetup.ts        SSE headers/prime/keepalive, initial user row
 *   2. turn binding          checkpoint, interrupt polling, watchdog, close
 *   3. toolLoop.ts           upstream hops + tool dispatch + usage
 *   4. finalizeTurn.ts       abort paths, persistence, usage, DONE
 */
import { reduceTurnEvent } from '@socrates/core/turnRuntime';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { chatTurns, sessions } from '../../../db/schema/index.js';
import {
  publishChatTurnEvent,
  subscribeToChatTurn,
  withChatTurnExecution,
} from '../../../services/core/chatTurns.js';
import { createTurnEventController } from '../../../services/turnEvents.js';
import { createTurnActivityController } from '../../../services/turnActivity.js';
import { estimateMessageTokens } from '../../../services/core/usageTracker.js';
import { createChatTiming } from '../../../lib/chatTiming.js';
import { trackSseConnection } from '../../../lib/sse.js';
import { SseEmitter } from './sseEmitter.js';
import { createStreamToolContext } from './toolContext.js';
import {
  createTurnWatchdog,
  turnWatchdogLimits,
  watchdogAbortReason,
  watchdogExpiryFromReason,
  WATCHDOG_CHECK_INTERVAL_MS,
} from '../../../lib/turnWatchdog.js';
import { resolveErrorLocale } from '../../../lib/errorMessages.js';
import { startSseStream } from './streamSetup.js';
import { persistInitialUserMessage } from './initialUserMessage.js';
import { contentText, requestMessages } from './requestBody.js';
import type { ChatStreamPipelineContext } from './types.js';
import { runToolLoop } from './toolLoop.js';
import { finalizeTurn } from './finalizeTurn.js';
import {
  accumulatedProviderUsage as readAccumulatedProviderUsage,
  createToolLoopState,
} from './turnState.js';

export async function runChatStreamPipeline(ctx: ChatStreamPipelineContext): Promise<void> {
  if (ctx.turnId && !ctx.executionClaimed) {
    return withChatTurnExecution(ctx.req.userId!, ctx.turnId, (signal) =>
      runChatStreamPipeline({ ...ctx, executionSignal: signal, executionClaimed: true }),
    );
  }
  let cleanup = () => {};
  try {
    await executeChatStreamPipeline(ctx, (release) => {
      cleanup = release;
    });
  } finally {
    cleanup();
  }
}

async function executeChatStreamPipeline(
  ctx: ChatStreamPipelineContext,
  registerCleanup?: (release: () => void) => void,
): Promise<void> {
  const { req, res, prep, sessionIdFromQuery, projectIdFromBody, turnId } = ctx;
  // The route starts timing before auth/preparation. Reasoning and answer
  // text have separate first-output milestones; SSE padding counts as neither.
  const timing = ctx.timing ?? createChatTiming();
  const reportTtfb = (kind: 'content' | 'reasoning') => {
    if (!timing.mark(`first_${kind}`)) return;
    console.log(
      '[chat-latency]',
      JSON.stringify({ turnId: turnId || null, kind, milestonesMs: timing.snapshot() }),
    );
  };
  const {
    messages: finalMessages,
    provider,
    safeExtraBody,
    mode,
    temperature,
    maxTokens,
    reasoning_effort,
    responseSpeed,
  } = prep.payload;
  /* prefer the tool context the route shell started
     alongside ownership/turn/prep; direct pipeline callers (tests) that
     did not supply one fall back to creating it here, giving up only
     the overlap. Either way it is awaited before the first hop, and a
     rejection propagates identically. */
  const toolCtxPromise =
    ctx.toolCtxPromise ??
    (() => {
      const p = createStreamToolContext(req, mode, reasoning_effort);
      p.catch(() => {});
      return p;
    })();

  startSseStream({ res, app: req.app, ssePrimed: ctx.ssePrimed });

  persistInitialUserMessage({ req, sessionId: sessionIdFromQuery, turnId: turnId ?? null });

  const toolState = createToolLoopState();
  /* Token accounting — the chars/4 estimate is the fallback. The
     authoritative numbers come from the provider's `usage` frame, which
     `stream_options.include_usage` now asks for (see services/core/llm.ts).
     The tool loop accumulates it across upstream hops. */
  const promptTokens = estimateMessageTokens(finalMessages);

  const abortController = new AbortController();
  if (ctx.executionSignal) {
    if (ctx.executionSignal.aborted) abortController.abort(ctx.executionSignal.reason);
    else
      ctx.executionSignal.addEventListener(
        'abort',
        () => abortController.abort(ctx.executionSignal!.reason),
        { once: true },
      );
  }
  /* the SSE route is exempt from the request timeout
     (a reasoning model may think for minutes), which also meant a turn
     that produced NOTHING had no server-side deadline: the request never
     finished, the turn row stayed `running`, and the user waited on a
     socket that would never answer.
     The watchdog bounds two things: silence (no content, no reasoning,
     no tool event, no new upstream hop) and total wall clock. A turn that
     is producing something is never cut off. */
  const watchdog = createTurnWatchdog(turnWatchdogLimits());
  const errorLocale = resolveErrorLocale(req.headers);
  let streamCompleted = false; // prevents close handler from overwriting cleared streaming_text
  /* M1 async — when a turn is bound, socket close detaches the SSE feed
   * instead of cancelling the run: the upstream LLM keeps going, frames
   * keep landing in chat_turn_events, and the client re-attaches with
   * ?after=. Without a turn binding the legacy behaviour stands (abort). */
  let sseDetached = false;

  let unsubscribeTurn: (() => void) | null = null;
  if (turnId) {
    unsubscribeTurn = subscribeToChatTurn(turnId, (event) => {
      if (event.event === 'turn_interrupted') {
        abortController.abort('turn_interrupted');
      }
    });
  }

  /* Throttled turn checkpoint: fullText/fullReasoning are mirrored onto
   * the turn row so a re-attaching client can bootstrap without replaying
   * thousands of delta events. Tool deltas/progress stay SSE-only (write
   * amplification); tool_use/tool_result boundaries are persisted. */
  let turnCheckpointTimer: ReturnType<typeof setInterval> | null = null;
  const checkpointTurn = () => {
    if (!turnId) return;
    const db = getDb();
    db.update(chatTurns)
      .set({
        fullText: toolState.fullText || null,
        fullReasoning: toolState.fullReasoning || null,
        turnRuntime: toolState.turnRuntime,
        updatedAt: new Date(),
      })
      .where(eq(chatTurns.id, turnId))
      .catch(() => {});
  };
  /* M2 Stop semantics: closing the socket detaches (network drop keeps
   * running), while an explicit Stop goes through POST
   * /api/chat-turns/:id/interrupt which flips the row. The worker polls
   * the row on the checkpoint cadence and aborts the upstream call when
   * the user asked to stop. */
  const maybeAbortIfInterrupted = async () => {
    if (!turnId || abortController.signal.aborted) return;
    try {
      const db = getDb();
      const [row] = await db
        .select({ status: chatTurns.status })
        .from(chatTurns)
        .where(eq(chatTurns.id, turnId))
        .limit(1);
      if (row?.status === 'interrupted') {
        abortController.abort('turn_interrupted');
      }
    } catch {
      /* empty-catch: intentional — a failed interrupt poll must not kill the live stream */
    }
  };
  const clearTurnTimer = () => {
    if (turnCheckpointTimer) {
      clearInterval(turnCheckpointTimer);
      turnCheckpointTimer = null;
    }
    unsubscribeTurn?.();
  };
  /* the interval only flips the abort signal; the
     upstream call then fails on its own and the normal error path writes
     the error frame. `unref` keeps the timer from holding the process
     open if the pipeline unwinds early. */
  const watchdogTimer = setInterval(() => {
    if (abortController.signal.aborted) return;
    const expiry = watchdog.expiry();
    if (!expiry) return;
    console.warn('[chat/stream] turn watchdog fired:', expiry, {
      turnId: turnId || null,
      idleMs: watchdog.idleMs(),
      elapsedMs: watchdog.elapsedMs(),
    });
    abortController.abort(watchdogAbortReason(expiry));
  }, WATCHDOG_CHECK_INTERVAL_MS);
  watchdogTimer.unref?.();
  /* One registration for both timers: the pipeline's cleanup hook keeps a
   * single release function, so registering twice would drop the first. */
  registerCleanup?.(() => {
    clearTurnTimer();
    clearInterval(watchdogTimer);
  });

  const onResponseClose = () => {
    trackSseConnection(req.app, -1);
    if (res.writableEnded) return;
    if (turnId) {
      // Detached mode: keep the run alive, drop only the socket feed.
      sseDetached = true;
      checkpointTurn();
      return;
    }
    if (!abortController.signal.aborted) {
      abortController.abort('client_disconnected');
    }
    // save partial content when client
    // disconnects mid-stream so a reload can resume / retry.
    // Only save if the stream did NOT complete normally (the
    // normal completion path clears streaming_text itself).
    if (!streamCompleted && sessionIdFromQuery && (toolState.fullText || toolState.fullReasoning)) {
      const db = getDb();
      db.update(sessions)
        .set({
          streamingText: toolState.fullText || null,
          streamingReasoning: toolState.fullReasoning || null,
        })
        .where(and(eq(sessions.id, sessionIdFromQuery), eq(sessions.userId, req.userId!)))
        .catch((err) =>
          console.error('[chat/stream] save streaming text on close failed:', err.message),
        );
    }
  };
  // The request body can finish before a single response byte is generated.
  if (res.destroyed) onResponseClose();
  else res.once('close', onResponseClose);

  const emitter = new SseEmitter(
    res,
    () => abortController.signal.aborted || sseDetached,
    errorLocale,
  );
  /* M1 async — mirror lifecycle frames into the bound turn. Content and
   * reasoning deltas are persisted per-chunk (they are the resume
   * baseline); tool_use/tool_result/agent frames mark boundaries;
   * high-frequency progress/deltas stay SSE-only. All taps are
   * fire-and-forget so a slow DB never stalls the live stream. */
  if (turnId) {
    /* Coalesce high-frequency content/reasoning chunks so a 500-token response
     * commits ~5–15 batched PG transactions instead of 500 row-lock bursts,
     * while flushing synchronously before boundaries to keep strict order. */
    const DELTA_FLUSH_MS = 180;
    const DELTA_FLUSH_CHARS = 512;
    let pendingKind: 'content' | 'reasoning' | null = null;
    let pendingDelta = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPendingDeltas = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!pendingKind || !pendingDelta) return;
      const event = pendingKind;
      const delta = pendingDelta;
      pendingKind = null;
      pendingDelta = '';
      publishChatTurnEvent(turnId, event, { delta }).catch(() => {});
    };

    const queueDelta = (kind: 'content' | 'reasoning', chunk: string) => {
      if (!chunk) return;
      if (pendingKind && pendingKind !== kind) flushPendingDeltas();
      pendingKind = kind;
      pendingDelta += chunk;
      if (pendingDelta.length >= DELTA_FLUSH_CHARS) {
        flushPendingDeltas();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushPendingDeltas, DELTA_FLUSH_MS);
        flushTimer.unref?.();
      }
    };

    const tap = (event: string, data: Record<string, unknown>) => {
      flushPendingDeltas();
      publishChatTurnEvent(turnId, event, data).catch(() => {});
    };
    const innerContent = emitter.content.bind(emitter);
    emitter.content = (chunk: string) => {
      innerContent(chunk);
      queueDelta('content', chunk);
    };
    const innerReasoning = emitter.reasoning.bind(emitter);
    emitter.reasoning = (reasoning: string) => {
      innerReasoning(reasoning);
      queueDelta('reasoning', reasoning);
    };
    const innerEvent = emitter.event.bind(emitter);
    emitter.event = (name: string, data: unknown) => {
      innerEvent(name, data);
      if (
        name === 'turn_event' ||
        name === 'tool_use' ||
        name === 'tool_result' ||
        name === 'tool_approval' ||
        name === 'agent_step' ||
        name === 'agent_plan' ||
        name === 'execution_start' ||
        name === 'error'
      ) {
        tap(name, (data ?? {}) as Record<string, unknown>);
        if (name !== 'turn_event') checkpointTurn();
      }
    };
    const innerFinish = emitter.finish.bind(emitter);
    emitter.finish = () => {
      innerFinish();
      tap('turn_done', { fullTextLength: toolState.fullText.length });
    };
    const innerFatal = emitter.fatal.bind(emitter);
    emitter.fatal = (err: Error) => {
      innerFatal(err);
      tap('turn_failed', { error: err.message });
    };
    /* Tell the client which turn it is bound to, so it can re-attach after
       a reload (clients that created the turn themselves already know; older
       clients ignore an unknown event). */
    emitter.event('turn_bound', { turnId });
    // Execution was already claimed before any pipeline side effects.
    publishChatTurnEvent(turnId, 'turn_started', {
      sessionId: sessionIdFromQuery,
      model: provider.model,
    }).catch(() => {});
    turnCheckpointTimer = setInterval(() => {
      flushPendingDeltas();
      checkpointTurn();
      void maybeAbortIfInterrupted();
    }, 2000);
    turnCheckpointTimer.unref?.();
    const prevClearTurnTimer = clearTurnTimer;
    registerCleanup?.(() => {
      flushPendingDeltas();
      prevClearTurnTimer();
      clearInterval(watchdogTimer);
    });
  }

  /* Read the question only to choose the completed activity summary language. */
  const rawUserMsgs = requestMessages(req.body as unknown);
  let userPrompt = '';
  for (let i = rawUserMsgs.length - 1; i >= 0; i--) {
    if (rawUserMsgs[i].role === 'user') {
      const rawText = rawUserMsgs[i].rawText;
      userPrompt =
        typeof rawText === 'string' && rawText ? rawText : contentText(rawUserMsgs[i].content);
      break;
    }
  }
  /* The model's real thinking content streams directly; do not emit synthetic upfront summaries. */

  const activityStartedAt = Date.now();
  const turnEvents = createTurnEventController((value) => {
    toolState.turnRuntime = reduceTurnEvent(toolState.turnRuntime, value);
    emitter.event('turn_event', value);
  }, turnId || undefined);
  const activity = createTurnActivityController((value) => {
    emitter.event('turn_activity', value);
    turnEvents.activity(value);
  });
  const emitFatal = emitter.fatal.bind(emitter);
  emitter.fatal = (error) => {
    const expiry = watchdogExpiryFromReason(abortController.signal.reason);
    turnEvents.done(
      abortController.signal.aborted && !expiry ? 'stopped' : 'failed',
      Date.now() - activityStartedAt,
    );
    emitFatal(error);
  };
  const uiInputs = new Map<string, unknown>();
  const emitEvent = emitter.event.bind(emitter);
  emitter.event = (name, data) => {
    emitEvent(name, data);
    /* a tool event is progress: the turn is doing
     * something, so the idle budget must not fire while it works. */
    if (name === 'tool_use' || name === 'tool_result') watchdog.touch();
    if (name === 'tool_use') {
      for (const call of (Array.isArray(data) ? data : [data]) as Array<{
        id: string;
        name: string;
        input: unknown;
      }>) {
        if (call?.name === 'render_intelligent_ui') uiInputs.set(call.id, call.input);
      }
    }
    if (name === 'tool_result' && data && typeof data === 'object') {
      const result = data as { id: string; ok?: boolean; status?: string };
      if (result.status !== 'awaiting_approval') {
        turnEvents.toolResult(
          result.id,
          result.ok !== false &&
            !['failed', 'error', 'stopped', 'cancelled'].includes(result.status || ''),
          uiInputs.get(result.id),
          toolState.fullText.length,
        );
      }
    }
  };
  activity.thinking();

  const outcome = await runToolLoop({
    req,
    emitter,
    timing,
    watchdog,
    abortController,
    turnId: turnId ?? null,
    sessionIdFromQuery,
    projectIdFromBody,
    provider,
    finalMessages,
    safeExtraBody,
    mode,
    temperature,
    maxTokens,
    reasoning_effort,
    responseSpeed,
    toolCtxPromise,
    turnEvents,
    activity,
    state: toolState,
    promptTokens,
    reportTtfb,
    checkpointTurn,
    clearTurnTimer,
  });

  if (outcome === 'failed') return;

  await finalizeTurn({
    req,
    emitter,
    turnEvents,
    activity,
    abortController,
    turnId: turnId ?? null,
    sessionIdFromQuery,
    provider,
    userPrompt,
    fullText: toolState.fullText,
    fullReasoning: toolState.fullReasoning,
    turnRuntime: toolState.turnRuntime,
    executedToolCalls: toolState.executedToolCalls,
    promptTokens,
    completionTokens: toolState.completionTokens,
    sawProviderUsage: toolState.sawProviderUsage,
    accumulatedProviderUsage: () => readAccumulatedProviderUsage(toolState),
    clearTurnTimer,
    checkpointTurn,
    onStreamCompleted: () => {
      streamCompleted = true;
    },
    activityStartedAt,
  });
  if (abortController.signal.aborted && !sseDetached && !res.writableEnded) res.end();
}
