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

/** Preserve useful upstream context without exposing credentials. */
export class LlmProviderError extends Error {
  readonly status: number;
  readonly providerBody: string;
  readonly code = 'LLM_UPSTREAM_ERROR';
  /** Provider retries are exhausted here; the browser must not replay them. */
  readonly retryable = false;

  constructor(
    status: number,
    body: string,
    readonly retryAfterMs?: number,
  ) {
    const compactBody = body.slice(0, 200);
    super(`LLM API error ${status}: ${compactBody}`);
    this.name = 'LlmProviderError';
    this.status = status;
    this.providerBody = compactBody;
  }
}
