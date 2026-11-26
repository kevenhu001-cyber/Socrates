/**
 * One chat turn's tool-calling loop.
 *
 * Owns upstream hops, canonical tool-name/argument repair, concurrent
 * dispatch, usage accumulation, length-continue retries and the per-turn
 * iteration/call budgets. The mutable state object receives the answer,
 * reasoning, runtime and usage when the loop unwinds.
 */
import type { TurnRuntime } from '@socrates/contracts';
import {
  estimateTokens,
  normalizeProviderUsage,
  recordUsage,
  resolveUsage,
} from '../../../services/core/usageTracker.js';
import { setChatTurnStatus } from '../../../services/core/chatTurns.js';
import { streamChatCompletion } from '../../../services/core/llm/stream.js';
import { annotateSpan, withSpan } from '../../../lib/telemetry.js';
import type { ChatTiming } from '../../../lib/chatTiming.js';
import type { createTurnWatchdog } from '../../../lib/turnWatchdog.js';
import {
  MAX_TOOL_ARGUMENT_CHARS,
  normalizeToolCalls,
  repairToolArguments,
  resolveToolName,
  sanitizeToolCallForProtocol,
  looksTruncatedToolArguments,
  TOOL_ARGUMENT_ERRORS,
  truncatedArgumentsHint,
  validateToolArguments,
} from '../../../services/tools/toolCallSafety.js';
import { toolArgumentPolicy } from '../../../services/tools/toolArgumentPolicy.js';
import { hashToolArguments } from '../../../services/tools/toolTurnPolicy.js';
import { dispatchToolCalls } from '../../../services/tools/toolScheduler.js';
import {
  appendNativeToolContract,
  appendToolRoutingHints,
  prependCodeInterpreterPrompt,
} from '../prepare/prompts.js';
import { SseEmitter } from './sseEmitter.js';
import { createToolRunner } from './toolRunner.js';
import type { StreamToolContext } from './toolContext.js';
import type { createTurnEventController } from '../../../services/turnEvents.js';
import type { createTurnActivityController } from '../../../services/turnActivity.js';
import type {
  ChatStreamPipelineContext,
  PreparedCall,
  StreamMessage,
  ToolCall,
  ToolCallDelta,
  ToolResult,
} from './types.js';
import type { ExecutedToolCall, ToolLoopState } from './turnState.js';

export interface ToolLoopInput {
  req: ChatStreamPipelineContext['req'];
  emitter: SseEmitter;
  timing: ChatTiming;
  watchdog: ReturnType<typeof createTurnWatchdog>;
  abortController: AbortController;
  turnId: string | null;
  sessionIdFromQuery: string | null;
  projectIdFromBody: string | null;
  provider: ChatStreamPipelineContext['prep']['payload']['provider'];
  finalMessages: StreamMessage[];
  safeExtraBody: Record<string, unknown> | undefined;
  mode: 'tutor' | 'chat';
  temperature: number;
  maxTokens: number | undefined;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  responseSpeed: 'standard' | 'fast';
  toolCtxPromise: Promise<StreamToolContext>;
  turnEvents: ReturnType<typeof createTurnEventController>;
  activity: ReturnType<typeof createTurnActivityController>;
  state: ToolLoopState;
  promptTokens: number;
  reportTtfb: (kind: 'content' | 'reasoning') => void;
  checkpointTurn: () => void;
  clearTurnTimer: () => void;
}

