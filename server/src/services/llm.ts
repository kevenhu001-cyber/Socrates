/**
 * LLM proxy service — calls external chat completion APIs and streams
 * the response back in OpenAI-compatible SSE format.
 *
 * Supports: any OpenAI-compatible API (OpenAI, Anthropic via proxy, MiniMax, etc.)
 */

/* LLM streaming budgets.
 *
 * LLM_TOTAL_TIMEOUT_MS — hard ceiling on the entire upstream request.
 *   0 (default) = no ceiling; set it when a deployment needs a hard cap so
 *   a stuck upstream cannot hold a worker forever. Kept off by default
 *   because a reasoning model may legitimately think for minutes.
 *
 * LLM_SILENCE_TIMEOUT_MS — aborts the upstream fetch when NO bytes arrive
 *   for this many ms. Defaults to 120 s: a live reasoning stream emits
 *   deltas continuously, so 2 min of total silence means a dead
 *   connection, not deep thought. Set to 0 to disable. The watchdog is
 *   deliberately armed only AFTER the first chunk (see P_silence_fix
 *   below), so it does not bound the initial thinking latency.
 *
 * LLM_FIRST_BYTE_TIMEOUT_MS — bounds the wait for the FIRST byte,
 *   covering both the POST and the initial thinking burst. Defaults to
 *   180 s, comfortably above the 60–120 s that reasoning models
 *   (DeepSeek R1, QwQ, MiniMax reasoning variants) routinely take
 *   before their first token. Without it, a provider that accepts the
 *   socket but never emits a byte holds the request forever when
 *   LLM_TOTAL_TIMEOUT_MS is 0. Set to 0 to disable. */
function readTimeoutEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
const LLM_TOTAL_TIMEOUT_MS = readTimeoutEnv('LLM_TOTAL_TIMEOUT_MS', 0);
const LLM_SILENCE_TIMEOUT_MS = readTimeoutEnv('LLM_SILENCE_TIMEOUT_MS', 120000);
/* Read per call rather than cached at module load, so a deployment can
 * tune the budget without restarting the process. */
function llmFirstByteTimeoutMs(): number {
  return readTimeoutEnv('LLM_FIRST_BYTE_TIMEOUT_MS', 180000);
}

/** Aborts when any of the given signals aborts; never aborts on its own. */
function combineSignals(...candidates: Array<AbortSignal | null | undefined>): AbortSignal {
  const signals = candidates.filter((item): item is AbortSignal => item != null);
  if (signals.length === 0) return new AbortController().signal;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}
/* P_provider-max-tokens — 32K was larger than the output budget accepted by
 * a number of OpenAI-compatible gateways.  Keep the public request ceiling
 * at 32K, but use a conservative default when the caller did not choose a
 * budget explicitly.  Operators can raise this for a known-compatible
 * provider without changing the API contract. */
const DEFAULT_MAX_TOKENS = Math.max(256, Number.parseInt(process.env.LLM_DEFAULT_MAX_TOKENS || '8192', 10) || 8192);

interface ChatCompletionRequestOptions {
  apiBase: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  reasoning_effort?: string;
  response_speed?: 'standard' | 'fast';
  extra_body?: Record<string, unknown>;
  tools?: Array<{ type: 'function'; function: { name: string; [key: string]: unknown } }>;
  tool_choice?: unknown;
  onPreferenceFallback?: (detail: {
    preference: 'response_speed';
    requested: 'fast';
    applied: 'standard';
  }) => void;
}

/** Preserve useful upstream context without exposing credentials. */
export class LlmProviderError extends Error {
  readonly status: number;
  readonly providerBody: string;

  constructor(status: number, body: string) {
    const compactBody = body.slice(0, 200);
    super(`LLM API error ${status}: ${compactBody}`);
    this.name = 'LlmProviderError';
    this.status = status;
    this.providerBody = compactBody;
  }
}

function normalizeProviderMessages(messages: ChatCompletionRequestOptions['messages']) {
  /* OpenAI permits null assistant content alongside tool_calls. Several
   * compatibility layers do not, and reject the entire second tool hop with
   * a provider-side 400. Empty string is semantically equivalent here and is
   * accepted by both strict and permissive gateways. */
  return messages.map((message) => {
    if ((message.role === 'assistant' && Array.isArray(message.tool_calls)) || message.role === 'tool') {
      return { ...message, content: message.content == null ? '' : message.content };
    }
    return message;
  });
}

