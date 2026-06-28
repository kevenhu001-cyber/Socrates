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
 *   stream chain-of-thought for 2-4 minutes, then continue with the
 *   final answer. 120 s was too aggressive; bumped to 600 s so a long
 *   reasoning trace does not get cut off mid-stream.
 *
 * LLM_SILENCE_TIMEOUT_MS — separate watchdog that aborts the upstream
 *   fetch if NO bytes arrive for this many ms (i.e. the connection
 *   is genuinely stalled, not just thinking). Implemented as a
 *   setTimeout that we reset on every `reader.read()` returning
 *   data. This replaces the previous "fixed total timeout" which
 *   fired even on a healthy but slow stream. */
const LLM_TOTAL_TIMEOUT_MS = 600_000;
const LLM_SILENCE_TIMEOUT_MS = 120_000;

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
 * @param {function} onChunk    - Called with each text chunk
 * @param {function} onDone     - Called when streaming completes
 * @param {function} onError    - Called on error
 */
export async function streamChatCompletion(opts, onChunk, onDone, onError, onReasoning) {
  const { apiBase, apiKey, model, messages, maxTokens, temperature = 0.7, signal, reasoning_effort, extra_body } = opts;

  // P0.0 — when no maxTokens is set, default to a very high value so
  // the model is not silently truncated by the upstream provider's
  // small default (e.g. OpenAI's 4K-16K depending on model, Anthropic's
  // 4K default). The 32 K ceiling matches our request schema and
  // covers even the longest outputs from reasoning models (DeepSeek R1,
  // QwQ) whose chain-of-thought is streamed separately as
  // reasoning_content and does not consume the answer's max_tokens
  // budget, but the final answer can still run long.
  const effectiveMaxTokens = maxTokens || 32000;

  // Merge external signal with the LLM total-timeout so a hung provider
  // doesn't hold the request open forever. The silence watchdog below
  // (reset on every chunk) catches stalls independently.
  const totalSignal = AbortSignal.timeout(LLM_TOTAL_TIMEOUT_MS);
  const mergedSignal = signal
    ? AbortSignal.any([signal, totalSignal])
    : totalSignal;

  let silenceTimer = null;
  let silenceController = null;
  const armSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceController = new AbortController();
    silenceTimer = setTimeout(() => {
      try { silenceController.abort('silence-timeout'); } catch { /* ignore */ }
    }, LLM_SILENCE_TIMEOUT_MS);
    return silenceController.signal;
  };

  try {
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
          const content = delta.content || '';
          if (content) onChunk(content);
        }
      } catch { /* skip */ }
    }

    if (silenceTimer) clearTimeout(silenceTimer);
    onDone();
  } catch (err) {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (err.name === 'AbortError') {
      // Distinguish user-initiated abort (client disconnect) from
      // server-side timeout. The user signal fires on disconnect;
      // the total timeout fires after LLM_TOTAL_TIMEOUT_MS; the
      // silence timer fires when no bytes arrive for
      // LLM_SILENCE_TIMEOUT_MS.
      if (signal && signal.aborted) {
        onDone(); // Client disconnected — clean close
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
 * Returns { content: string } or throws.
 */
export async function callChatCompletion(opts) {
  const { apiBase, apiKey, model, messages, maxTokens, temperature = 0.3, signal, reasoning_effort, extra_body } = opts;
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
  return {
    content: message.content || '',
    reasoning_content: typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined,
  };
}
