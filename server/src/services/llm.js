/**
 * LLM proxy service — calls external chat completion APIs and streams
 * the response back in OpenAI-compatible SSE format.
 *
 * Supports: any OpenAI-compatible API (OpenAI, Anthropic via proxy, MiniMax, etc.)
 */

const LLM_TIMEOUT_MS = 120_000;

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
export async function streamChatCompletion(opts, onChunk, onDone, onError) {
  const { apiBase, apiKey, model, messages, maxTokens = 4096, temperature = 0.7, signal } = opts;

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
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
      signal,
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const content = json.choices?.[0]?.delta?.content || '';
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
        const content = json.choices?.[0]?.delta?.content || '';
        if (content) onChunk(content);
      } catch { /* skip */ }
    }

    onDone();
  } catch (err) {
    if (err.name === 'AbortError') {
      onDone(); // User aborted — not an error
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
  const { apiBase, apiKey, model, messages, maxTokens = 250, temperature = 0.3, signal } = opts;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`LLM API error ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const json = await response.json();
  return { content: json.choices?.[0]?.message?.content || '' };
}