function requestBodyVariants(opts: ChatCompletionRequestOptions, stream: boolean) {
  const { model, messages, maxTokens, temperature = stream ? 0.7 : 0.3, reasoning_effort, response_speed, extra_body, tools, tool_choice } = opts;
  const base = {
    model,
    messages: normalizeProviderMessages(messages),
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    temperature,
    stream,
    ...(reasoning_effort ? { reasoning_effort } : {}),
    ...(response_speed === 'fast' ? { service_tier: 'priority' } : {}),
    ...(extra_body ? { ...extra_body } : {}),
  } as Record<string, unknown>;
  const hasTools = Array.isArray(tools) && tools.length > 0;
  const withTools: Record<string, unknown> = {
    ...base,
    ...(hasTools ? { tools, ...(tool_choice ? { tool_choice } : {}) } : {}),
  };

  /* Some gateways advertise chat completions but reject the native tools
   * field. A single no-tools retry recovers a normal answer and avoids
   * presenting a raw provider 400 to the user. This is deliberately a
   * request-local fallback, so a temporary incompatibility cannot disable
   * tools for every later conversation. */
  const variants: Array<{ body: Record<string, unknown>; reason: string; speedApplied: 'standard' | 'fast' }> = [
    { body: withTools, reason: 'initial', speedApplied: response_speed === 'fast' ? 'fast' : 'standard' },
  ];
  let compatibilityBase = withTools;
  /* Priority service is provider-specific. Its fallback is deliberately the
     first compatibility variant so tools, reasoning_effort and extra_body
     survive when a generic OpenAI-compatible gateway rejects service_tier. */
  if (response_speed === 'fast') {
    const { service_tier: _serviceTier, ...withoutPriority } = withTools;
    compatibilityBase = withoutPriority;
    variants.push({ body: withoutPriority, reason: 'provider-400-without-priority', speedApplied: 'standard' });
  }
  if (hasTools) {
    const { tools: _tools, tool_choice: _toolChoice, ...withoutTools } = compatibilityBase;
    compatibilityBase = withoutTools;
    variants.push({ body: withoutTools, reason: 'provider-400-with-tools', speedApplied: 'standard' });
  }
  /* Optional reasoning fields are another common source of 400s on generic
   * gateways. Only try this stricter form after the previous compatibility
   * variant, never on a successful request. */
  if (reasoning_effort || extra_body) {
    const { reasoning_effort: _effort, ...withoutReasoning } = compatibilityBase;
    const withoutOptional = { ...withoutReasoning };
    for (const key of Object.keys(extra_body || {})) delete withoutOptional[key];
    variants.push({ body: withoutOptional, reason: 'provider-400-with-optional-fields', speedApplied: 'standard' });
  }
  return variants;
}

export function isToolFinishReason(reason: unknown): boolean {
  return reason === 'tool_calls' || reason === 'tool_call' || reason === 'function_call';
}

/** Normalize provider-specific tool argument streaming.
 *
 * OpenAI sends JSON fragments, while several compatible providers send an
 * object or repeat the complete accumulated JSON on every delta. Blind string
 * concatenation turns those valid variants into `[object Object]` or two JSON
 * objects stuck together, which then fails strict argument parsing.
 */
export function mergeToolArgumentDelta(previous: unknown, incoming: unknown): string {
  const prev = typeof previous === 'string' ? previous : String(previous ?? '');
  let next = '';
  if (typeof incoming === 'string') next = incoming;
  else if (incoming && typeof incoming === 'object') {
    try { next = JSON.stringify(incoming); } catch { next = ''; }
  } else if (incoming != null) next = String(incoming);
  if (!next) return prev;
  if (!prev) return next;
  if (next === prev || next.startsWith(prev)) return next;
  if (prev.endsWith(next)) return prev;

  /* A number of OpenAI-compatible gateways send the complete accumulated
     JSON object on every delta instead of sending a fragment. If the new
     value is already a complete object, it is the latest snapshot and must
     replace the previous snapshot. Concatenating the two objects here was
     the main source of `invalid_tool_arguments` on otherwise valid calls. */
  try {
    const parsedNext = JSON.parse(next) as unknown;
    if (parsedNext && typeof parsedNext === 'object' && !Array.isArray(parsedNext)) {
      return next;
    }
  } catch {
    // The incoming value is a fragment; append it below.
  }
  return prev + next;
}

export function mergeToolNameDelta(previous: unknown, incoming: unknown): string {
  const prev = typeof previous === 'string' ? previous : String(previous ?? '');
  const next = typeof incoming === 'string' ? incoming : String(incoming ?? '');
  if (!next) return prev;
  if (!prev) return next;
  if (next === prev || next.startsWith(prev)) return next;
  if (prev.startsWith(next) || prev.endsWith(next)) return prev;
  return (prev + next).slice(0, 128);
}

