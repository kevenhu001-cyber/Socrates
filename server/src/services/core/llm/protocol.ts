/**
 * OpenAI-compatible request variants and compatibility fallbacks.
 */
import { applyProviderControls, permitsCompatibilityFallback } from '../llmProtocol.js';
import { promptCacheFields } from './cachePolicy.js';
import { DEFAULT_MAX_TOKENS, type ChatCompletionRequestOptions } from './types.js';

function normalizeProviderMessages(messages: ChatCompletionRequestOptions['messages']) {
  /* OpenAI permits null assistant content alongside tool_calls. Several
   * compatibility layers do not, and reject the entire second tool hop with
   * a provider-side 400. Empty string is semantically equivalent here and is
   * accepted by both strict and permissive gateways. */
  return messages.map((message) => {
    let normalized = message;
    if (
      (message.role === 'assistant' && Array.isArray(message.tool_calls)) ||
      message.role === 'tool'
    ) {
      normalized = { ...message, content: message.content == null ? '' : message.content };
    }
    // Preserve provider-returned reasoning verbatim. Current MiniMax and
    // DeepSeek document reasoning_content; synthesizing a second details
    // representation for every provider duplicates context tokens.
    return normalized;
  });
}

export function requestBodyVariants(opts: ChatCompletionRequestOptions, stream: boolean) {
  const {
    model,
    messages,
    maxTokens,
    temperature = stream ? 0.7 : 0.3,
    reasoning_effort,
    response_speed,
    extra_body,
    tools,
    tool_choice,
  } = opts;
  const base: Record<string, unknown> = {
    model,
    messages: normalizeProviderMessages(messages),
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
    temperature,
    stream,
    /* Ask the upstream to report what it actually billed. Without this a
       streaming response carries no `usage` object at all, which is why
       services/core/usageTracker.ts had nothing but a chars/4 estimate to work
       with. Non-streaming responses include `usage` unconditionally, so this
       only needs to be set for streams.

       Generic OpenAI-compatible gateways sometimes reject unknown top-level
       fields with a 400, so `stream_options` is stripped by the first
       compatibility variant below rather than being sent unconditionally. */
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(response_speed === 'fast' ? { service_tier: 'priority' } : {}),
    ...(extra_body ? { ...extra_body } : {}),
  } as Record<string, unknown>;
  /* every provider-specific decision below is
     read from the declared capabilities of THIS model (lib/modelCapabilities.ts),
     not from a brand substring. A model the registry does not know gets the
     OpenAI-standard body and nothing vendor-specific. */
  const { capability, protectedKeys } = applyProviderControls(base, {
    model,
    apiBase: opts.apiBase,
    userId: opts.userId,
    reasoning_effort,
    extra_body,
    instantEncoding: opts.instantEncoding,
  });
  const protectedKeySet = new Set(protectedKeys);
  const cacheFields = promptCacheFields(opts);
  Object.assign(base, cacheFields);
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
  const variants: Array<{
    body: Record<string, unknown>;
    reason: string;
    speedApplied: 'standard' | 'fast';
  }> = [
    {
      body: withTools,
      reason: 'initial',
      speedApplied:
        response_speed === 'fast' && capability.supportsServiceTier ? 'fast' : 'standard',
    },
  ];
  let compatibilityBase = withTools;
  // Only drop cache hints on a diagnosed cache-field rejection. This keeps
  // the requested reasoning mode, tools, temperature and stream usage.
  if (Object.keys(cacheFields).length) {
    const withoutCache = { ...withTools };
    for (const key of Object.keys(cacheFields)) delete withoutCache[key];
    variants.push({ body: withoutCache, reason: 'provider-400-with-cache-options', speedApplied: variants[0].speedApplied });
  }

  /* Usage reporting is optional; native tools and explicit Instant semantics
   * are not. Select a fallback only after a diagnosed unsupported field. */
  const dropStreamOptions = (body: Record<string, unknown>) => {
    if (!stream) return body;
    const { stream_options: _streamOptions, ...rest } = body;
    return rest;
  };

  /* Priority service is provider-specific. Its fallback is deliberately the
     first compatibility variant so tools, reasoning_effort and extra_body
     survive when a generic OpenAI-compatible gateway rejects service_tier. */
  if (response_speed === 'fast' && capability.supportsServiceTier) {
    const { service_tier: _serviceTier, ...withoutPriority } = compatibilityBase;
    compatibilityBase = dropStreamOptions(withoutPriority);
    variants.push({
      body: compatibilityBase,
      reason: 'provider-400-without-priority',
      speedApplied: 'standard',
    });
  }
  if (stream) {
    variants.push({
      body: dropStreamOptions(withTools),
      reason: 'provider-400-with-stream-options',
      speedApplied:
        response_speed === 'fast' && capability.supportsServiceTier ? 'fast' : 'standard',
    });
  }
  if (hasTools) {
    const { tools: _tools, tool_choice: _toolChoice, ...withoutTools } = compatibilityBase;
    // A tools-specific fallback must not contaminate reasoning/usage fallbacks.
    variants.push({
      body: dropStreamOptions(withoutTools),
      reason: 'provider-400-with-tools',
      speedApplied: 'standard',
    });
  }
  /* Optional reasoning fields are another common source of 400s on generic
   * gateways. Only try this stricter form after the previous compatibility
   * variant, never on a successful request. */
  if (reasoning_effort || extra_body) {
    const { reasoning_effort: _effort, ...withoutReasoning } = compatibilityBase;
    const withoutOptional = dropStreamOptions({
      ...withoutReasoning,
      ...(base.reasoning_effort === 'none' ? { reasoning_effort: 'none' } : {}),
    });
    for (const key of Object.keys(extra_body || {})) {
      /* Instant is an explicit output mode, not an optional hint. A provider
         that rejects it must fail rather than silently resume thinking. The
         same holds for the keys the server itself set from the capability
         registry. */
      if (protectedKeySet.has(key)) continue;
      if (
        key === 'chat_template_kwargs' &&
        (withoutOptional.chat_template_kwargs as { enable_thinking?: boolean } | undefined)
          ?.enable_thinking === false
      )
        continue;
      if (key === 'enable_thinking' && withoutOptional.enable_thinking === false) continue;
      if (
        key === 'thinking' &&
        (withoutOptional.thinking as { type?: string } | undefined)?.type === 'disabled'
      )
        continue;
      delete withoutOptional[key];
    }
    /* A model whose effort the server chose itself (not the caller) keeps
       it: dropping it would silently move the model to the provider's own
       default, which is a stronger — and more expensive — mode. */
    if (capability.defaultEffort) withoutOptional.reasoning_effort = base.reasoning_effort;
    variants.push({
      body: withoutOptional,
      reason: 'provider-400-with-optional-fields',
      speedApplied: 'standard',
    });
  }
  return variants;
}

/** Select a diagnosed fallback, not the next speculative body. Never
 * reintroduce previously rejected fields. Each step strictly loses a field. */
export function nextCompatibilityVariant(
  variants: ReturnType<typeof requestBodyVariants>,
  currentIndex: number,
  errorBody: string,
): number {
  const current = variants[currentIndex].body;
  for (let index = 1; index < variants.length; index++) {
    if (!permitsCompatibilityFallback(errorBody, variants[index].reason)) continue;
    const candidate = Object.fromEntries(
      Object.entries(variants[index].body).filter(([key]) => key in current),
    );
    if (!Object.keys(current).some((key) => !(key in candidate))) continue;
    variants[index] = { ...variants[index], body: candidate };
    return index;
  }
  return -1;
}

export function isToolFinishReason(reason: unknown): boolean {
  return reason === 'tool_calls' || reason === 'tool_call' || reason === 'function_call';
}
