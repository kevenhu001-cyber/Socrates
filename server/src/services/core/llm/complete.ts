/**
 * Non-streaming chat completion.
 */
import {
  applyProviderControls,
  modelCapability,
  isPermanentQuotaError,
  providerHeaders,
  providerPayloadFailure,
} from '../llmProtocol.js';
import { observePromptCacheUsage } from '../../../lib/promptCacheUsage.js';
import { createUpstreamRetryBudget } from '../../../lib/upstreamRetryBudget.js';
import { getLlmDispatcher, markLlmActivity } from './dispatcher.js';
import { LlmProviderError, type ChatCompletionRequestOptions } from './types.js';
import {
  RATE_LIMIT_STATUS,
  TRANSIENT_ATTEMPTS,
  attemptsForUpstreamStatus,
  isRetryableUpstreamStatus,
  sleep,
  upstreamRetryDelayMs,
} from './retry.js';
import { nextCompatibilityVariant, requestBodyVariants } from './protocol.js';

export async function callChatCompletion(opts: ChatCompletionRequestOptions) {
  const retryBudget = createUpstreamRetryBudget();
  const { apiBase, apiKey, signal, tools } = opts;

  let response: Response | undefined;
  const variants = requestBodyVariants(opts, false);
  let successfulVariant: (typeof variants)[number] | null = null;
  for (let variantIndex = 0; variantIndex < variants.length; variantIndex++) {
    const variant = variants[variantIndex];
    /* this path had no retry at all, so a single transient
       429 failed the whole call. That matters because it is not only the
       user-facing completion: retrieval (queryExpander), history
       compression and the turn summary all come through here, once per
       turn, and each was a chance to lose the turn to a rate limit the
       streaming path would simply have ridden out. */
    for (let attempt = 0; ; attempt++) {
      if (signal && signal.aborted) throw new Error('LLM request aborted');
      markLlmActivity();
      try {
        response = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: providerHeaders(apiKey, false),
          body: JSON.stringify(variant.body),
          signal,
          dispatcher: getLlmDispatcher(),
        } as unknown as RequestInit);
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (attempt >= TRANSIENT_ATTEMPTS - 1 || !retryBudget.reserve(1000)) {
          throw Object.assign(err as Error, { retryable: false });
        }
        await sleep(1000, signal);
        continue;
      }
      if (response.ok) {
        successfulVariant = variant;
        break;
      }
      const errBody = await response.text().catch(() => '');
      if (response.status === 400) {
        console.warn('[LLM] rejected completion request', JSON.stringify({
          capability: modelCapability(opts.model).id,
          variant: variant.reason,
          fields: Object.keys(variant.body),
          toolCount: Array.isArray(tools) ? tools.length : 0,
        }));
      }
      const fallbackIndex =
        response.status === 400 ? nextCompatibilityVariant(variants, variantIndex, errBody) : -1;
      if (fallbackIndex >= 0) {
        variantIndex = fallbackIndex - 1;
        console.warn(
          '[LLM] provider rejected optional request fields; retrying with compatibility payload',
          JSON.stringify({
            status: response.status,
            toolCount: Array.isArray(tools) ? tools.length : 0,
            maxTokens: variant.body.max_tokens,
          }),
        );
        break;
      }
      const delayMs = upstreamRetryDelayMs(
        response.status,
        attempt,
        response.headers.get('retry-after'),
      );
      if (
        !isRetryableUpstreamStatus(response.status) ||
        isPermanentQuotaError(errBody) ||
        attempt >= attemptsForUpstreamStatus(response.status) - 1 ||
        !retryBudget.reserve(delayMs)
      ) {
        const { ApiError } = await import('../../../lib/errors.js');
        console.warn(
          '[LLM] completion failed',
          JSON.stringify({ status: response.status, attempts: attempt + 1 }),
        );
        throw Object.assign(
          new ApiError(
            response.status,
            'LLM_UPSTREAM_ERROR',
            `LLM API error ${response.status}. Try again later or switch model.`,
          ),
          {
            retryable: false,
            ...(response.status === RATE_LIMIT_STATUS && !isPermanentQuotaError(errBody)
              ? { retryAfterMs: delayMs }
              : {}),
          },
        );
      }
      console.warn(
        '[LLM] upstream ' + response.status + ' on the non-streaming path; retrying',
        JSON.stringify({
          attempt: attempt + 1,
          delayMs,
        }),
      );
      await sleep(delayMs, signal);
    }
    if (response?.ok) break;
  }
  if (!response?.ok) throw new Error('LLM API request failed');

  const json = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string; reasoning_content?: unknown; tool_calls?: unknown };
      finish_reason?: string | null;
    }>;
    /* Non-streaming responses carry `usage` unconditionally on every
       OpenAI-compatible provider. It used to be parsed and thrown away,
       which is why even the non-streaming path billed from a chars/4
       estimate. Surfaced below so callers can prefer measured numbers. */
    usage?: unknown;
  };
  const failure = providerPayloadFailure(json);
  if (failure) {
    const { ApiError } = await import('../../../lib/errors.js');
    console.warn('[LLM] error in successful HTTP body', JSON.stringify({ status: failure.status }));
    throw Object.assign(
      new ApiError(
        failure.status,
        'LLM_UPSTREAM_ERROR',
        `LLM API error ${failure.status}. Try again later or switch model.`,
      ),
      { retryable: false },
    );
  }
  observePromptCacheUsage(json.usage);
  /* Preserve reasoning_content for the next tool/history request. */
  const message = json.choices?.[0]?.message || {};
  const finishReason = json.choices?.[0]?.finish_reason || null;
  return {
    content: message.content || '',
    reasoning_content:
      typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined,
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
    finish_reason: finishReason,
    /* Raw upstream usage object, or undefined when the provider omitted it.
       Normalisation lives in services/core/usageTracker.ts (resolveUsage). */
    usage: json.usage,
    meta: {
      response_speed_applied: successfulVariant?.speedApplied || 'standard',
    },
  };
}
