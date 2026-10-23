import { createHash, randomUUID } from 'node:crypto';
import {
  assertThinkingModeSupported,
  instantEncodingFor,
  mapEffortLevel,
  resolveModelCapability,
  type ModelCapability,
} from '../../lib/modelCapabilities.js';

/** Provider contracts, verified against official docs on 2026-10-23/24.
 * Keep model-specific controls here rather than guessing from a brand name.
 * See docs/audits/2026-10-23-provider-api-contracts.md for sources and
 * lib/modelCapabilities.ts for the registry those controls are read from. */

/** The declared capabilities of a model id. */
export function modelCapability(model: string): ModelCapability {
  return resolveModelCapability(model);
}

/** Local capability gate. Throws before any upstream call is made. */
export function validateThinkingMode(model: string, effort?: string, extra?: Record<string, unknown>): void {
  assertThinkingModeSupported(resolveModelCapability(model), effort, extra);
}

export interface ProviderControls {
  /** The capabilities the request was built from. */
  capability: ModelCapability;
  /**
   * Body keys a compatibility fallback must not drop.
   *
   * Dropping one of these changes what the model does — it would resume
   * thinking although the user asked for Instant, or lose the reasoning
   * channel the UI renders as a thinking pill.
   */
  protectedKeys: string[];
}

/**
 * Apply every provider-specific control to a request body.
 *
 * The body arrives carrying the OpenAI-standard fields plus whatever the
 * client put in `extra_body`. This function reconciles them with what the
 * model is actually documented to accept:
 *
 *   - "no thinking" is encoded the way THIS model accepts it, or not sent
 *     at all when the model never thinks;
 *   - a reasoning-effort level is translated into the provider's own
 *     vocabulary, or omitted when the provider ignores or rejects it;
 *   - fields the provider does not accept (temperature, service_tier) are
 *     removed instead of being sent and ignored.
 */
export function applyProviderControls(
  body: Record<string, unknown>,
  opts: { model: string; apiBase: string; userId?: string | null; reasoning_effort?: string; extra_body?: Record<string, unknown> },
): ProviderControls {
  const capability = resolveModelCapability(opts.model);
  assertThinkingModeSupported(capability, opts.reasoning_effort, opts.extra_body);
  const protectedKeys = new Set<string>();

  /* ── Thinking and effort ─────────────────────────────────────────── */
  const effort = opts.reasoning_effort;
  if (effort === 'none') {
    const encoding = instantEncodingFor(capability, opts.apiBase);
    if (encoding === 'thinking_disabled') {
      delete body.reasoning_effort;
      body.thinking = { type: 'disabled' };
      protectedKeys.add('thinking');
    } else if (encoding === 'enable_thinking_false') {
      delete body.reasoning_effort;
      body.enable_thinking = false;
      protectedKeys.add('enable_thinking');
    } else if (encoding === 'chat_template_kwargs') {
      delete body.reasoning_effort;
      body.chat_template_kwargs = { enable_thinking: false };
      protectedKeys.add('chat_template_kwargs');
    } else if (encoding === 'reasoning_effort_none') {
      body.reasoning_effort = 'none';
    } else if (capability.thinking === 'not_applicable') {
      /* The model never thinks, so "no thinking" needs no switch. Sending
       * one would be a field the provider may reject. */
      delete body.reasoning_effort;
    } else {
      /* Nothing is declared for this model. The OpenAI-standard field is
       * the only expression of "no thinking" that needs no vendor guess. */
      body.reasoning_effort = 'none';
    }
  } else if (effort) {
    const mapped = mapEffortLevel(capability, effort);
    if (mapped) body.reasoning_effort = mapped;
    else delete body.reasoning_effort;
  } else if (capability.defaultEffort) {
    const mapped = mapEffortLevel(capability, capability.defaultEffort);
    body.reasoning_effort = mapped ?? capability.defaultEffort;
  }

  /* The model always thinks; pin the documented mode so a provider default
   * change cannot silently alter it. */
  if (capability.adaptiveThinking) {
    body.thinking = { type: 'adaptive' };
    protectedKeys.add('thinking');
  }

  /* ── Token accounting ────────────────────────────────────────────── */
  if (capability.maxTokensParam === 'max_completion_tokens') {
    const maxTokens = body.max_tokens;
    if (maxTokens !== undefined) {
      body.max_completion_tokens = maxTokens;
      delete body.max_tokens;
    }
  }

  /* ── Fields the provider does not honour ─────────────────────────── */
  if (!capability.supportsTemperature
    /* The GPT-6 family documents that temperature must be removed unless
       reasoning is switched off. Sending it anyway is a 400, not a hint. */
    || (capability.temperatureRequiresNoReasoning && body.reasoning_effort !== 'none')) {
    /* Sending a knob the provider ignores implies it takes effect. */
    delete body.temperature;
  }
  if (!capability.supportsServiceTier) {
    delete body.service_tier;
  }
  if (capability.supportsReasoningSplit) {
    /* The reasoning channel is what the UI renders as a thinking pill. */
    body.reasoning_split = true;
    protectedKeys.add('reasoning_split');
  }

  // user_id is server-owned, opaque and stable. Only send it to the documented
  // first-party endpoint; a gateway may implement a different parameter set.
  let host = '';
  try { host = new URL(opts.apiBase).hostname; } catch { /* URL validated at provider configuration */ }
  if (host === 'api.deepseek.com' && opts.userId) {
    body.user_id = `socrates_${createHash('sha256').update(opts.userId).digest('hex').slice(0, 32)}`;
  }

  return { capability, protectedKeys: [...protectedKeys] };
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
