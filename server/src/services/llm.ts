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

  // P0.0 — when no maxTokens is set, default to a very high value so
  // the model is not silently truncated by the upstream provider's
  // small default (e.g. OpenAI's 4K-16K depending on model, Anthropic's
  // 4K default). The 32 K ceiling matches our request schema and
  // covers even the longest outputs from reasoning models (DeepSeek R1,
  // QwQ) whose chain-of-thought is streamed separately as
  // reasoning_content and does not consume the answer's max_tokens
  // budget, but the final answer can still run long.
  const effectiveMaxTokens = maxTokens || 32000;

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
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: effectiveMaxTokens,
        temperature,
        stream: true,
        /* P_deepseek-mode — forward the optional reasoning_effort
           and extra_body flags. Non-DeepSeek upstreams silently
           ignore unknown fields, so this is safe for every
           provider. */
        ...(reasoning_effort ? { reasoning_effort } : {}),
        ...(extra_body ? { ...extra_body } : {}),
        /* Tool calling — when tools is set, the upstream may stream
           `delta.tool_calls` arrays indexed by `index`. The accumulator
           below joins them into fully-formed tool_call objects. */
        ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
        ...(tool_choice ? { tool_choice } : {}),
      }),
      signal: mergedSignal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      onError(new Error(`LLM API error ${response.status}: ${errBody.slice(0, 200)}`));
      return;
    }

    if (!response.body) {
      onError(new Error('LLM API returned empty body'));
      return;
    }

    const reader = response.body.getReader();
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
  const { apiBase, apiKey, model, messages, maxTokens, temperature = 0.3, signal, reasoning_effort, extra_body, tools, tool_choice } = opts;
  const effectiveMaxTokens = maxTokens || 32000;

  const mergedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS)])
    : AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS);

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: effectiveMaxTokens,
      temperature,
      stream: false,
      /* P_deepseek-mode — forward the optional reasoning_effort
         and extra_body flags so DeepSeek-family upstreams emit
         reasoning_content in the final message. */
      ...(reasoning_effort ? { reasoning_effort } : {}),
      ...(extra_body ? { ...extra_body } : {}),
      ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
      ...(tool_choice ? { tool_choice } : {}),
    }),
    signal: mergedSignal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    const { ApiError } = await import('../lib/errors.js');
    /* Forward the upstream status code so the client sees 429 (quota),
       401 (bad key), etc. instead of a generic 500. The error handler
       serialises ApiError with the correct HTTP status. */
    throw new ApiError(response.status, 'LLM_API_ERROR', `LLM API error ${response.status}: ${errBody.slice(0, 200)}`);
  }

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
