/**
 * toolExecutors — the pipeline dispatcher (LobeHub-alignment: self-
 * registering tools).
 *
 * This module no longer branches on tool names. It owns only the parts
 * every tool shares:
 *   1. the pre-execution rejection path (unknown / withdrawn / invalid /
 *      duplicate calls) with the structured correction package,
 *   2. executor lookup against `executors/registry.ts`,
 *   3. the execution try/catch that must never crash the SSE stream,
 *   4. generic per-tool outcome accounting on the turn policy,
 *   5. the model-facing role:'tool' feedback (`toolFeedback.ts`).
 *
 * Adding a tool means adding one executor module + one registry entry;
 * the dispatcher stays untouched.
 */

import {buildToolErrorFeedback} from '../../../services/toolErrorFeedback.js';
import {wrapUntrustedToolResult} from '../../../services/toolCallSafety.js';
import {hashToolArguments, type ToolTurnPolicy} from '../../../services/toolTurnPolicy.js';
import {SseEmitter} from './sseEmitter.js';
import {formatToolResultContent} from './toolFeedback.js';
import {createToolExecutorRegistry} from './executors/registry.js';
import type {ToolExecutorContext} from './executors/types.js';
import type {PreparedCall, StreamMessage,} from './types.js';

export interface ToolRunnerDeps {
  req: import('express').Request & { userId?: string; user?: { tier?: string } | null };
  sessionIdFromQuery: string | null;
  projectIdFromBody: string | null;
  mode: string;
  emitter: SseEmitter;
  abortSignal: AbortSignal;
  toolPolicy: ToolTurnPolicy;
  schemaForTool: (name: string) => import('../../../services/toolCallSafety.js').JsonSchemaNode | null;
  connectorConnectionsByProvider: Record<string, any>;
  projectConnectorConnectionsByProvider: Record<string, any>;
}

export type ToolRunner = (
  entry: PreparedCall,
  activeToolNames: string[],
) => Promise<StreamMessage>;

