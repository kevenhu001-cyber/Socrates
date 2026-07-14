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
const LLM_TOTAL_TIMEOUT_MS = 180_000;
const LLM_SILENCE_TIMEOUT_MS = 60_000;

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
 * @param {function} onReasoning - Called with each reasoning_content chunk (DeepSeek-style)
 * @param {function} onToolUse   - Called once per fully streamed tool_call when finish_reason
 *                                  is 'tool_calls'. Each callback receives
 *                                  { id, type:'function', function:{ name, arguments } }.
 *                                  Arguments is the raw JSON string the upstream streamed —
 *                                  callers must parse it themselves.
 */
export async function streamChatCompletion(opts, onChunk, onDone, onError, onReasoning, onToolUse) {
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
  let silenceTimer = null;
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
    let finishReason = null;
    /* tool_call deltas arrive indexed by `index`. We accumulate them
       into full {id, type, function:{name, arguments}} objects that
       mirror what the model would have produced in a non-streaming
       response. */
    const toolCallAcc = new Map();
    /* Arm the silence watchdog before the first read. We re-arm it
       after every chunk arrives so a healthy stream never trips it. */
    armSilenceTimer();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      /* Reset the silence timer: we just got bytes, the connection
         is alive. If the model thinks for >LLM_SILENCE_TIMEOUT_MS
         with no bytes, we'll time out (and that's a genuine stall). */
      armSilenceTimer();
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
             upstream signals finish_reason='tool_calls'. */
          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? 0;
              const prev = toolCallAcc.get(i) || {
                id: undefined,
                type: 'function',
                function: { name: '', arguments: '' },
              };
              toolCallAcc.set(i, {
                id: tc.id || prev.id,
                type: 'function',
                function: {
                  name: (tc.function && tc.function.name) || prev.function.name,
                  arguments: prev.function.arguments + ((tc.function && tc.function.arguments) || ''),
                },
              });
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

    // Flush remaining buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      try {
        const json = JSON.parse(buffer.slice(6));
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
              toolCallAcc.set(i, {
                id: tc.id || prev.id,
                type: 'function',
                function: {
                  name: (tc.function && tc.function.name) || prev.function.name,
                  arguments: prev.function.arguments + ((tc.function && tc.function.arguments) || ''),
                },
              });
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

    /* Dispatch accumulated tool calls when the model decided to call
       a tool. The chat route listens for these in its tool-execution
       loop (Phase 3). */
    if (finishReason === 'tool_calls' && typeof onToolUse === 'function') {
      for (const tc of toolCallAcc.values()) {
        try { onToolUse(tc); } catch { /* ignore listener errors */ }
      }
    }

    onDone({ finishReason });
  } catch (err) {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (err.name === 'AbortError') {
      // Distinguish user-initiated abort (client disconnect) from
      // server-side timeout. The user signal fires on disconnect;
      // the total timeout fires after LLM_TOTAL_TIMEOUT_MS; the
      // silence timer fires when no bytes arrive for
      // LLM_SILENCE_TIMEOUT_MS.
      if (signal && signal.aborted) {
        onDone({ finishReason: null }); // Client disconnected — clean close
      } else if (err.message && err.message.indexOf('silence-timeout') >= 0) {
        onError(new Error(`LLM stream stalled: no data for ${LLM_SILENCE_TIMEOUT_MS / 1000} s`));
      } else {
        onError(new Error(`LLM request timed out after ${LLM_TOTAL_TIMEOUT_MS / 1000} s`));
      }
    } else {
      onError(err);
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
export async function callChatCompletion(opts) {
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

  const json = await response.json();
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