/**
 * Stream a chat completion from an external LLM provider.
 *
 * @param {object} opts
 * @param {string} opts.apiBase  - Base URL of the provider API
 * @param {string} opts.apiKey   - API key
 * @param {string} opts.model    - Model name
 * @param {Array}  opts.messages - Array of {role, content}
 * @param {number} opts.maxTokens
 * @param {number} opts.temperature
 * @param {AbortSignal} opts.signal - Optional abort signal
 * @param {Array}  [opts.tools]       - OpenAI-style tool definitions
 * @param {string} [opts.tool_choice] - 'auto' | 'none' | 'required' | {type:'function', function:{name}}
 * @param {function} onChunk     - Called with each text chunk
 * @param {function} onDone      - Called when streaming completes; receives { finishReason } so the
 *                                  caller can decide whether to dispatch tool calls
 * @param {function} onError     - Called on error
 * @param {function} [onReasoning] - Called with each reasoning_content chunk (DeepSeek-style)
 * @param {function} [onToolUse]   - Called once per fully streamed tool_call when finish_reason
 *                                  is 'tool_calls'. Each callback receives
 *                                  { id, type:'function', function:{ name, arguments } }.
 *                                  Arguments is the raw JSON string the upstream streamed —
 *                                  callers must parse it themselves.
 * @param {function} [onToolCallDelta] - Called on each tool_call delta with the partial
 *                                  accumulated state. Receives
 *                                  { index, id?, name?, argumentsDelta, arguments }
 *                                  so the chat route can stream the in-progress JSON
 *                                  (e.g. Python source) to the client for live rendering
 *                                  instead of waiting for finish_reason='tool_calls'.
 */
