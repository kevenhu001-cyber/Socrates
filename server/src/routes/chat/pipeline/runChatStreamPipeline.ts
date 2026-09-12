/**
 * runChatStreamPipeline — the chat stream orchestrator (M2 of the
 * LobeHub-alignment plan).
 *
 * Pipeline stages, in order:
 *   1. SSE lifecycle  — headers, 12/32 KB prime flush, active-connection
 *      metric, keepalive, and the close handler that persists partial
 *      content (P_streaming-survival).
 *   2. Tool context   — turn policy + registry + schemas/examples
 *      (`toolContext.ts`).
 *   3. Tool loop      — one streaming hop per iteration; canonical name
 *      resolution + argument repair; concurrent tool dispatch through
 *      `toolExecutors`; result feedback (`toolFeedback.ts`).
 *   4. Finalisation   — usage recording, streaming_text clear, DONE.
 *
 * Behaviour is a verbatim extraction of the original single-closure
 * handler; the stages only differ in where the closures live.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { chatTurns, sessions } from '../../../db/schema.js';
import { publishChatTurnEvent, setChatTurnStatus } from '../../../services/chatTurns.js';
import { isToolFinishReason, streamChatCompletion } from '../../../services/llm.js';
import {
  normalizeToolCalls,
  repairToolArguments,
  resolveToolName,
  sanitizeToolCallForProtocol,
} from '../../../services/toolCallSafety.js';
import { hashToolArguments } from '../../../services/toolTurnPolicy.js';
import { dispatchToolCalls } from '../../../services/toolDispatch.js';
import { estimateMessageTokens, estimateTokens, recordUsage } from '../../../services/usageTracker.js';
import { trackSseConnection, startSseKeepalive } from '../../../lib/sse.js';
import {
  appendNativeToolContract,
  appendToolRoutingHints,
  prependCodeInterpreterPrompt,
  SSE_PRIME,
} from '../helpers.js';
import { SseEmitter } from './sseEmitter.js';
import { createStreamToolContext } from './toolContext.js';
import { createToolRunner } from './toolExecutors.js';
import type {
  ChatStreamPipelineContext,
  PreparedCall,
  StreamMessage,
  ToolCall,
  ToolCallDelta,
} from './types.js';

export async function runChatStreamPipeline(ctx: ChatStreamPipelineContext): Promise<void> {
  const { req, res, prep, sessionIdFromQuery, projectIdFromBody, turnId } = ctx;
  const { messages: finalMessages, provider, safeExtraBody, mode, temperature, maxTokens, reasoning_effort } = prep.payload;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  /* Prime the stream BEFORE the upstream has anything to say.

     1. `res.flushHeaders()` forces Node to write the response status
        line + headers to the socket immediately. Without this, Express
        buffers the headers until the first body byte arrives from the
        LLM, which on a fast network can be a few hundred ms — the
        browser has painted the page but shows nothing yet, making the
        request look hung.

     2. EdgeOne CDN (~8 KB) and Safari's fetch ReadableStream (~1 KB)
        both apply a first-chunk buffer: they hold the start of the
        body until enough bytes accumulate, then switch to streaming
        mode. A short LLM answer fits entirely inside that buffer, so
        the client receives the whole response in one shot at the end
        — no progressive streaming, no Thinking pill.

        SSE_PRIME (32 KB of `:` comment lines, shared with the
        built-in minimax proxy) overflows both buffers so subsequent
        writes — even one-byte deltas — flow through immediately.
        Comment lines are valid per the SSE spec and ignored by every
        parser, including ours. */
  try {
    res.flushHeaders();
    res.write(SSE_PRIME);
    try { (res as { flush?: () => void }).flush?.(); } catch {}
  } catch { /* socket already closed — the req.on('close') guard below handles it */ }

  /* P_sse-metrics — bump the active-connection counter so the
     /api/health endpoint can report how many SSE streams are open
     right now. The close handler (set below) decrements on any
     disconnect, including client aborts mid-stream. */
  trackSseConnection(req.app, +1);

  /* SSE keepalive — periodic `:keepalive` comment so the reverse proxy
     doesn't idle-kill the upstream while a reasoning model is
     thinking (60–120 s silences are common). The helper emits one
     comment immediately (so a slow first chunk doesn't look like a
     hang to nginx / EdgeOne) and self-cleans on res close/finish/
     error, so the explicit clearInterval(heartbeat) calls scattered
     through this route are no longer needed. */
  startSseKeepalive(res, { intervalMs: 10_000 });

  let fullText = '';
  let fullReasoning = '';  // P_streaming-survival
  /* Token accounting — compute prompt tokens once from the
     incoming messages, then increment completion tokens as
     chunks arrive. On done/error, persist a usage event into
     `usage_events` so the heatmap has data to draw. */
  const promptTokens = estimateMessageTokens(finalMessages);
  let completionTokens = 0;

  const abortController = new AbortController();
  let streamCompleted = false;  // P_streaming-survival — prevents close handler from overwriting cleared streaming_text
  /* M1 async — when a turn is bound, socket close detaches the SSE feed
   * instead of cancelling the run: the upstream LLM keeps going, frames
   * keep landing in chat_turn_events, and the client re-attaches with
   * ?after=. Without a turn binding the legacy behaviour stands (abort). */
  let sseDetached = false;

  /* Throttled turn checkpoint: fullText/fullReasoning are mirrored onto
   * the turn row so a re-attaching client can bootstrap without replaying
   * thousands of delta events. Tool deltas/progress stay SSE-only (write
   * amplification); tool_use/tool_result boundaries are persisted. */
  let turnCheckpointTimer: ReturnType<typeof setInterval> | null = null;
  const checkpointTurn = () => {
    if (!turnId) return;
    const db = getDb();
    db.update(chatTurns)
      .set({ fullText: fullText || null, fullReasoning: fullReasoning || null, updatedAt: new Date() })
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
      if (row && row.status === 'interrupted') {
        abortController.abort('turn_interrupted');
      }
    } catch { /* a failed poll must not kill the stream */ }
  };
  const clearTurnTimer = () => {
    if (turnCheckpointTimer) {
      clearInterval(turnCheckpointTimer);
      turnCheckpointTimer = null;
    }
  };

  req.on('close', () => {
    trackSseConnection(req.app, -1);
    if (turnId) {
      // Detached mode: keep the run alive, drop only the socket feed.
      sseDetached = true;
      checkpointTurn();
      return;
    }
    if (!abortController.signal.aborted) {
      abortController.abort('client_disconnected');
    }
    // P_streaming-survival — save partial content when client
    // disconnects mid-stream so a reload can resume / retry.
    // Only save if the stream did NOT complete normally (the
    // normal completion path clears streaming_text itself).
    if (!streamCompleted && sessionIdFromQuery && (fullText || fullReasoning)) {
      const db = getDb();
      db.update(sessions)
        .set({
          streamingText: fullText || null,
          streamingReasoning: fullReasoning || null,
        })
        .where(and(eq(sessions.id, sessionIdFromQuery), eq(sessions.userId, req.userId!)))
        .catch((err) => console.error('[chat/stream] save streaming text on close failed:', err.message));
    }
  });

  const emitter = new SseEmitter(res, () => abortController.signal.aborted || sseDetached);
  /* M1 async — mirror lifecycle frames into the bound turn. Content and
   * reasoning deltas are persisted per-chunk (they are the resume
   * baseline); tool_use/tool_result/agent frames mark boundaries;
   * high-frequency progress/deltas stay SSE-only. All taps are
   * fire-and-forget so a slow DB never stalls the live stream. */
  if (turnId) {
    const tap = (event: string, data: Record<string, unknown>) => {
      publishChatTurnEvent(turnId, event, data).catch(() => {});
    };
    const innerContent = emitter.content.bind(emitter);
    emitter.content = (chunk: string) => {
      innerContent(chunk);
      tap('content', { delta: chunk });
    };
    const innerReasoning = emitter.reasoning.bind(emitter);
    emitter.reasoning = (reasoning: string) => {
      innerReasoning(reasoning);
      tap('reasoning', { delta: reasoning });
    };
    const innerEvent = emitter.event.bind(emitter);
    emitter.event = (name: string, data: unknown) => {
      innerEvent(name, data);
      if (
        name === 'tool_use' ||
        name === 'tool_result' ||
        name === 'tool_approval' ||
        name === 'agent_step' ||
        name === 'agent_plan' ||
        name === 'execution_start' ||
        name === 'error'
      ) {
        tap(name, (data ?? {}) as Record<string, unknown>);
        checkpointTurn();
      }
    };
    const innerFinish = emitter.finish.bind(emitter);
    emitter.finish = () => {
      innerFinish();
      tap('turn_done', { fullTextLength: fullText.length });
    };
    const innerFatal = emitter.fatal.bind(emitter);
    emitter.fatal = (err: Error) => {
      innerFatal(err);
      tap('turn_failed', { error: err.message });
    };
    await setChatTurnStatus(turnId, 'running').catch(() => {});
    await publishChatTurnEvent(turnId, 'turn_started', {
      sessionId: sessionIdFromQuery,
      model: provider.model,
    }).catch(() => {});
    turnCheckpointTimer = setInterval(() => {
      checkpointTurn();
      void maybeAbortIfInterrupted();
    }, 2000);
    turnCheckpointTimer.unref?.();
  }
  const writeSse = (payload: string) => emitter.write(payload);

  /* ─── Tool-calling loop ─────────────────────────────────────────
   * The LLM may decide mid-stream to call a native tool. We run
   * streamChatCompletion, and on finish_reason === 'tool_calls' we:
   *   1. Emit `event: tool_use` so the client can render a card.
   *   2. Execute each tool call (concurrently where safe).
   *   3. Emit `event: tool_result` with the outcome.
   *   4. Append the tool result as a `role:'tool'` message and
   *      stream another chat completion that wraps up the answer.
   *
   * createToolTurnPolicy owns every limit for the turn: the iteration
   * budget, the per-round call cap, the absolute call and wall-clock
   * ceilings, the duplicate-call guard, and per-tool failure
   * accounting. A failing tool now only withdraws itself — the turn
   * keeps the rest of its toolset, which is the behaviour users
   * previously lost whenever one malformed argument object appeared
   * twice. Every threshold is environment-tunable.
   * ───────────────────────────────────────────────────────────── */
  const toolCtx = await createStreamToolContext(req, mode);
  const { toolPolicy, toolRegistry, toolDefs, toolNames, schemaForTool, toolExamples, FUZZY_SAFE, connectorConnectionsByProvider, projectConnectorConnectionsByProvider } = toolCtx;
  const MAX_TOOL_ITERATIONS = toolCtx.MAX_TOOL_ITERATIONS;
  const runToolCall = createToolRunner({
    req,
    sessionIdFromQuery,
    projectIdFromBody,
    mode,
    emitter,
    abortSignal: abortController.signal,
    toolPolicy,
    schemaForTool,
    connectorConnectionsByProvider,
    projectConnectorConnectionsByProvider,
  });

  /* Kept structurally loose to match the legacy `finalMessages` shape that
     appendNativeToolContract / prependCodeInterpreterPrompt accept. */
  let workingMessages: any[] = finalMessages as any[];

  for (let iter = 0; iter <= MAX_TOOL_ITERATIONS; iter++) {
    const toolsAllowed = toolPolicy.toolsAllowed(iter);
    toolPolicy.noteIteration();
    /* Withdrawn tools are removed from both the request and the prompt,
     * so the model is never invited to call something the loop will
     * reject. Everything else stays available. */
    const activeToolNames = toolsAllowed ? toolPolicy.enabledToolNames(toolNames) : [];
    const activeToolDefs = toolsAllowed
      ? toolDefs.filter((tool) => activeToolNames.includes(
        (tool as { function?: { name?: string } }).function?.name || '',
      ))
      : [];
    /* The model-facing contract must describe the same capability set as
     * this request. In the final, tools-disabled hop the upstream gets no
     * `tools` field, so do not leave the initial registry list in the
     * system message and invite an unavailable call. */
    let requestMessages = appendToolRoutingHints(
      appendNativeToolContract(
        workingMessages,
        activeToolNames,
        {
          limits: toolsAllowed ? toolPolicy.snapshot() : null,
          disabledTools: toolPolicy.disabledTools(),
          examples: toolExamples,
        },
      ),
      activeToolNames,
    );
    /* Keep the code-runtime appendix aligned with the executable tool
     * list. In particular, the final tools-disabled hop must not tell
     * the model that code_interpreter is callable. The helper inserts
     * the appendix before FINAL_OUTPUT_CONSTRAINTS and is idempotent. */
    if (toolsAllowed && activeToolNames.includes('code_interpreter')) {
      requestMessages = await prependCodeInterpreterPrompt(requestMessages);
    }
    let iterFinishReason: string | null = null;
    const toolCallsThisTurn: ToolCall[] = [];

    let upstreamErr: Error | null = null;
    await streamChatCompletion(
      {
        apiBase: provider.url,
        apiKey: provider.keyPlaintext,
        model: provider.model,
        messages: requestMessages,
        maxTokens,
        temperature,
        signal: abortController.signal,
        reasoning_effort,
        extra_body: safeExtraBody,
        ...(toolsAllowed && activeToolDefs.length > 0
          ? {
            tools: activeToolDefs,
            /* Let the model select workspace_agent from the user's
               intent. There is no client-side Agent switch or forced
               first hop: ordinary questions stay native, while project
               and file work can enter the Codex runtime automatically. */
            tool_choice: 'auto',
          }
          : {}),
      } as Parameters<typeof streamChatCompletion>[0],
      // onChunk
      (chunk: string) => {
        fullText += chunk;
        completionTokens = estimateTokens(fullText);
        emitter.content(chunk);
      },
      // onDone — capture finish_reason so the loop can dispatch
      ({ finishReason }: { finishReason: string | null }) => {
        iterFinishReason = finishReason;
      },
      // onError
      (err: Error) => {
        upstreamErr = err;
        emitter.fatal(err);
      },
      // onReasoning — emit reasoning_content as SSE delta so the
      // client renders the thinking pill. Also accumulate so
      // streaming_text captures it on disconnect.
      (reasoning: string) => {
        fullReasoning += reasoning;
        emitter.reasoning(reasoning);
      },
      // onToolUse — accumulate tool calls for this iteration. Flush
      // happens after the stream ends so the client sees a complete
      // tool_use event even if multiple tool_calls arrive split.
      (tc: ToolCall) => {
        toolCallsThisTurn.push(tc);
      },
      // P_tool_stream — forward partial tool_call deltas as
      // `event: tool_call_delta` SSE frames. The chat route uses
      // this to let the frontend render the in-progress JSON
      // (typically the Python source for code_interpreter, or the
      // query string for web_search) live, instead of waiting for
      // finish_reason='tool_calls'. The frontend correlates the
      // delta to the eventual tool_use frame via the tool_call id.
      (delta: ToolCallDelta) => {
        emitter.toolCallDelta(delta);
      },
    );

    if (upstreamErr) {
      // Error path already wrote [DONE] and ended the response.
      if (req.userId && fullText.length > 0) {
        recordUsage({
          userId: req.userId,
          model: provider.model,
          sessionId: sessionIdFromQuery,
          promptTokens,
          completionTokens: estimateTokens(fullText),
          source: 'chat',
        });
      }
      if (turnId) {
        clearTurnTimer();
        checkpointTurn();
        // An explicit Stop already flipped the row to interrupted via the
        // interrupt endpoint; don't overwrite it with failed.
        if (abortController.signal.reason !== 'turn_interrupted') {
          await setChatTurnStatus(turnId, 'failed', {
            fullText: fullText || null,
            fullReasoning: fullReasoning || null,
            error: (upstreamErr as Error).message,
          }).catch(() => {});
        }
      }
      return;
    }

    const boundedToolCalls = normalizeToolCalls(toolCallsThisTurn, {
      iteration: iter,
      maxCalls: toolPolicy.maxCallsPerIteration,
    }) as ToolCall[];

    /* Keep the raw calls for execution and diagnostics, but only echo a
     * canonical protocol-safe copy to the next provider hop. If a model
     * emitted malformed JSON, sending that exact string back in the
     * assistant message can make the gateway reject the entire retry
     * before it has a chance to read the structured tool error. */
    const protocolToolCalls = boundedToolCalls.map(sanitizeToolCallForProtocol);

    // No tool call → done. The extra tools-disabled iteration lets the
    // model summarize the fourth and final execution round in prose.
    if (!isToolFinishReason(iterFinishReason) || boundedToolCalls.length === 0) break;
    if (!toolsAllowed) {
      emitter.event('error', {
        error: 'tool_iteration_limit_reached',
        message: 'Tool iteration limit reached; finishing without another execution.',
      });
      break;
    }

    /* ── Resolve names and repair arguments once per batch ──────────
     * Models address tools by synonyms (`search`, `functions.web_search`)
     * and mis-shape arguments in a few repeatable ways. Both are fixed
     * here, before dispatch, so scheduling hints, the tool_use frame the
     * client renders, and execution all agree on one canonical name and
     * one canonical argument object. Anything that cannot be explained
     * becomes a structured rejection carrying the tool's schema and a
     * copy-ready example. */
    const prepared: PreparedCall[] = boundedToolCalls.map((call) => {
      const requestedName = call.function?.name || '';
      const resolved = resolveToolName(requestedName, toolNames, {
        allowFuzzy: FUZZY_SAFE(requestedName),
      });
      const toolName = resolved.name || requestedName;
      if (resolved.name && resolved.match !== 'exact') {
        console.info('[tool-resolve]', JSON.stringify({
          requested: requestedName, resolved: resolved.name, match: resolved.match,
        }));
      }
      const registryEntry = resolved.name ? toolRegistry.get(resolved.name) : null;
      const schema = resolved.name ? schemaForTool(resolved.name) : null;
      const repaired = repairToolArguments(call.function?.arguments, schema || undefined);
      if (repaired.ok && repaired.repairs.length > 0) {
        /* Log the repair kinds only — never the argument values. */
        console.info('[tool-repair]', JSON.stringify({
          name: toolName, repairs: repaired.repairs.slice(0, 12),
        }));
      }
      const args = (repaired.ok ? repaired.value : {}) as Record<string, any>;

      let rejection: PreparedCall['rejection'] = null;
      if (!resolved.name) {
        rejection = { code: 'unknown_tool', retryable: false };
      } else if (!registryEntry || !registryEntry.enabled) {
        rejection = { code: 'tool_not_available', retryable: false };
      } else if (toolPolicy.disabledReason(resolved.name)) {
        rejection = {
          code: 'tool_not_available',
          retryable: false,
          hint: `\`${resolved.name}\` was withdrawn for the rest of this turn (${toolPolicy.disabledReason(resolved.name)}).`,
        };
      } else if (!repaired.ok) {
        rejection = {
          code: 'invalid_tool_arguments',
          retryable: toolPolicy.remainingRetries(resolved.name) > 1,
        };
      } else if (toolPolicy.isDuplicate(resolved.name, hashToolArguments(args))) {
        rejection = {
          code: 'duplicate_tool_call',
          retryable: true,
          hint: 'This exact call already ran in this turn, so it was not executed again. Use the previous result, change the arguments materially, or continue in prose.',
        };
      }
      if (resolved.name && !rejection) {
        toolPolicy.registerCall(resolved.name, hashToolArguments(args));
      }
      return { call, toolName, registryEntry, args, rejection };
    });

    // Emit tool_use event for the client to render cards.
    emitter.event('tool_use', prepared.map((entry) => ({
      id: entry.call.id,
      name: entry.toolName,
      input: entry.args,
    })));

    // Echo the assistant's tool_calls back as a role:'assistant'
    // message — required by the OpenAI protocol so the next hop
    // can reference the tool_call_id.
    workingMessages = workingMessages.concat([{
      role: 'assistant',
      /* Empty string is valid OpenAI content and is accepted by
       * compatibility gateways that reject `content: null`. */
      content: '',
      tool_calls: protocolToolCalls.map((t) => ({
        id: t.id,
        type: 'function',
        function: t.function,
      })),
    }]);

    // Abort guard — if the client disconnected during this turn's
    // LLM streaming, skip tool execution and terminate the loop.
    if (abortController.signal.aborted) break;

    // Run independent tool calls concurrently to cut turn latency when a
    // model emits several in one turn (e.g. web_search + visualization).
    // The registry marks code_interpreter sessionSerial because its
    // scratch directory is mutable; dispatchToolCalls queues those calls
    // while retaining the original result order for the provider hop.
    // SSE frames from independent tools may interleave, but the client
    // correlates every frame by tool_call id.
    const toolMessages = await dispatchToolCalls(
      prepared,
      /* Scheduling hints must follow the resolved name, otherwise an
         aliased code_interpreter call would lose its serial slot. */
      (entry) => entry.toolName,
      toolRegistry,
      (entry) => runToolCall(entry, activeToolNames),
    );
    workingMessages = workingMessages.concat(toolMessages);

    /* An exhausted call or time budget ends the tool phase deliberately:
       the next hop runs without tools so the turn still produces a
       written answer instead of stopping mid-flight. */
    const exhausted = toolPolicy.budgetExhausted();
    if (exhausted) {
      emitter.event('error', {
        error: exhausted.code,
        message: exhausted.message,
      });
    }
  }

  /* Abort guard — with no turn bound, a client disconnect during tool
   * execution skips finalisation (writing [DONE] to a closed socket would
   * throw, and the recordUsage below would charge for an incomplete
   * response). With a turn bound the socket close only detached the feed
   * (see the req.on('close') handler): the run continues detached unless
   * the abort came from an explicit Stop (turn_interrupted). */
  if (abortController.signal.aborted && !turnId) {
    /* Still record partial usage so the operator can see incomplete
     * responses in the heatmap and diagnose client-drop patterns. */
    if (req.userId && fullText.length > 0) {
      recordUsage({
        userId: req.userId,
        model: provider.model,
        sessionId: sessionIdFromQuery,
        promptTokens,
        completionTokens: estimateTokens(fullText),
        source: 'chat',
      });
    }
    return;
  }
  if (abortController.signal.aborted && turnId) {
    // Explicit Stop on a bound turn: persist the partial answer so a
    // re-attach sees what had streamed, then stop. The row itself was
    // already flipped to interrupted by the interrupt endpoint.
    clearTurnTimer();
    checkpointTurn();
    if (req.userId && fullText.length > 0) {
      recordUsage({
        userId: req.userId,
        model: provider.model,
        sessionId: sessionIdFromQuery,
        promptTokens,
        completionTokens: estimateTokens(fullText),
        source: 'chat',
      });
    }
    return;
  }

  /* Done — record usage, clear streaming text, and close the stream.
   * The streaming_text is cleared so the client knows the stream
   * completed normally (no partial content to recover). The client's
   * own saveCurrentSession() will persist the full message. */
  emitter.finish();
  if (req.userId) {
    recordUsage({
      userId: req.userId,
      model: provider.model,
      sessionId: sessionIdFromQuery,
      promptTokens,
      completionTokens,
      source: 'chat',
    });
  }
  // P_streaming-survival — mark stream as completed BEFORE clearing
  // streaming_text, so the close handler doesn't overwrite with stale data.
  streamCompleted = true;
  if (turnId) {
    clearTurnTimer();
    checkpointTurn();
    await setChatTurnStatus(turnId, 'completed', {
      fullText: fullText || null,
      fullReasoning: fullReasoning || null,
    }).catch(() => {});
  }
  // P_streaming-survival — clear streaming_text on normal completion
  // so the client knows no partial content needs recovery.
  if (sessionIdFromQuery) {
    const db = getDb();
    db.update(sessions)
      .set({ streamingText: null, streamingReasoning: null })
      .where(and(eq(sessions.id, sessionIdFromQuery), eq(sessions.userId, req.userId!)))
      .catch(() => {});
  }
}
