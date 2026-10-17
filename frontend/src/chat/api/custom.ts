import { getStoredResponseSpeed } from '../../config/chatPreferences.ts';
import { notifySpeedFallbackOnce } from '../speedFallback.ts';
import { AI_MAX_ATTEMPTS, isUserAbort } from '../retryPolicy.ts';
import type { AIRequestOptions } from '../retryPolicy.ts';
import { buildChatRequestBody } from './requestBody.ts';
import type { ChatRequestMessage } from './requestBody.ts';
import type { ApiRequestOptions } from '../../util/api.ts';
import {
  attemptLimit,
  bindAbortSignal,
  errorMessage,
  makeAIError,
  monthlyLimitMessage,
  retryDecision,
  setLastCallError,
} from './shared.ts';
import type { ChatApiError } from './shared.ts';

/** The proxy answers with a chat-completion-shaped envelope. */
interface CustomProviderResponse {
  content?: unknown;
  meta?: { response_speed_applied?: string };
}

/** Fields the transport attaches to a thrown request failure. */
interface RequestFailure {
  name?: string;
  message?: unknown;
  status?: number;
  code?: string | null;
  body?: Record<string, unknown>;
}

type CustomOutcome =
  | { kind: 'success'; content: string }
  | { kind: 'failure'; error: ChatApiError; userCancelled: boolean; cause: unknown };

export type ApiFetch = (path: string, opts?: ApiRequestOptions) => Promise<unknown>;

function asFailure(value: unknown): RequestFailure {
  return (value || {}) as RequestFailure;
}

function interpretCustomResponse(response: unknown): CustomOutcome {
  const payload = (response || {}) as CustomProviderResponse;
  if (typeof payload.content !== 'string') {
    return { kind: 'failure', error: makeAIError('malformed response'), userCancelled: false, cause: null };
  }
  if (payload.meta && payload.meta.response_speed_applied === 'standard'
      && getStoredResponseSpeed() === 'fast') {
    notifySpeedFallbackOnce();
  }
  return { kind: 'success', content: payload.content };
}

function normalizeCustomFailure(
  caught: unknown,
  controller: AbortController,
  retryOptions: AIRequestOptions,
): CustomOutcome {
  const failure = asFailure(caught);
  const reason = String(controller.signal.reason || '');
  const aborted = !!(caught && (failure.name === 'AbortError' || controller.signal.aborted));
  const status = failure.status;
  const message = aborted
    ? (isUserAbort(caught, controller.signal) ? 'request cancelled' : 'request interrupted')
    : (status ? status + ' ' : 'network: ') + String(failure.message || caught);
  const error = makeAIError(message, status, failure.body);
  error.code = failure.code;
  error.reason = reason;
  return {
    kind: 'failure',
    error,
    userCancelled: isUserAbort(caught, retryOptions.signal) || isUserAbort(caught, controller.signal),
    cause: caught,
  };
}

async function runCustomAttempt(
  apiFetch: ApiFetch,
  messages: ChatRequestMessage[],
  maxTokens: number,
  retryOptions: AIRequestOptions,
): Promise<CustomOutcome> {
  const controller = new AbortController();
  const unbind = bindAbortSignal(retryOptions.signal, controller);
  try {
    const response = await apiFetch('/api/chat', {
      method: 'POST',
      body: buildChatRequestBody(messages, maxTokens, 0.7),
      signal: controller.signal,
    });
    return interpretCustomResponse(response);
  } catch (caught) {
    return normalizeCustomFailure(caught, controller, retryOptions);
  } finally {
    if (unbind) unbind();
  }
}

/* User-configured providers use the same payload, retry budget, and terminal
   quota handling as the built-in provider through the server proxy. */
export async function callCustomAPI(
  apiFetch: ApiFetch,
  messages: ChatRequestMessage[],
  maxTokens: number,
  retryOptions: AIRequestOptions,
): Promise<unknown> {
  const maxAttempts = attemptLimit(retryOptions, AI_MAX_ATTEMPTS);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = await runCustomAttempt(apiFetch, messages, maxTokens, retryOptions);
    if (outcome.kind === 'success') return outcome.content;
    lastError = outcome.error;

    const quotaMessage = monthlyLimitMessage(lastError);
    if (quotaMessage) {
      setLastCallError(quotaMessage);
      return null;
    }
    let retryFailure: unknown = null;
    if (!outcome.userCancelled) {
      const decision = await retryDecision(attempt, lastError, retryOptions);
      if (decision.retry) continue;
      retryFailure = decision.error;
      if (retryFailure) lastError = retryFailure;
    }
    const retryQuotaMessage = monthlyLimitMessage(lastError);
    if (retryQuotaMessage) {
      setLastCallError(retryQuotaMessage);
      return null;
    }
    const cause = outcome.cause || retryFailure;
    if (cause) console.error('[API] call failed:', cause);
    setLastCallError(errorMessage(lastError, 'non-stream request failed'));
    return null;
  }

  setLastCallError(errorMessage(lastError, 'non-stream request failed'));
  return null;
}