export async function runToolLoop(input: ToolLoopInput): Promise<'failed' | void> {
  const {
    req,
    emitter,
    timing,
    watchdog,
    abortController,
    turnId,
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
    state,
    promptTokens,
    reportTtfb,
    checkpointTurn,
    clearTurnTimer,
  } = input;

  let fullText = state.fullText;
  let fullReasoning = state.fullReasoning;
  let completionTokens = 0;
  let usagePromptTotal = 0;
  let usageCompletionTotal = 0;
  let sawProviderUsage = false;
  const executedToolCalls = state.executedToolCalls;

  function addProviderUsage(raw: unknown): void {
    const usage = normalizeProviderUsage(raw);
    if (!usage) return;
    sawProviderUsage = true;
    usagePromptTotal += usage.promptTokens;
    usageCompletionTotal += usage.completionTokens;
  }

  function accumulatedProviderUsage(): { prompt_tokens: number; completion_tokens: number } | null {
    if (!sawProviderUsage) return null;
    return { prompt_tokens: usagePromptTotal, completion_tokens: usageCompletionTotal };
  }

  try {
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
    const toolCtx = await toolCtxPromise;
    timing.mark('tools_ready');
    const {
      toolPolicy,
      toolRegistry,
      toolDefs,
      toolNames,
      initialToolNames,
      schemaForTool,
      toolExamples,
      FUZZY_SAFE,
      connectorConnectionsByProvider,
      projectConnectorConnectionsByProvider,
      connectorCatalog,
      connectorActivation,
    } = toolCtx;
    const MAX_TOOL_ITERATIONS = toolCtx.MAX_TOOL_ITERATIONS;
    const executionResults = new Map<string, import('./types.js').ToolResult>();
    const displayOutputs = new Map<string, string>();
    const runToolCall = createToolRunner({
      publicRuntime: {
        registerSources: turnEvents.registerSources,
        patchUi: turnEvents.patchUi,
        citeSources: (args) => turnEvents.citeSources(args, fullText),
      },
      req,
      sessionIdFromQuery,
      projectIdFromBody,
      mode,
      emitter,
      abortSignal: abortController.signal,
      toolPolicy,
      schemaForTool,
      onResult: (id, result) => executionResults.set(id, result),
      onDisplayOutput: (id, content) => displayOutputs.set(id, content),
      connectorConnectionsByProvider,
      projectConnectorConnectionsByProvider,
      connectorCatalog,
      connectorActivation,
    });

    /* Kept structurally loose to match the legacy `finalMessages` shape that
       appendNativeToolContract / prependCodeInterpreterPrompt accept. */
    let workingMessages: StreamMessage[] = [...finalMessages];
    /* Calls that exceeded the per-iteration cap on the previous hop and were
     * dropped without executing — surfaced in the contract so the model
     * knows they never ran (they are not echoed upstream either). */
    let lastDroppedCalls = 0;
    let speedFallbackEmitted = false;
    /* finish_reason='length' means the upstream hit max_tokens mid-answer.
       Rather than ending the turn on a truncated sentence, we re-ask the
       model to continue exactly where it stopped — bounded so a pathological
       loop cannot run forever. */
    const rawMaxLengthContinues = Number(process.env.CHAT_LENGTH_CONTINUE_MAX);
    const MAX_LENGTH_CONTINUES =
      Number.isFinite(rawMaxLengthContinues) && rawMaxLengthContinues >= 0
        ? Math.min(5, Math.floor(rawMaxLengthContinues))
        : 2;
    let lengthContinues = 0;

    for (let iter = 0; iter <= MAX_TOOL_ITERATIONS && !abortController.signal.aborted; iter++) {
      const toolsAllowed = toolPolicy.toolsAllowed(iter);
      toolPolicy.noteIteration();
      /* Withdrawn tools are removed from both the request and the prompt,
       * so the model is never invited to call something the loop will
       * reject. Everything else stays available. */
      /* Connected connector tools are not offered until get_connector_spec
         activates them. The activation set is per-turn and grows only after
         the model has read that tool's exact schema. */
      const activeToolNames = toolsAllowed
        ? toolPolicy
            .enabledToolNames([...initialToolNames, ...connectorActivation.active()])
            .slice()
            .sort()
        : [];
      const activeToolDefs = toolsAllowed
        ? toolDefs
            .filter((tool) =>
              activeToolNames.includes(
                (tool as { function?: { name?: string } }).function?.name || '',
              ),
            )
            .sort((a, b) =>
              String(a.function?.name || '').localeCompare(String(b.function?.name || ''), 'en'),
            )
        : [];
      /* The model-facing contract must describe the same capability set as
       * this request. In the final, tools-disabled hop the upstream gets no
       * `tools` field, so do not leave the initial registry list in the
       * system message and invite an unavailable call. */
      // Stable tool guidance comes before the changing per-hop budget. A
      // counter update must not invalidate the large visualization/code prefix.
      let requestMessages = appendToolRoutingHints(workingMessages, activeToolNames);
      /* Keep the code-runtime appendix aligned with the executable tool
       * list. In particular, the final tools-disabled hop must not tell
       * the model that code_interpreter is callable. The helper inserts
       * the appendix before FINAL_OUTPUT_CONSTRAINTS and is idempotent. */
      if (toolsAllowed && activeToolNames.includes('code_interpreter')) {
        requestMessages = await prependCodeInterpreterPrompt(requestMessages);
      }
      requestMessages = appendNativeToolContract(requestMessages, activeToolNames, {
        limits: toolsAllowed ? toolPolicy.snapshot() : null,
        disabledTools: toolPolicy.disabledTools(),
        examples: toolExamples,
        droppedCalls: lastDroppedCalls,
      });
      let iterFinishReason: string | null = null;
      const toolCallsThisTurn: ToolCall[] = [];
      /* Content and reasoning emitted during THIS hop only. When the hop
         ends in tool_calls, both must be replayed on the assistant message
         we append to workingMessages — reasoning providers (DeepSeek
         `reasoning_content`, MiniMax `reasoning_details`) treat a bare
         assistant tool-call turn as a protocol violation or silently
         degrade the next hop into re-asking the question. */
      let iterContent = '';
      let iterReasoning = '';
      let iterReasoningDetails: Record<string, unknown>[] | undefined;

      let upstreamErr: Error | null = null;
      /* One span per upstream call. A tool-using turn makes several, so the
         iteration index is an attribute rather than a separate span name —
         that keeps them groupable while still showing which hop was slow.
         This is the span that answers "was it the provider or was it us". */
      timing.mark('upstream_started');
      /* a new upstream hop is progress too: the turn is
       * alive, it just has not produced bytes yet. */
      watchdog.touch();
      await withSpan(
        'llm.stream',
        {
          'llm.model': provider.model,
          'llm.tools_offered': toolsAllowed ? activeToolDefs.length : 0,
          'socrates.tool_iteration': iter,
        },
        async () =>
          await streamChatCompletion(
            {
              apiBase: provider.url,
              apiKey: provider.keyPlaintext,
              model: provider.model,
              userId: req.userId,
              cacheSessionId: sessionIdFromQuery ?? undefined,
              /* the operator's own statement
               * about their endpoint wins over the registry's host heuristic. */
              instantEncoding: provider.instantEncoding ?? null,
              messages: requestMessages,
              maxTokens,
              temperature,
              signal: abortController.signal,
              reasoning_effort,
              response_speed: responseSpeed,
              extra_body: safeExtraBody,
              onPreferenceFallback: (detail) => {
                if (speedFallbackEmitted) return;
                speedFallbackEmitted = true;
                emitter.event('preference_fallback', detail);
              },
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
              turnEvents.generation();
              watchdog.touch();
              fullText += chunk;
              state.fullText = fullText;
              iterContent += chunk;
              completionTokens = estimateTokens(fullText);
              reportTtfb('content');
              emitter.content(chunk);
            },
            // onDone — capture finish_reason so the loop can dispatch, and the
            // provider's `usage` object when it sent one. The tool loop can run
            // several upstream calls per turn, so usage accumulates across
            // iterations rather than being overwritten by the last one.
            ({ finishReason, usage, reasoningDetails }) => {
              iterFinishReason = finishReason;
              iterReasoningDetails = reasoningDetails;
              addProviderUsage(usage);
            },
            // onError
            (err: Error) => {
              upstreamErr = err;
              if (!abortController.signal.aborted) emitter.fatal(err);
            },
            // onReasoning — emit reasoning_content as SSE delta so the
            // client renders the thinking pill. Also accumulate so
            // streaming_text captures it on disconnect.
            (reasoning: string) => {
              activity.thinking();
              turnEvents.reasoning();
              watchdog.touch();
              fullReasoning += reasoning;
              state.fullReasoning = fullReasoning;
              iterReasoning += reasoning;
              reportTtfb('reasoning');
              emitter.reasoning(reasoning);
            },
            // onToolUse — accumulate tool calls for this iteration. Flush
            // happens after the stream ends so the client sees a complete
            // tool_use event even if multiple tool_calls arrive split.
            (tc: ToolCall) => {
              toolCallsThisTurn.push(tc);
            },
            // forward partial tool_call deltas as
            // `event: tool_call_delta` SSE frames. The chat route uses
            // this to let the frontend render the in-progress JSON
            // (typically the Python source for code_interpreter, or the
            // query string for web_search) live, instead of waiting for
            // finish_reason='tool_calls'. The frontend correlates the
            // delta to the eventual tool_use frame via the tool_call id.
            (delta: ToolCallDelta) => {
              watchdog.touch();
              emitter.toolCallDelta(delta);
              turnEvents.toolArguments(delta, fullText.length);
            },
          ),
      );

      /* Recorded after the call so a slow turn can be attributed without
         correlating logs: whether the provider reported real token counts is
         itself diagnostic, since a missing usage frame means the stream ended
         early. */
      annotateSpan({
        'llm.finish_reason': iterFinishReason || 'none',
        'llm.response_chars': fullText.length,
        'llm.usage_reported': sawProviderUsage,
        'llm.tool_calls': toolCallsThisTurn.length,
      });

      if (upstreamErr && !abortController.signal.aborted) {
        // Error path already wrote [DONE] and ended the response.
        if (
          req.userId &&
          (fullText.length > 0 || (promptTokens && promptTokens > 0) || sawProviderUsage)
        ) {
          const settled = resolveUsage(accumulatedProviderUsage(), {
            promptTokens,
            completionTokens: estimateTokens(fullText),
          });
          recordUsage({
            userId: req.userId,
            model: provider.model,
            sessionId: sessionIdFromQuery,
            promptTokens: settled.promptTokens,
            completionTokens: settled.completionTokens,
            source: 'chat',
            usageSource: settled.usageSource,
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
              toolCalls: executedToolCalls,
              turnRuntime: state.turnRuntime,
              error: (upstreamErr as Error).message,
            }).catch(() => {});
          }
        }
        return 'failed';
      }

      if (abortController.signal.aborted) break;
      // Only explicitly typed summaries may appear in the public activity log.
      const summary = iterReasoningDetails
        ?.filter(
          (detail) => detail.type === 'reasoning.summary' && typeof detail.summary === 'string',
        )
        .map((detail) => detail.summary)
        .join('')
        .trim()
        .slice(0, 500);
      if (summary) activity.publicSummary(summary);
      const reasoningForNextHop = iterReasoningDetails?.length
        ? { reasoning_details: iterReasoningDetails }
        : iterReasoning
          ? { reasoning_content: iterReasoning }
          : {};

      const boundedToolCalls = normalizeToolCalls(toolCallsThisTurn, {
        iteration: iter,
        maxCalls: toolPolicy.maxCallsPerIteration,
      }) as ToolCall[];

      // No tool call → done — unless the answer was truncated by the output
      // token limit. In that case the partial text is echoed back as an
      // assistant turn plus a "continue" instruction, and the next hop keeps
      // streaming into the same assistant bubble. Bounded by
      // CHAT_LENGTH_CONTINUE_MAX (default 2).
      if (boundedToolCalls.length === 0) {
        if (
          iterFinishReason === 'length' &&
          iterContent &&
          lengthContinues < MAX_LENGTH_CONTINUES &&
          !abortController.signal.aborted
        ) {
          lengthContinues += 1;
          workingMessages = workingMessages.concat([
            { role: 'assistant', content: iterContent, ...reasoningForNextHop },
            {
              role: 'user',
              content:
                '[System note: your previous reply was cut off at the output token limit. Continue exactly where you stopped — do not restart, repeat earlier text, or add a preamble.]',
            },
          ]);
          continue;
        }
        break;
      }
      if (!toolsAllowed) break;

      /* ── Resolve names and repair arguments once per batch ──────────
       * Models address tools by synonyms (`search`, `functions.web_search`)
       * and mis-shape arguments in a few repeatable ways. Both are fixed
       * here, before dispatch, so scheduling hints, the tool_use frame the
       * client renders, and execution all agree on one canonical name and
       * one canonical argument object. Anything that cannot be explained
       * becomes a structured rejection carrying the tool's schema and a
       * copy-ready example. */
      /* Count the calls the per-iteration cap just dropped so the next
       * contract appendix can tell the model they never ran. */
      const droppedCalls = Math.max(0, toolCallsThisTurn.length - boundedToolCalls.length);
      lastDroppedCalls = droppedCalls;
      if (droppedCalls > 0) {
        console.warn(
          '[chat/stream] dropped tool calls over per-iteration cap',
          JSON.stringify({
            dropped: droppedCalls,
            cap: toolPolicy.maxCallsPerIteration,
          }),
        );
      }

      const prepared: PreparedCall[] = boundedToolCalls.map((call) => {
        const requestedName = call.function?.name || '';
        /* Fuzzy matching is always attempted, then gated on the RESOLVED
         * target: a near-miss name that lands on a side-effecting tool
         * (code_interpreter, workspace_agent, initialize_workspace) must
         * fail closed as unknown_tool, not execute on a guess. The old
         * code gated on the requested name, which let `code_interprete`
         * slide straight into the sandbox. */
        const resolved = resolveToolName(requestedName, toolNames, { allowFuzzy: true });
        if (resolved.name && resolved.match === 'fuzzy' && !FUZZY_SAFE(resolved.name)) {
          resolved.name = null;
          resolved.match = 'none';
        }
        const toolName = resolved.name || requestedName;
        /* Executors and the protocol echo both read call.function.name;
           rewrite it to the canonical name so an aliased or fuzzy call
           (`search` → `web_search`) reaches the right executor instead of
           being routed by the raw model-supplied string. */
        if (resolved.name && call.function) call.function.name = resolved.name;
        if (resolved.name && resolved.match !== 'exact') {
          console.info(
            '[tool-resolve]',
            JSON.stringify({
              requested: requestedName,
              resolved: resolved.name,
              match: resolved.match,
            }),
          );
        }
        const registryEntry = resolved.name ? toolRegistry.get(resolved.name) : null;
        const schema = resolved.name ? schemaForTool(resolved.name) : null;
        /* The policy declares, per tool, whether unknown keys survive repair
           and which validator owns the pre-execution check. Tools with a
           tolerant normalizer keep every key they were sent; tools with a
           tool-specific validator run it here instead of the generic schema
           pass. */
        const argumentPolicy = toolArgumentPolicy(resolved.name);
        const repaired = repairToolArguments(call.function?.arguments, schema || undefined, {
          dropUnknown: argumentPolicy.dropUnknown,
          toolName: resolved.name || undefined,
        });
        if (repaired.ok && repaired.repairs.length > 0) {
          /* Log the repair kinds only — never the argument values. */
          console.info(
            '[tool-repair]',
            JSON.stringify({
              name: toolName,
              repairs: repaired.repairs.slice(0, 12),
            }),
          );
        }
        const args = (repaired.ok ? repaired.value : {}) as Record<string, unknown>;
        /* Persist the repaired arguments back onto the call so the
           assistant-message echo below replays the same canonical JSON the
           executor consumed rather than the raw (possibly malformed)
           provider text. */
        if (repaired.ok && call.function) call.function.arguments = JSON.stringify(args);

        let rejection: PreparedCall['rejection'] = null;
        let registeredArgumentsHash: string | null = null;
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
        } else if (
          connectorCatalog.byTool.has(resolved.name) &&
          !connectorActivation.has(resolved.name)
        ) {
          /* A guessed connector name is not enough: the model must read the
             exact spec first, which also activates the tool for the next hop. */
          rejection = {
            code: 'tool_not_available',
            retryable: true,
            hint: `Deferred tools are discovered first. Call search_connectors, then get_connector_spec for \`${resolved.name}\`, before calling it.`,
          };
        } else if (!activeToolNames.includes(resolved.name)) {
          rejection = { code: 'tool_not_available', retryable: false };
        } else if (!repaired.ok) {
          /* Distinct codes: an oversized payload needs a smaller call, a
             parse failure needs the arguments re-emitted as one JSON
             object. One shared code left the model guessing. */
          rejection = {
            code: repaired.error,
            retryable: toolPolicy.remainingRetries(resolved.name) > 1,
            ...(repaired.error === TOOL_ARGUMENT_ERRORS.tooLarge
              ? {
                  hint: `The arguments hit the ${Math.floor(MAX_TOOL_ARGUMENT_CHARS / 1024)} KB transport limit and were cut off, so they could not be parsed. Send a smaller payload — split the work across several calls.`,
                }
              : looksTruncatedToolArguments(call.function?.arguments)
                ? {
                    hint: truncatedArgumentsHint(resolved.name),
                  }
                : {}),
          };
        } else {
          /* Repair coerced the shape; now enforce the declared contract
           * (required fields, bounds, enums) so a malformed call gets the
           * correction package instead of a wasted execution. The policy
           * decides whether the generic schema validator or a tool-specific
           * validator owns this check; `none` means the executor validates. */
          const validation: {
            ok: boolean;
            fieldErrors: string[];
            errorCode?: string;
            userMessage?: string;
          } =
            argumentPolicy.validation === 'schema'
              ? validateToolArguments(args, schema)
              : argumentPolicy.validation === 'tool' && argumentPolicy.validate
                ? argumentPolicy.validate(args)
                : { ok: true, fieldErrors: [] };
          if (!validation.ok) {
            const retryable = toolPolicy.remainingRetries(resolved.name) > 1;
            rejection = {
              code: validation.errorCode || TOOL_ARGUMENT_ERRORS.schema,
              retryable,
              fieldErrors: validation.fieldErrors.join('; '),
              /* The tool-specific card copy describes a correction attempt, so
                 only use it while another attempt is actually allowed. */
              ...(retryable && validation.userMessage
                ? { userMessage: validation.userMessage }
                : {}),
            };
          } else {
            const argumentsHash = hashToolArguments(args);
            const denied = toolPolicy.registerCall(resolved.name, argumentsHash);
            if (denied) {
              rejection = {
                code: denied.code,
                retryable: denied.code === 'duplicate_tool_call',
                hint: denied.message,
              };
            } else {
              registeredArgumentsHash = argumentsHash;
            }
          }
        }
        return { call, toolName, registryEntry, args, rejection, registeredArgumentsHash };
      });

      // Emit tool_use event for the client to render cards.
      for (const entry of prepared) activity.tool(entry.call.id, entry.toolName);
      emitter.event(
        'tool_use',
        prepared.map((entry) => ({
          id: entry.call.id,
          name: entry.toolName,
          input: entry.args,
        })),
      );

      // Echo the assistant's tool_calls back as a role:'assistant'
      // message — required by the OpenAI protocol so the next hop
      // can reference the tool_call_id. The echo uses the CANONICAL
      // tool names and REPAIRED argument JSON (the same view the
      // executors consumed), run through sanitizeToolCallForProtocol
      // so any remnant the repair pass could not fix still reaches the
      // provider as syntactically valid JSON.
      const protocolToolCalls = prepared.map((entry) => sanitizeToolCallForProtocol(entry.call));
      const assistantToolMessage: StreamMessage = {
        role: 'assistant',
        /* Empty string is valid OpenAI content and is accepted by
         * compatibility gateways that reject `content: null`. The
         * hop's streamed prose is replayed here so the model keeps its
         * own wording in context instead of an artificial blank. */
        content: iterContent || '',
        tool_calls: protocolToolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: t.function,
        })),
        ...reasoningForNextHop,
      };
      workingMessages = workingMessages.concat([assistantToolMessage]);

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
      const toolMessages = await withSpan(
        'tools.batch',
        {
          'socrates.tool_iteration': iter,
          'socrates.tool_count': prepared.length,
        },
        () =>
          dispatchToolCalls(
            prepared,
            /* Scheduling hints follow the resolved name so an alias cannot
               bypass a serial lane. */
            (entry) => entry.toolName,
            toolRegistry,
            (entry) => runToolCall(entry, activeToolNames),
          ),
      );
      workingMessages = workingMessages.concat(toolMessages);
      activity.synthesizing();
      for (let i = 0; i < prepared.length; i++) {
        const prepCall = prepared[i];
        const toolMsg = toolMessages.find(
          (message) => 'tool_call_id' in message && message.tool_call_id === prepCall.call.id,
        );
        const execution = executionResults.get(prepCall.call.id);
        executedToolCalls.push({
          id: prepCall.call.id,
          name: prepCall.toolName,
          input: prepCall.args,
          output: displayOutputs.get(prepCall.call.id) ?? (toolMsg?.content || null),
          status: execution?.status,
          errorCode: execution?.errorCode,
          isError: execution
            ? execution.status !== 'completed' && execution.status !== 'awaiting_approval'
            : !prepCall.registryEntry || prepCall.rejection != null,
        });
      }

      displayOutputs.clear();
      executionResults.clear();

      // The policy withholds tools on the next hop when its budget is spent.
      // That hop can still write the answer, so no terminal error is emitted here.
    }
  } finally {
    Object.assign(state, {
      fullText,
      fullReasoning,
      completionTokens,
      usagePromptTotal,
      usageCompletionTotal,
      sawProviderUsage,
      executedToolCalls,
    });
  }
}
