import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';

/** Provider contracts, verified against official docs on 2026-10-23.
 * Keep model-specific controls here rather than guessing from a brand name.
 * See docs/audits/2026-10-23-provider-api-contracts.md for sources. */
export function isMiniMaxFlash(model: string): boolean {
  return /^minimax-m3\.1-flash(?:$|[-:])/i.test(model);
}

export function validateThinkingMode(model: string, effort?: string, extra?: Record<string, unknown>): void {
  const thinking = extra?.thinking as { type?: unknown } | undefined;
  if (isMiniMaxFlash(model) && (effort === 'none' || thinking?.type === 'disabled')) {
    throw new ApiError(400, 'MODEL_MODE_UNSUPPORTED', 'This model does not support Instant. Select Low, Medium or High thinking, or choose a model that supports Instant.');
  }
}

export function applyProviderControls(
  body: Record<string, unknown>,
  opts: { model: string; apiBase: string; userId?: string | null; reasoning_effort?: string; extra_body?: Record<string, unknown> },
): void {
  validateThinkingMode(opts.model, opts.reasoning_effort, opts.extra_body);
  if (isMiniMaxFlash(opts.model)) {
    body.thinking = { type: 'adaptive' };
    body.reasoning_split = true;
    // M3.1 defaults to max; the application's default is Medium, including
    // internal summaries. Do not accidentally run tiny background jobs at max.
    body.reasoning_effort = opts.reasoning_effort || 'medium';
    delete body.service_tier; // explicitly unsupported by this model
  }
  if (/^minimax-m3(?:[.:-]|$)/i.test(opts.model)) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
    delete body.temperature; // ignored by M3/M3.1; do not imply it takes effect
  }
  // user_id is server-owned, opaque and stable. Only send it to the documented
  // first-party endpoint; a gateway may implement a different parameter set.
  let host = '';
  try { host = new URL(opts.apiBase).hostname; } catch { /* URL validated at provider configuration */ }
  if (host === 'api.deepseek.com' && opts.userId) {
    body.user_id = `socrates_${createHash('sha256').update(opts.userId).digest('hex').slice(0, 32)}`;
  }
}

export function providerHeaders(apiKey: string, stream: boolean): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    Accept: stream ? 'text/event-stream' : 'application/json',
    'Accept-Encoding': 'identity',
    'User-Agent': 'Socrates/0.1',
    'X-Request-Id': randomUUID(),
  };
}

/** Never remove tools/reasoning in response to an unrelated invalid request.
 * An unknown 400 is terminal: blind compatibility attempts multiply traffic
 * and can break the assistant/tool-result protocol. */
export function permitsCompatibilityFallback(body: string, reason: string): boolean {
  if (/context.{0,30}(?:exceed|length|limit)|requires? adaptive|thinking.{0,30}(?:disabled|not supported)|invalid.{0,20}(?:api.?key|messages)|reasoning_content.{0,40}(?:missing|required)/i.test(body)) return false;
  const field = reason === 'provider-400-without-priority' ? 'service_tier|priority'
    : reason === 'provider-400-with-tools' ? 'tools?|tool_choice|function.call'
      : reason === 'provider-400-with-stream-options' ? 'stream_options|include_usage'
        : 'reasoning_effort|reasoning_split|thinking|enable_thinking|chat_template_kwargs';
  return new RegExp(`(?:${field})`, 'i').test(body)
    && /unsupported|not supported|unknown|unrecognized|unexpected|not allowed|not permitted|extra (?:input|field)|reject/i.test(body);
}

export function providerPayloadFailure(payload: unknown): { status: number; body: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, any>;
  const code = Number(p.base_resp?.status_code ?? p.error?.code ?? p.code ?? 0);
  if (!p.error && !(p.base_resp && Number.isFinite(code) && code !== 0) && !(code && !p.choices)) return null;
  const message = String(p.error?.message || p.error || p.base_resp?.status_msg || p.message || 'Upstream error');
  const type = String(p.error?.type || p.error?.code || '');
  const status = [1002, 1039, 1045, 2045, 2046, 2062].includes(code) || /rate.limit|quota/i.test(type) ? 429
    : code === 1004 || /auth|invalid.api.key/i.test(type) ? 401
      : code === 1008 ? 402
        : code === 2013 || /invalid.request|bad.request/i.test(type) ? 400
          : Number(p.status) >= 400 && Number(p.status) <= 599 ? Number(p.status) : 502;
  return { status, body: message };
}

export function isPermanentQuotaError(body: string): boolean {
  // "quota_exceeded_error: rpm exhausted" is a temporary rate limit, not a
  // spent balance. Classify the actual provider message, not just its type.
  return /insufficient_quota|insufficient[_ ]balance|credit balance|payment required|billing|monthly.{0,25}(?:quota|limit)|daily.{0,25}(?:quota|limit)|(?:quota|credits?) (?:exhausted|exceeded)/i.test(body)
    && !/rpm|tpm|per.minute|rate.limit/i.test(body);
}