export async function streamChatCompletion(
  opts: ChatCompletionRequestOptions,
  onChunk: (chunk: string) => void,
  onDone: (info: { finishReason: string | null }) => void,
  onError: (err: Error) => void,
  onReasoning?: (reasoning: string) => void,
  onToolUse?: (tc: { id: string; type: 'function'; function: { name: string; arguments: string } }) => void,
  onToolCallDelta?: (delta: { index: number; id?: string; name?: string; argumentsDelta?: string; arguments: string; final?: boolean }) => void,
) {
  const { apiBase, apiKey, model, messages, maxTokens, temperature = 0.7, signal, reasoning_effort, extra_body, tools, tool_choice } = opts;

  const totalSignal = LLM_TOTAL_TIMEOUT_MS > 0 ? AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS) : null;
  const silenceController = new AbortController();
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  const armSilenceTimer = () => {
    if (LLM_SILENCE_TIMEOUT_MS <= 0) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      try { silenceController.abort('silence-timeout'); } catch { /* ignore */ }
    }, LLM_SILENCE_TIMEOUT_MS);
  };
  /* The first-byte budget covers the POST + initial thinking latency,
   * where the silence watchdog is intentionally not armed. A separate
   * controller keeps the abort classifiable as "provider never
   * responded" rather than a mid-stream stall. */
  const firstByteMs = llmFirstByteTimeoutMs();
  const firstByteController = new AbortController();
  let firstByteTimer: ReturnType<typeof setTimeout> | null = null;
  if (firstByteMs > 0) {
    firstByteTimer = setTimeout(() => {
      try { firstByteController.abort('first-byte-timeout'); } catch { /* ignore */ }
    }, firstByteMs);
  }
  const mergedSignal = combineSignals(
    signal,
    totalSignal,
    LLM_SILENCE_TIMEOUT_MS > 0 ? silenceController.signal : null,
    firstByteMs > 0 ? firstByteController.signal : null,
  );

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
       caller has already forwarded content to the client. */
    const RETRYABLE_STATUS = new Set([429, 502, 503]);
    const MAX_LLM_ATTEMPTS = 3; // initial + 2 retries
    let lastError: Error | null = null;
    const variants = requestBodyVariants(opts, true);
    let successfulVariant: (typeof variants)[number] | null = null;
    for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
      const variant = variants[variantIndex];
      let tryNextVariant = false;
      for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
        if (signal && signal.aborted) {
          onError(new Error('LLM request aborted'));
          return;
        }
        try {
          response = await fetch(`${apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(variant.body),
            signal: mergedSignal,
          });
          if (response.ok) {
            successfulVariant = variant;
            break;
          }

          const errBody = await response.text().catch(() => '');
          lastError = new LlmProviderError(response.status, errBody);
          if (response.status === 400 && variantIndex < variants.length - 1) {
            tryNextVariant = true;
            if (variants[variantIndex + 1]?.reason === 'provider-400-with-tools') {
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
          if (!RETRYABLE_STATUS.has(response.status)) break;
          // Rate-limited / transient failure — wait and retry.
          const backoffMs = attempt === 0 ? 1000 : 2000;
          await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
          if (signal && signal.aborted) {
            onError(new Error('LLM request aborted'));
            return;
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err; // let the outer catch classify it
          lastError = err as Error;
          if (attempt < MAX_LLM_ATTEMPTS - 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          throw err;
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

    const reader = response!.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason: string | null = null;
    /* tool_call deltas arrive indexed by `index`. We accumulate them
       into full {id, type, function:{name, arguments}} objects that
       mirror what the model would have produced in a non-streaming
       response. */
    const toolCallAcc = new Map();
    /* P_silence_fix — do NOT arm the silence watchdog before the first
       read. Reasoning models (DeepSeek R1, QwQ, MiniMax reasoning variants)
       routinely think for 60-120 s before emitting their first token. Arming
       the watchdog before the first reader.read() would count that initial
       thinking latency against the silence budget and abort the stream
       prematurely. Instead, we arm AFTER the first chunk arrives, and
       re-arm after every subsequent chunk. */
    let _firstChunkArrived = false;

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
    const _accumulateToolCall = (tc: Record<string, unknown>, fallbackIndex = 0) => {
      const rawIndex = tc.index;
      const i = Number.isInteger(rawIndex) ? rawIndex as number : fallbackIndex;
      const functionPart = tc.function && typeof tc.function === 'object'
        ? tc.function as Record<string, unknown>
        : undefined;
      const incomingName = functionPart?.name ?? tc.name;
      const incomingArguments = functionPart?.arguments ?? tc.arguments;
      const prev = toolCallAcc.get(i) || {
        id: undefined,
        type: 'function',
        function: { name: '', arguments: '' },
      };
      const next = {
        id: typeof tc.id === 'string' && tc.id ? tc.id : prev.id,
        type: 'function' as const,
        function: {
          name: mergeToolNameDelta(prev.function.name, incomingName),
          arguments: mergeToolArgumentDelta(prev.function.arguments, incomingArguments),
        },
        __index: i,
      };
      toolCallAcc.set(i, next);
      _emitToolDelta(next, next.function.arguments);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      /* P_silence_fix — arm the watchdog on the first real chunk
         (not before). The initial thinking burst is bounded by the
         first-byte timer instead, which is cleared here. After the
         first chunk, the watchdog guards against genuine mid-stream
         stalls. */
      if (!_firstChunkArrived) {
        _firstChunkArrived = true;
        if (firstByteTimer) { clearTimeout(firstByteTimer); firstByteTimer = null; }
        armSilenceTimer();
      } else {
        /* Reset the silence timer: we just got bytes, the connection
           is alive. If the model stalls for >LLM_SILENCE_TIMEOUT_MS
           with no bytes between chunks, we'll time out. */
        armSilenceTimer();
      }
      if (!value || value.byteLength === 0) continue;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;
          /* P_deepseek-mode — reasoning_content arrives on a separate
             field on DeepSeek-family models when the request included
             `extra_body.thinking.type: enabled`. Surface it through a
             dedicated callback so the client can render it as a
             thinking pill and persist it on the assistant message
             for the next turn. */
          if (typeof onReasoning === 'function') {
            const reasoning = delta.reasoning_content;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
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
            for (const tc of delta.tool_calls) _accumulateToolCall(tc);
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
    if (tail.startsWith('data: ')) {
      try {
        const json = JSON.parse(tail.slice(6));
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          if (typeof onReasoning === 'function') {
            const reasoning = delta.reasoning_content;
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              try { onReasoning(reasoning); } catch { /* ignore */ }
            }
          }
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            for (const tc of delta.tool_calls) _accumulateToolCall(tc);
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

    if (silenceTimer) clearTimeout(silenceTimer);
    if (firstByteTimer) clearTimeout(firstByteTimer);

    /* P_tool_stream_finalize — emit a final tool_call_delta so the
       client gets the last few bytes that were throttled out by
       _emitToolDelta's time/size guard. Without this, the UI may
       show a code body that's 1-3 characters short of the final
       argument string until the next onToolUse frame arrives. */
    if (typeof onToolCallDelta === 'function') {
      for (const [idx, entry] of toolCallAcc.entries()) {
        try { onToolCallDelta({
          index: idx,
          id: entry.id,
          name: entry.function.name,
          arguments: entry.function.arguments,
          final: true,
        }); } catch { /* ignore listener errors */ }
      }
    }

    /* Dispatch accumulated tool calls when the model decided to call
       a tool. The chat route listens for these in its tool-execution
       loop (Phase 3). */
    if (isToolFinishReason(finishReason) && typeof onToolUse === 'function') {
      for (const tc of toolCallAcc.values()) {
        try { onToolUse(tc); } catch { /* ignore listener errors */ }
      }
    }

    onDone({ finishReason });
  } catch (err) {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (firstByteTimer) clearTimeout(firstByteTimer);
    if ((err as Error).name === 'AbortError') {
      // Distinguish user-initiated abort (client disconnect) from the
      // optional server-side deadlines. The user signal fires on
      // disconnect; LLM_TOTAL_TIMEOUT_MS / LLM_SILENCE_TIMEOUT_MS /
      // LLM_FIRST_BYTE_TIMEOUT_MS only exist when configured on.
      if (signal && signal.aborted) {
        onDone({ finishReason: null }); // Client disconnected — clean close
      } else if (firstByteController.signal.aborted) {
        onError(new Error(`LLM request timed out: no response bytes for ${firstByteMs / 1000} s`));
      } else if (silenceController.signal.aborted) {
        onError(new Error(`LLM stream stalled: no data for ${LLM_SILENCE_TIMEOUT_MS / 1000} s`));
      } else if (LLM_TOTAL_TIMEOUT_MS > 0) {
        onError(new Error(`LLM request timed out after ${LLM_TOTAL_TIMEOUT_MS / 1000} s`));
      } else {
        /* No deadline is configured, so there is nothing to report as a
           timeout; treat it as a closed connection. */
        onDone({ finishReason: null });
      }
    } else {
      onError(err as Error);
    }
  } finally {
    /* The early-error returns above (`!response.ok`, empty body, aborted
     * signal) skip both clear sites; a live first-byte timer would pin the
     * event loop for its full duration. This is the single guaranteed
     * cleanup point for every exit path. */
    if (silenceTimer) clearTimeout(silenceTimer);
    if (firstByteTimer) clearTimeout(firstByteTimer);
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
export async function callChatCompletion(opts: ChatCompletionRequestOptions) {
  const { apiBase, apiKey, signal, tools } = opts;

  /* Only the caller's signal and the optional operator-configured total
     deadline bound this request; there is no implicit server-side cap. */
  const mergedSignal = combineSignals(
    signal,
    LLM_TOTAL_TIMEOUT_MS > 0 ? AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS) : null,
  );

  let response: Response | undefined;
  const variants = requestBodyVariants(opts, false);
  let successfulVariant: (typeof variants)[number] | null = null;
  for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
    const variant = variants[variantIndex];
    response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(variant.body),
      signal: mergedSignal,
    });
    if (response.ok) {
      successfulVariant = variant;
      break;
    }
    const errBody = await response.text().catch(() => '');
    if (response.status === 400 && variantIndex < variants.length - 1) {
      console.warn('[LLM] provider rejected optional request fields; retrying with compatibility payload', JSON.stringify({
        status: response.status,
        toolCount: Array.isArray(tools) ? tools.length : 0,
        maxTokens: variant.body.max_tokens,
      }));
      continue;
    }
    const { ApiError } = await import('../lib/errors.js');
    /* Forward the upstream status code so the client sees 429 (quota),
       401 (bad key), etc. instead of a generic 500. The error handler
       serialises ApiError with the correct HTTP status. */
    throw new ApiError(response.status, 'LLM_API_ERROR', `LLM API error ${response.status}: ${errBody.slice(0, 200)}`);
  }
  if (!response?.ok) throw new Error('LLM API request failed');

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: unknown; tool_calls?: unknown }; finish_reason?: string | null }>;
  };
  /* P_deepseek-mode — preserve reasoning_content on the final
     message so the client can persist it for the next turn. */
  const message = json.choices?.[0]?.message || {};
  const finishReason = json.choices?.[0]?.finish_reason || null;
  return {
    content: message.content || '',
    reasoning_content: typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined,
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
    finish_reason: finishReason,
    meta: {
      response_speed_applied: successfulVariant?.speedApplied || 'standard',
    },
  };
}
