/**
 * Streaming chat completion over OpenAI-compatible SSE.
 */
import { randomUUID } from 'node:crypto';
import { applyProviderControls, isPermanentQuotaError, permitsCompatibilityFallback, providerHeaders, providerPayloadFailure } from '../llmProtocol.js';
import { createUpstreamRetryBudget } from '../../../lib/upstreamRetryBudget.js';
import { getLlmDispatcher, markLlmActivity } from './dispatcher.js';
import { LlmProviderError, type ChatCompletionRequestOptions } from './types.js';
import { RATE_LIMIT_ATTEMPTS, RATE_LIMIT_STATUS, TRANSIENT_ATTEMPTS, TRANSIENT_RETRYABLE_STATUS, attemptsForUpstreamStatus, isRetryableUpstreamStatus, isRetryableUpstreamFailure, sleep, upstreamRetryDelayMs } from './retry.js';
import { isToolFinishReason, nextCompatibilityVariant, requestBodyVariants } from './protocol.js';
import { appendToolArgumentDelta, createToolArgumentStream, mergeToolArgumentDelta, mergeToolNameDelta } from './toolArgs.js';
import { reasoningText } from './values.js';

export async function streamChatCompletion(
  opts: ChatCompletionRequestOptions,
  onChunk: (chunk: string) => void,
  onDone: (info: { finishReason: string | null; usage?: unknown }) => void,
  onError: (err: Error) => void,
  onReasoning?: (reasoning: string) => void,
  onToolUse?: (tc: { id: string; type: 'function'; function: { name: string; arguments: string } }) => void,
  onToolCallDelta?: (delta: { index: number; id?: string; name?: string; argumentsDelta?: string; arguments: string; final?: boolean }) => void,
) {
  const { apiBase, apiKey, signal, tools } = opts;
  const retryBudget = createUpstreamRetryBudget();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    if (Array.isArray(tools) && tools.length > 0) {
      /* P_privacy-leak — don't log the upstream model name. The
       * provider-agnostic tool names are enough to confirm what
       * capabilities we're sending; the model identity stays in the
       * DB only. */
      console.log('[DEBUG-LLM] Sending tools to upstream:', JSON.stringify(tools.map(t => t.function?.name)), 'tools.length:', tools.length);
    }
    let response: Response | undefined;
    /* P_llm-retry — rate limits (429 rpm exhausted) and transient 5xx
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
        if (signal && signal.aborted) {
          onError(new Error('LLM request aborted'));
          return;
        }
        try {
          markLlmActivity();
          response = await fetch(`${apiBase}/chat/completions`, {
            method: 'POST',
            headers: providerHeaders(apiKey, true),
            body: JSON.stringify(variant.body),
            signal,
            dispatcher: getLlmDispatcher(),
          } as unknown as RequestInit);
          if (response.ok) {
            successfulVariant = variant;
            break;
          }

          const errBody = await response.text().catch(() => '');
          const delayMs = upstreamRetryDelayMs(response.status, attempt, response.headers.get('retry-after'));
          lastError = new LlmProviderError(response.status, errBody,
            response.status === RATE_LIMIT_STATUS && !isPermanentQuotaError(errBody) ? delayMs : undefined);
          const fallbackIndex = response.status === 400 ? nextCompatibilityVariant(variants, variantIndex, errBody) : -1;
          if (fallbackIndex >= 0) {
            tryNextVariant = true;
            variantIndex = fallbackIndex - 1; // outer loop advances to the diagnosed body
            if (variants[fallbackIndex]?.reason === 'provider-400-with-tools') {
              console.warn('[LLM] provider rejected native tool request; retrying with compatibility payload', JSON.stringify({
                status: response.status,
                toolCount: Array.isArray(tools) ? tools.length : 0,
                maxTokens: variant.body.max_tokens,
              }));
            } else {
              console.warn('[LLM] provider rejected optional request fields; retrying with compatibility payload', JSON.stringify({
                status: response.status,
                maxTokens: variant.body.max_tokens,
              }));
            }
            break;
          }
          if (!isRetryableUpstreamStatus(response.status) || isPermanentQuotaError(errBody)) break;
          /* Rate-limited / transient failure — wait and retry with a delay
             sized to the failure kind (see upstreamRetryDelayMs). */
          const total = attemptsForUpstreamStatus(response.status);
          if (attempt >= total - 1) break;
          if (!retryBudget.reserve(delayMs)) break;
          console.warn('[LLM] upstream ' + response.status + '; retrying', JSON.stringify({
            attempt: attempt + 1,
            of: total,
            delayMs,
            variantIndex,
          }));
          await sleep(delayMs, signal);
          if (signal && signal.aborted) {
            onError(new Error('LLM request aborted'));
            return;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err; // let the outer catch classify it
          lastError = err as Error;
          if (attempt < TRANSIENT_ATTEMPTS - 1 && retryBudget.reserve(1000)) {
            await sleep(1000, signal);
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
    let finishReason: string | null = null;
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
    /* P_tool_stream_emit — throttle the tool_call_delta emission so a
       high-frequency upstream doesn't flood the SSE channel. We coalesce
       the per-delta callbacks to at most one per ~30 ms (or every 64
       bytes of accumulated arguments) so the client gets a smooth
       typewriter effect instead of jittery 1-char bursts. */
    let _lastDeltaEmit = 0;
    let _lastDeltaBytes = 0;
    const _emitToolDelta = (entry: { __index: number; id?: string; function: { name: string; arguments: string } }, full: string) => {
      if (typeof onToolCallDelta !== 'function') return;
      const now = Date.now();
      const bytes = (entry.function.arguments || '').length;
      if (now - _lastDeltaEmit < 30 && bytes - _lastDeltaBytes < 64) return;
      _lastDeltaEmit = now;
      _lastDeltaBytes = bytes;
      try { onToolCallDelta({
        index: entry.__index,
        id: entry.id,
        name: entry.function.name,
        arguments: entry.function.arguments,
      }); } catch { /* ignore listener errors */ }
    };
    const _accumulateToolCall = (tc: Record<string, unknown>, positionInDelta = 0, entriesInDelta = 1) => {
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

      const functionPart = tc.function && typeof tc.function === 'object'
        ? tc.function as Record<string, unknown>
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
      _emitToolDelta(next, next.function.arguments);
    };

    readStream: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:') && trimmed.slice(5).trim() === '[DONE]') {
          // The protocol is complete even if the gateway keeps its body open.
          // Ignore any bytes after DONE; usage must precede this marker.
          buffer = '';
          break readStream;
        }
        if (!trimmed) continue;
        if (!trimmed.startsWith('data:')) {
          if (trimmed.startsWith('{')) {
            try {
              const errObj = JSON.parse(trimmed);
              const failure = providerPayloadFailure(errObj);
              if (failure) {
                onError(new LlmProviderError(failure.status, failure.body));
                return;
              }
            } catch { /* ignore */ }
          }
          continue;
        }

        try {
          const json = JSON.parse(trimmed.slice(5).trimStart());
          const failure = providerPayloadFailure(json);
          if (failure) {
            onError(new LlmProviderError(failure.status, failure.body));
            return;
          }
          /* Usage arrives in its OWN frame, after the last content delta,
             with `choices: []`. It must be read BEFORE the `!delta` guard
             below — that guard is why `stream_options.include_usage` data
             was silently discarded even on providers that honour it, leaving
             usageTracker with nothing but a chars/4 estimate. */
          if (json.usage && typeof json.usage === 'object') providerUsage = json.usage;
          const delta = json.choices?.[0]?.delta;
          if (!delta) {
            /* Still worth checking for finish_reason: some gateways send a
               final choices entry with no delta. */
            const finalChoice = json.choices?.[0];
            if (finalChoice && finalChoice.finish_reason) finishReason = finalChoice.finish_reason;
            continue;
          }
          /* P_deepseek-mode — reasoning_content arrives on a separate
             field on DeepSeek-family models when the request included
             `extra_body.thinking.type: enabled`. Surface it through a
             dedicated callback so the client can render it as a
             thinking pill and persist it on the assistant message
             for the next turn. */
          if (typeof onReasoning === 'function') {
            const reasoning = reasoningText(delta);
            if (reasoning.length > 0) {
              try { onReasoning(reasoning); } catch { /* ignore */ }
            }
          }
          /* Tool-call deltas. Each entry carries a partial id/name/
             arguments; we accumulate by `index` and flush once the
             upstream signals finish_reason='tool_calls'. We also
             forward a throttled delta to onToolCallDelta so the
             client can stream the in-progress JSON (e.g. Python
             source) live instead of waiting for completion. */
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            /* Pass the array position as the fallback index: providers
               that omit `index` but pack several tool_calls into one
               delta must not collapse every entry into slot 0. */
            for (let i = 0; i < delta.tool_calls.length; i++) {
              _accumulateToolCall(delta.tool_calls[i], i, delta.tool_calls.length);
            }
          }
          /* Older OpenAI-compatible gateways use the pre-tools
             `delta.function_call` shape. Treat it as tool index 0 so a
             `finish_reason: function_call` response still reaches the same
             validation and execution path as native tool_calls. */
          if (delta.function_call && typeof delta.function_call === 'object') {
            _accumulateToolCall(delta.function_call as Record<string, unknown>);
          }
          /* finish_reason only appears on the last chunk of a stream.
             Capture it so onDone can dispatch the tool loop. */
          const choice = json.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const content = delta.content || '';
          if (content) onChunk(content);
        } catch {
          // Skip malformed frames
        }
      }
    }

    // Flush remaining buffer. Trim before the prefix check: upstreams
    // that end the stream with "\ndata: {...}" (no trailing newline)
    // leave leading whitespace in the buffer, and the old
    // `buffer.startsWith('data: ')` guard silently dropped that final
    // frame — truncating the tail of a streamed tool call.
    const tail = buffer.trim();
    if (tail.startsWith('data:') || tail.startsWith('{')) {
      try {
        const json = JSON.parse(tail.startsWith('data:') ? tail.slice(5).trimStart() : tail);
        const failure = providerPayloadFailure(json);
        if (failure) {
          onError(new LlmProviderError(failure.status, failure.body));
          return;
        }
        /* The usage frame is the LAST frame of the stream, so it very often
           ends up here rather than in the loop above — the buffer keeps it
           when the upstream closes without a trailing newline. Read it
           before the `if (delta)` guard for the same reason as above. */
        if (json.usage && typeof json.usage === 'object') providerUsage = json.usage;
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          if (typeof onReasoning === 'function') {
            const reasoning = reasoningText(delta);
            if (reasoning.length > 0) {
              try { onReasoning(reasoning); } catch { /* ignore */ }
            }
          }
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            for (let i = 0; i < delta.tool_calls.length; i++) {
              _accumulateToolCall(delta.tool_calls[i], i, delta.tool_calls.length);
            }
          }
          if (delta.function_call && typeof delta.function_call === 'object') {
            _accumulateToolCall(delta.function_call as Record<string, unknown>);
          }
          const choice = json.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const content = delta.content || '';
          if (content) onChunk(content);
        }
      } catch { /* skip */ }
    }

    const hasCallableTools = Array.from(toolCallAcc.values()).some((entry) => Boolean(entry.function?.name));
    const shouldDispatchTools = isToolFinishReason(finishReason)
      || finishReason == null
      || finishReason === 'length'
      || (finishReason === 'stop' && hasCallableTools);
    const finalizedToolCalls = Array.from(toolCallAcc.values()).map((entry) => ({
      ...entry,
      id: entry.id || (shouldDispatchTools ? `call_${randomUUID()}` : undefined),
    }));

    /* P_tool_stream_finalize — emit a final tool_call_delta so the
       client gets the last few bytes that were throttled out by
       _emitToolDelta's time/size guard. Without this, the UI may
       show a code body that's 1-3 characters short of the final
       argument string until the next onToolUse frame arrives. */
    if (typeof onToolCallDelta === 'function') {
      for (const entry of finalizedToolCalls) {
        try { onToolCallDelta({
          index: entry.__index,
          id: entry.id,
          name: entry.function.name,
          arguments: entry.function.arguments,
          final: true,
        }); } catch { /* ignore listener errors */ }
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
          try { onToolUse({ id: tc.id, type: 'function', function: { ...tc.function } }); } catch { /* ignore listener errors */ }
        }
      } else {
        console.warn('[LLM] streamed tool calls dropped — upstream finish_reason was', JSON.stringify(finishReason));
      }
    }

    onDone({ finishReason, usage: providerUsage });
  } catch (err) {
    if ((signal && signal.aborted) || (err as Error | undefined)?.name === 'AbortError') {
      onDone({ finishReason: null });
    } else {
      const normalized = err instanceof Error
        ? err
        : new Error(typeof err === 'string' && err.length > 0 ? err : 'LLM request failed');
      onError(normalized);
    }
  } finally {
    if (reader) {
      // Early error frames and DONE must not leave an unread provider body
      // holding a pool slot. Cleanup errors must not mask the stream result.
      try { await reader.cancel(); } catch { /* upstream may already have failed */ }
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