export function createToolRunner(deps: ToolRunnerDeps): ToolRunner {
  const registry = createToolExecutorRegistry();
  const executorContext: ToolExecutorContext = {
    req: deps.req,
    sessionIdFromQuery: deps.sessionIdFromQuery,
    projectIdFromBody: deps.projectIdFromBody,
    mode: deps.mode,
    emitter: deps.emitter,
    abortSignal: deps.abortSignal,
    toolPolicy: deps.toolPolicy,
    schemaForTool: deps.schemaForTool,
    connectorConnectionsByProvider: deps.connectorConnectionsByProvider,
    projectConnectorConnectionsByProvider: deps.projectConnectorConnectionsByProvider,
  };

  const runToolCall = async (entry: PreparedCall, activeToolNames: string[]): Promise<StreamMessage> => {
    const tc = entry.call;
    const toolName: string = entry.toolName;

    /* One rejection path for every pre-execution failure. The model
     * gets the field errors, the tool's schema, and a copy-ready
     * example call; the card gets the same detail so a user can see
     * exactly what was wrong. */
    if (entry.rejection) {
      const { code, retryable, hint, fieldErrors } = entry.rejection;
      const feedback = buildToolErrorFeedback({
        toolName,
        schema: deps.schemaForTool(toolName),
        errorCode: code,
        retryable,
        hint: hint || null,
        fieldErrors: fieldErrors || null,
        availableTools: activeToolNames,
      });
      if (code === 'invalid_tool_arguments') {
        /* `stage` distinguishes a JSON parse failure (provider emitted
           malformed argument text) from a schema failure (parseable JSON
           that violates the declared contract) — the two have different
           fixes and previously logged identically. */
        console.warn('[chat/stream] invalid tool arguments', JSON.stringify({
          id: tc.id,
          name: toolName || 'unknown_tool',
          stage: fieldErrors ? 'schema' : 'parse',
          fieldErrors: fieldErrors ? String(fieldErrors).slice(0, 300) : undefined,
          length: typeof tc.function?.arguments === 'string' ? tc.function.arguments.length : 0,
          remainingRetries: deps.toolPolicy.remainingRetries(toolName),
        }));
      }
      /* A duplicate is a routing mistake rather than a tool defect, so
       * it must not push the tool towards being withdrawn. */
      if (code !== 'duplicate_tool_call') deps.toolPolicy.recordResult(toolName, false, code);
      deps.emitter.event('tool_result', {
        id: tc.id, name: toolName, ok: false, status: 'failed',
        output: '', stderr: '', artifacts: [],
        error: code, errorCode: code, retryable,
        userMessage: feedback.userMessage,
        detail: feedback.detail,
      });
      return {
        role: 'tool',
        tool_call_id: tc.id,
        /* `name` is part of the OpenAI tool-message contract and some
           compatible providers (MiniMax among them) validate it — a
           missing name turns the NEXT hop into a provider-side 400. */
        name: toolName,
        content: wrapUntrustedToolResult(toolName, feedback.modelMessage),
      };
    }

    const executor = registry.get(toolName);
    let outcome: Awaited<ReturnType<NonNullable<typeof executor>>>;
    if (executor) {
      /* Server-side backoff: after a failure the policy asks the next
         attempt of THIS tool to wait out an exponential delay, so a
         rate-limited or flaky upstream is not re-hit on every hop. The
         sleep is abortable and bounded (policy caps it at
         CHAT_TOOL_BACKOFF_MAX_MS). */
      const backoffMs = deps.toolPolicy.retryDelayMs(toolName);
      if (backoffMs > 0 && !deps.abortSignal.aborted) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, backoffMs);
          const onAbort = () => { clearTimeout(timer); resolve(); };
          if (deps.abortSignal.aborted) { onAbort(); return; }
          deps.abortSignal.addEventListener('abort', onAbort, { once: true });
        });
      }
      try {
        outcome = await executor(entry.args, tc, executorContext, { activeToolNames });
      } catch (err) {
        // Tool execution itself threw — never let this bubble out
        // and crash the SSE stream. Tell the model so it can pivot.
        const msg = String(err && (err as Error).message || err);
        deps.emitter.event('tool_result', {
          id: tc.id, ok: false, status: 'failed',
          output: '', stderr: '', artifacts: [],
          error: msg,
          errorCode: 'tool_execution_failed', retryable: false,
          userMessage: '工具执行失败。', detail: msg,
        });
        outcome = { result: { status: 'failed', error: msg } };
      }
    } else {
      /* A tool that exists in the registry but has no executor here
         (a wiring gap, not a model mistake) still gets the standard
         correction package so the model can pivot. */
      const feedback = buildToolErrorFeedback({
        toolName,
        errorCode: 'unknown_tool',
        retryable: false,
        availableTools: activeToolNames,
      });
      deps.emitter.event('tool_result', {
        id: tc.id, ok: false, status: 'failed',
        output: '', stderr: '', artifacts: [],
        error: 'unknown_tool',
        errorCode: 'unknown_tool', retryable: false,
        userMessage: feedback.userMessage, detail: feedback.detail,
      });
      outcome = { result: { status: 'failed', error: 'unknown_tool', errorCode: 'unknown_tool', correction: feedback.modelMessage } };
    }

    const result = outcome.result;

    /* Per-tool outcome accounting for every executor that did not need
       the post-failure count itself. A tool only loses its slot after
       its own consecutive-failure limit, and never takes the rest of
       the toolset down with it. */
    if (!outcome.outcomeRecorded) {
      deps.toolPolicy.recordResult(
        toolName,
        result.status === 'completed',
        String(result.errorCode || result.error || 'tool_failed'),
      );
    }

    /* A FAILED execution must release the (name,args) pair in the
       duplicate guard: retrying an identical call after a transient
       error (timeout, 429, flaky engine) is the correct recovery, but
       the guard used to reject it as `duplicate_tool_call` — which also
       contradicted the `retryable` hint in the failure feedback. The
       per-tool failure limit still bounds deterministic retry loops. */
    if (result.status !== 'completed') {
      deps.toolPolicy.unmarkCall(toolName, hashToolArguments(entry.args));
    }

    const toolContent = formatToolResultContent(toolName, result);
    return {
      role: 'tool',
      tool_call_id: tc.id,
      /* See the rejection path above: `name` is part of the OpenAI
         tool-message contract and is validated by some providers. */
      name: toolName,
      content: wrapUntrustedToolResult(toolName, toolContent),
    };
  };

  return runToolCall;
}
