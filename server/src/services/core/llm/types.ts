/**
 * Public request/response types and the provider error shape.
 */
export const DEFAULT_MAX_TOKENS = Math.max(
  256,
  Number.parseInt(process.env.LLM_DEFAULT_MAX_TOKENS || '8192', 10) || 8192,
);

export interface ChatCompletionRequestOptions {
  apiBase: string;
  apiKey: string;
  model: string;
  /** Server-owned identity, never accepted from extra_body. */
  userId?: string | null;
  /** Owner-checked conversation scope, never a provider request parameter itself. */
  cacheSessionId?: string | null;
  messages: Array<{ role: string; content: unknown; [key: string]: unknown }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  reasoning_effort?: string;
  response_speed?: 'standard' | 'fast';
  extra_body?: Record<string, unknown>;
  /** Per-provider override for the "no thinking" encoding. */
  instantEncoding?: string | null;
  tools?: Array<{ type: 'function'; function: { name: string; [key: string]: unknown } }>;
  tool_choice?: unknown;
  onPreferenceFallback?: (detail: {
    preference: 'response_speed';
    requested: 'fast';
    applied: 'standard';
  }) => void;
}

/** Preserve the upstream status and recognized cause without exposing the response body. */
export class LlmProviderError extends Error {
  readonly status: number;
  readonly reason?: 'model_unavailable' | 'endpoint_rejected';
  readonly code = 'LLM_UPSTREAM_ERROR';
  /** Provider retries are exhausted here; the browser must not replay them. */
  readonly retryable = false;

  constructor(
    status: number,
    body: string,
    readonly retryAfterMs?: number,
  ) {
    let reason: LlmProviderError['reason'];
    if (status === 400) {
      if (/matched user group has no available model instance/i.test(body)) {
        reason = 'model_unavailable';
      } else if (/request path cannot be relayed/i.test(body)) {
        reason = 'endpoint_rejected';
      }
    }
    super(`LLM API error ${status}${reason ? ` (${reason})` : ''}`);
    this.name = 'LlmProviderError';
    this.status = status;
    this.reason = reason;
  }
}
