/**
 * Streaming chat completion over OpenAI-compatible SSE.
 */
import { randomUUID } from 'node:crypto';
import {
  modelCapability,
  isPermanentQuotaError,
  providerHeaders,
  providerPayloadFailure,
} from '../llmProtocol.js';
import { observePromptCacheUsage } from '../../../lib/promptCacheUsage.js';
import { createUpstreamRetryBudget } from '../../../lib/upstreamRetryBudget.js';
import { chatCompletionsEndpoint } from '../../../lib/providerUrl.js';
import { getLlmDispatcher, markLlmActivity } from './dispatcher.js';
import { LlmProviderError, type ChatCompletionRequestOptions } from './types.js';
import {
  RATE_LIMIT_STATUS,
  TRANSIENT_ATTEMPTS,
  attemptsForUpstreamStatus,
  isRetryableUpstreamStatus,
  isTransientSocketReset,
  sleep,
  upstreamRetryDelayMs,
} from './retry.js';
import { isToolFinishReason, nextCompatibilityVariant, requestBodyVariants } from './protocol.js';
import {
  appendToolArgumentDelta,
  createToolArgumentStream,
  mergeToolNameDelta,
} from './toolArgs.js';
import { isRecord, reasoningText } from './values.js';

export async function streamChatCompletion(
  opts: ChatCompletionRequestOptions,
  onChunk: (chunk: string) => void,
  onDone: (info: {
    finishReason: string | null;
    usage?: unknown;
    reasoningDetails?: Record<string, unknown>[];
  }) => void,
  onError: (err: Error) => void,
  onReasoning?: (reasoning: string) => void,
  onToolUse?: (tc: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }) => void,
  onToolCallDelta?: (delta: {
    index: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
    arguments: string;
    final?: boolean;
  }) => void,
) {
  const { apiBase, apiKey, signal, tools } = opts;
  const retryBudget = createUpstreamRetryBudget();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const endpoint = chatCompletionsEndpoint(apiBase);
    if (Array.isArray(tools) && tools.length > 0) {
      /* don't log the upstream model name. The
       * provider-agnostic tool names are enough to confirm what
       * capabilities we're sending; the model identity stays in the
       * DB only. */
      console.log(
        '[DEBUG-LLM] Sending tools to upstream:',
        JSON.stringify(tools.map((t) => t.function?.name)),
        'tools.length:',
        tools.length,
      );
    }
    let response: Response | undefined;
    /* rate limits (429 rpm exhausted) and transient 5xx
       errors kill the stream instantly. Retry the initial POST with
       exponential backoff BEFORE any byte is streamed downstream, so a
       rate-limited request gets a second chance instead of ending the
       turn. We never retry mid-stream: once streaming has started the
       caller has already forwarded content to the client.

       Attempts are also bounded by one elapsed/backoff budget, shared across
       payload variants. A long Retry-After is reported without sleeping. */
    let lastError: Error | null = null;
    const variants = requestBodyVariants(opts, true);
    let successfulVariant: (typeof variants)[number] | null = null;
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
      const variant = variants[variantIndex];
      let tryNextVariant = false;
      /* The budget depends on how the provider answers, which we only know
         once we have asked, so it is read per attempt rather than fixed up
         front: a turn that first meets a 503 (3 attempts) and then a 429
         (5) spends the longer budget it now needs. */
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) {
          onError(new Error('LLM request aborted'));
          return;
        }
        try {
          markLlmActivity();
          response = await fetch(endpoint, {
            method: 'POST',
            headers: providerHeaders(apiKey, true),
            body: JSON.stringify(variant.body),
            signal,
            dispatcher: getLlmDispatcher(endpoint),
          } as unknown as RequestInit);
          if (response.ok) {
            successfulVariant = variant;
            break;
          }

          const errBody = await response.text().catch(() => '');
          if (response.status === 400) {
            console.warn(
              '[LLM] rejected stream request',
              JSON.stringify({
                capability: modelCapability(opts.model).id,
                variant: variant.reason,
                fields: Object.keys(variant.body),
                toolCount: Array.isArray(tools) ? tools.length : 0,
              }),
            );
          }
          const delayMs = upstreamRetryDelayMs(
            response.status,
            attempt,
            response.headers.get('retry-after'),
          );
          lastError = new LlmProviderError(
            response.status,
            errBody,
            response.status === RATE_LIMIT_STATUS && !isPermanentQuotaError(errBody)
              ? delayMs
              : undefined,
          );
          const fallbackIndex =
            response.status === 400
              ? nextCompatibilityVariant(variants, variantIndex, errBody)
              : -1;
          if (fallbackIndex >= 0) {
            tryNextVariant = true;
            variantIndex = fallbackIndex - 1; // outer loop advances to the diagnosed body
            if (variants[fallbackIndex]?.reason === 'provider-400-with-tools') {
              console.warn(
                '[LLM] provider rejected native tool request; retrying with compatibility payload',
                JSON.stringify({
                  status: response.status,
                  toolCount: Array.isArray(tools) ? tools.length : 0,
                  maxTokens: variant.body.max_tokens,
                }),
              );
            } else {
              console.warn(
                '[LLM] provider rejected optional request fields; retrying with compatibility payload',
                JSON.stringify({
                  status: response.status,
                  maxTokens: variant.body.max_tokens,
                }),
              );
            }
            break;
          }
          if (!isRetryableUpstreamStatus(response.status) || isPermanentQuotaError(errBody)) break;
          /* Rate-limited / transient failure — wait and retry with a delay
             sized to the failure kind (see upstreamRetryDelayMs). */
          const total = attemptsForUpstreamStatus(response.status);
          if (attempt >= total - 1) break;
          if (!retryBudget.reserve(delayMs)) break;
          console.warn(
            '[LLM] upstream ' + response.status + '; retrying',
            JSON.stringify({
              attempt: attempt + 1,
              of: total,
              delayMs,
              variantIndex,
            }),
          );
          await sleep(delayMs, signal);
          if (signal?.aborted) {
            onError(new Error('LLM request aborted'));
            return;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err; // let the outer catch classify it
          lastError = err as Error;
          const retryDelayMs = isTransientSocketReset(err) ? 350 : 1000;
          if (attempt < TRANSIENT_ATTEMPTS - 1 && retryBudget.reserve(retryDelayMs)) {
            await sleep(retryDelayMs, signal);
            continue;
          }
          throw Object.assign(err as Error, { retryable: false });
        }
      }
      if (response?.ok) break;
      if (!tryNextVariant) break;
    }

    if (!response?.ok) {
      onError(lastError || new Error('LLM API request failed'));
      return;
    }

    if (opts.response_speed === 'fast' && successfulVariant?.speedApplied === 'standard') {
      opts.onPreferenceFallback?.({
        preference: 'response_speed',
        requested: 'fast',
        applied: 'standard',
      });
    }

    if (!response!.body) {
      onError(new Error('LLM API returned empty body'));
      return;
    }

    reader = response!.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bareJson = '';
    let finishReason: string | null = null;
    const reasoningDetails: Record<string, unknown>[] = [];
    /* Raw `usage` object from the upstream, if it sent one. Kept raw rather
       than normalised here so services/core/usageTracker.ts owns the per-provider
       shape handling in exactly one place. */
    let providerUsage: unknown = null;
    /* tool_call deltas arrive indexed by `index`. We accumulate them
       into full {id, type, function:{name, arguments}} objects that
       mirror what the model would have produced in a non-streaming
       response. Providers that omit `index` are tracked by id instead
       (see _accumulateToolCall). */
    const toolCallAcc = new Map();
    const _toolSlotById = new Map<string, number>();
    let _nextToolSlot = 0;
    let _lastToolSlot = -1;
    /* throttle the tool_call_delta emission so a
       high-frequency upstream doesn't flood the SSE channel. We coalesce
       the per-delta callbacks to at most one per ~30 ms (or every 64
       bytes of accumulated arguments) so the client gets a smooth
       typewriter effect instead of jittery 1-char bursts. */
    const lastToolDeltas = new Map<
      number,
      { at: number; bytes: number; id?: string; name: string }
    >();
    const _emitToolDelta = (entry: {
      __index: number;
      id?: string;
      function: { name: string; arguments: string };
    }) => {
      if (typeof onToolCallDelta !== 'function') return;
      const now = Date.now();
      const bytes = (entry.function.arguments || '').length;
      const name = entry.function.name;
      const last = lastToolDeltas.get(entry.__index);
      if (
        last &&
        last.id === entry.id &&
        last.name === name &&
        now - last.at < 30 &&
        bytes - last.bytes < 64
      )
        return;
      lastToolDeltas.set(entry.__index, { at: now, bytes, id: entry.id, name });
      try {
        onToolCallDelta({
          index: entry.__index,
          id: entry.id,
          name,
          arguments: entry.function.arguments,
        });
      } catch {
        /* empty-catch: intentional — a consumer callback threw; stream parsing must continue */
      }
    };
    const _accumulateToolCall = (
      tc: Record<string, unknown>,
      positionInDelta = 0,
      entriesInDelta = 1,
    ) => {
      const rawIndex = tc.index;
      const id = typeof tc.id === 'string' && tc.id ? tc.id : '';
      /* Slot resolution, most reliable signal first:
         1. `index` — the OpenAI contract, present on every delta of a call.
         2. a known id — the provider omits `index` but identifies the call.
         3. a NEW id with no index — a second call; it gets its own slot.
            Folding it onto slot 0 (the old fallback) overwrote the first
            call's arguments and lost one of the two calls entirely.
         4. several entries packed into one delta with neither field — the
            array position is the only ordering we have.
         5. a single anonymous entry — a continuation of the open call. */
      let slot: number;
      if (Number.isInteger(rawIndex)) slot = rawIndex as number;
      else if (id && _toolSlotById.has(id)) slot = _toolSlotById.get(id)!;
      else if (id) slot = _nextToolSlot;
      else if (entriesInDelta > 1) slot = positionInDelta;
      else slot = _lastToolSlot >= 0 ? _lastToolSlot : _nextToolSlot;
      if (id) _toolSlotById.set(id, slot);
      _nextToolSlot = Math.max(_nextToolSlot, slot + 1);
      _lastToolSlot = slot;

      const functionPart =
        tc.function && typeof tc.function === 'object'
          ? (tc.function as Record<string, unknown>)
          : undefined;
      const incomingName = functionPart?.name ?? tc.name;
      const incomingArguments = functionPart?.arguments ?? tc.arguments;
      const prev = toolCallAcc.get(slot) || {
        id: undefined,
        type: 'function',
        function: { name: '', arguments: '' },
        __index: slot,
        __argStream: createToolArgumentStream(),
      };
      /* The stream mode is per call slot, so a provider that snapshots
         arguments is detected once and then trusted for the whole call. */
      const argStream = appendToolArgumentDelta(prev.__argStream, incomingArguments);
      const next = {
        id: id || prev.id,
        type: 'function' as const,
        function: {
          name: mergeToolNameDelta(prev.function.name, incomingName),
          arguments: argStream.text,
        },
        __index: slot,
        __argStream: argStream,
      };
      toolCallAcc.set(slot, next);
      _emitToolDelta(next);
    };

    // Both complete lines and the final unterminated line use the same parser.
    const consumeLine = (line: string): 'continue' | 'done' | 'error' => {
      const trimmed = line.trim();
      const isData = trimmed.startsWith('data:');
      if (!isData && !bareJson && !trimmed.startsWith('{')) return 'continue';
      const payload = isData ? trimmed.slice(5).trimStart() : bareJson + trimmed;
      bareJson = '';
      if (payload === '[DONE]') return 'done';
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        // Some gateways return a pretty-printed error body with HTTP 200.
        // Bound this buffer and reset it as soon as real SSE data arrives.
        if (!isData && payload.length < 65_536) bareJson = payload;
        return 'continue';
      }
      if (!isRecord(json)) return 'continue';
      const failure = providerPayloadFailure(json);
      if (failure) {
        onError(new LlmProviderError(failure.status, failure.body));
        return 'error';
      }
      if (!isData) return 'continue';
      // Usage may arrive in a frame with no choices, after the final delta.
      if (isRecord(json.usage)) providerUsage = json.usage;
      const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
      if (!isRecord(choice)) return 'continue';
      if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
      const delta = choice.delta;
      if (!isRecord(delta)) return 'continue';
      const details = Array.isArray(delta.reasoning_details)
        ? delta.reasoning_details.filter(isRecord)
        : [];
      // Keep provider blocks unchanged and ordered for the next tool hop.
      reasoningDetails.push(...details);
      const reasoning =
        reasoningText(delta) ||
        details
          .filter((detail) => detail.type === 'reasoning.text' && typeof detail.text === 'string')
          .map((detail) => detail.text)
          .join('');
      if (reasoning && onReasoning) {
        try {
          onReasoning(reasoning);
        } catch {
          /* empty-catch: intentional — a reasoning listener must not break stream parsing */
        }
      }
      if (Array.isArray(delta.tool_calls)) {
        for (let i = 0; i < delta.tool_calls.length; i++) {
          const call = delta.tool_calls[i];
          if (isRecord(call)) _accumulateToolCall(call, i, delta.tool_calls.length);
        }
      }
      if (isRecord(delta.function_call)) _accumulateToolCall(delta.function_call);
      if (typeof delta.content === 'string' && delta.content) onChunk(delta.content);
      return 'continue';
    };

    readStream: while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (consumeLine(buffer + decoder.decode()) === 'error') return;
        break;
      }
      if (!value?.byteLength) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const terminal = consumeLine(line);
        if (terminal === 'error') return;
        // The gateway can keep the body open after the protocol terminator.
        if (terminal === 'done') break readStream;
      }
    }

    const hasCallableTools = Array.from(toolCallAcc.values()).some((entry) =>
      Boolean(entry.function?.name),
    );
    const shouldDispatchTools =
      isToolFinishReason(finishReason) ||
      finishReason == null ||
      finishReason === 'length' ||
      (finishReason === 'stop' && hasCallableTools);
    const finalizedToolCalls = Array.from(toolCallAcc.values()).map((entry) => ({
      ...entry,
      id: entry.id || (shouldDispatchTools ? `call_${randomUUID()}` : undefined),
    }));

    /* emit a final tool_call_delta so the
       client gets the last few bytes that were throttled out by
       _emitToolDelta's time/size guard. Without this, the UI may
       show a code body that's 1-3 characters short of the final
       argument string until the next onToolUse frame arrives. */
    if (typeof onToolCallDelta === 'function') {
      for (const entry of finalizedToolCalls) {
        try {
          onToolCallDelta({
            index: entry.__index,
            id: entry.id,
            name: entry.function.name,
            arguments: entry.function.arguments,
            final: true,
          });
        } catch {
          /* empty-catch: intentional — a consumer callback threw during the final tool-delta flush */
        }
      }
    }

    /* Dispatch accumulated tool calls when the model decided to call
       a tool. The chat route listens for these in its tool-execution
       loop (Phase 3). Beyond the canonical tool finish reasons we also
       dispatch when the upstream omitted finish_reason entirely (null —
       some gateways never send the marker) or reported 'length': in both
       cases the accumulated calls would otherwise vanish silently and the
       turn would end with no answer. 'length' arguments are truncated and
       still fail argument parsing downstream, where they get the
       structured correction package — strictly better than a dead end.
       'stop'/'content_filter' finishes are honoured literally: a model
       that closed in prose is not invited to run the calls it may have
       streamed speculatively. */
    if (finalizedToolCalls.length > 0 && typeof onToolUse === 'function') {
      if (shouldDispatchTools) {
        for (const tc of finalizedToolCalls) {
          /* Hand out the protocol shape only — the accumulator's slot index
             and stream-mode state must not leak into the tool-call object
             the pipeline echoes back to the provider. */
          try {
            onToolUse({ id: tc.id, type: 'function', function: { ...tc.function } });
          } catch {
            /* empty-catch: intentional — a tool-use listener threw; the remaining calls still dispatch */
          }
        }
      } else {
        console.warn(
          '[LLM] streamed tool calls dropped — upstream finish_reason was',
          JSON.stringify(finishReason),
        );
      }
    }

    observePromptCacheUsage(providerUsage);
    onDone({
      finishReason,
      usage: providerUsage,
      ...(reasoningDetails.length ? { reasoningDetails } : {}),
    });
  } catch (err) {
    if (signal?.aborted) {
      onDone({ finishReason: null });
    } else {
      const normalized =
        err instanceof Error
          ? err
          : new Error(typeof err === 'string' && err.length > 0 ? err : 'LLM request failed');
      onError(normalized);
    }
  } finally {
    if (reader) {
      // Early error frames and DONE must not leave an unread provider body
      // holding a pool slot. Cleanup errors must not mask the stream result.
      try {
        await reader.cancel();
      } catch {
        /* empty-catch: intentional — the upstream body may already have failed; cleanup must not mask the result */
      }
      reader.releaseLock();
    }
  }
}

/**
 * Make a non-streaming chat completion call.
 * Returns { content, reasoning_content?, tool_calls? } or throws.
 *
 * When `tools` is provided, the upstream may return tool_calls instead of
 * (or alongside) text content. The caller drives the next hop; this
 * function does NOT execute tools or loop — it only forwards the request
 * and returns the raw upstream payload.
 */
