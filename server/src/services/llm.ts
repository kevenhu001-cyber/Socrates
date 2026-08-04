/**
 * LLM proxy service — calls external chat completion APIs and streams
 * the response back in OpenAI-compatible SSE format.
 *
 * Supports: any OpenAI-compatible API (OpenAI, Anthropic via proxy, MiniMax, etc.)
 */

/* LLM streaming budgets.
 *
 * LLM_TOTAL_TIMEOUT_MS — hard ceiling on the entire request. Reasoning
 *   models (DeepSeek R1, QwQ, MiniMax reasoning variants) routinely
 *   stream chain-of-thought for 2-3 minutes, then continue with the
 *   final answer. 180 s covers that while still failing fast on a
 *   hung upstream.
 *
 * LLM_SILENCE_TIMEOUT_MS — separate watchdog that aborts the upstream
 * fetch if NO bytes arrive for this many ms. Reset on every chunk so
 * a healthy but slow stream (long thinking) never trips it. */
const LLM_TOTAL_TIMEOUT_MS = 300_000;
const LLM_SILENCE_TIMEOUT_MS = 120_000;
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
  extra_body?: Record<string, unknown>;
  tools?: Array<{ type: 'function'; function: { name: string; [key: string]: unknown } }>;
  tool_choice?: unknown;
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
  const { model, messages, maxTokens, temperature = stream ? 0.7 : 0.3, reasoning_effort, extra_body, tools, tool_choice } = opts;
  const base = {
    model,
    messages: normalizeProviderMessages(messages),
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    temperature,
    stream,
    ...(reasoning_effort ? { reasoning_effort } : {}),
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
  const variants: Array<{ body: Record<string, unknown>; reason: string }> = [
    { body: withTools, reason: 'initial' },
  ];
  if (hasTools) {
    const { tools: _tools, tool_choice: _toolChoice, ...withoutTools } = withTools;
    variants.push({ body: withoutTools, reason: 'provider-400-with-tools' });
  }
  /* Optional reasoning fields are another common source of 400s on generic
   * gateways. Only try this stricter form after the previous compatibility
   * variant, never on a successful request. */
  if (reasoning_effort || extra_body) {
    const { reasoning_effort: _effort, ...withoutReasoning } = hasTools
      ? (variants[variants.length - 1].body)
      : withTools;
    const withoutOptional = { ...withoutReasoning };
    for (const key of Object.keys(extra_body || {})) delete withoutOptional[key];
    variants.push({ body: withoutOptional, reason: 'provider-400-with-optional-fields' });
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

  const totalSignal = AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS);
  const silenceController = new AbortController();
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  const armSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      try { silenceController.abort('silence-timeout'); } catch { /* ignore */ }
    }, LLM_SILENCE_TIMEOUT_MS);
  };
  const mergedSignal = signal
    ? AbortSignal.any([signal, totalSignal, silenceController.signal])
    : AbortSignal.any([totalSignal, silenceController.signal]);

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
          if (response.ok) break;

          const errBody = await response.text().catch(() => '');
          lastError = new LlmProviderError(response.status, errBody);
          if (response.status === 400 && variantIndex < variants.length - 1) {
            tryNextVariant = true;
            if (variantIndex === 0 && Array.isArray(tools) && tools.length > 0) {
              console.warn('[LLM] provider rejected native tool request; retrying with compatibility payload', JSON.stringify({
                status: response.status,
                toolCount: tools.length,
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      /* P_silence_fix — arm the watchdog on the first real chunk
         (not before). This gives reasoning models unlimited time
         for the initial thinking burst. After the first chunk, the
         watchdog guards against genuine mid-stream stalls. */
      if (!_firstChunkArrived) {
        _firstChunkArrived = true;
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
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? 0;
              const prev = toolCallAcc.get(i) || {
                id: undefined,
                type: 'function',
                function: { name: '', arguments: '' },
              };
              const next = {
                id: tc.id || prev.id,
                type: 'function',
                function: {
                  name: mergeToolNameDelta(prev.function.name, tc.function && tc.function.name),
                  arguments: mergeToolArgumentDelta(prev.function.arguments, tc.function && tc.function.arguments),
                },
                __index: i,
              };
              toolCallAcc.set(i, next);
              _emitToolDelta(next, next.function.arguments);
            }
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
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? 0;
              const prev = toolCallAcc.get(i) || {
                id: undefined,
                type: 'function',
                function: { name: '', arguments: '' },
              };
              const next = {
                id: tc.id || prev.id,
                type: 'function',
                function: {
                  name: mergeToolNameDelta(prev.function.name, tc.function && tc.function.name),
                  arguments: mergeToolArgumentDelta(prev.function.arguments, tc.function && tc.function.arguments),
                },
                __index: i,
              };
              toolCallAcc.set(i, next);
              _emitToolDelta(next, next.function.arguments);
            }
          }
          const choice = json.choices?.[0];
          if (choice && choice.finish_reason) finishReason = choice.finish_reason;
          const content = delta.content || '';
          if (content) onChunk(content);
        }
      } catch { /* skip */ }
    }

    if (silenceTimer) clearTimeout(silenceTimer);

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
    if ((err as Error).name === 'AbortError') {
      // Distinguish user-initiated abort (client disconnect) from
      // server-side timeout. The user signal fires on disconnect;
      // the total timeout fires after LLM_TOTAL_TIMEOUT_MS; the
      // silence timer fires when no bytes arrive for
      // LLM_SILENCE_TIMEOUT_MS.
      if (signal && signal.aborted) {
        onDone({ finishReason: null }); // Client disconnected — clean close
      } else if ((err as Error).message && (err as Error).message.indexOf('silence-timeout') >= 0) {
        onError(new Error(`LLM stream stalled: no data for ${LLM_SILENCE_TIMEOUT_MS / 1000} s`));
      } else {
        onError(new Error(`LLM request timed out after ${LLM_TOTAL_TIMEOUT_MS / 1000} s`));
      }
    } else {
      onError(err as Error);
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
export async function callChatCompletion(opts: ChatCompletionRequestOptions) {
  const { apiBase, apiKey, signal, tools } = opts;

  const mergedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS)])
    : AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS);

  let response: Response | undefined;
  const variants = requestBodyVariants(opts, false);
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
    if (response.ok) break;
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
  };
}
