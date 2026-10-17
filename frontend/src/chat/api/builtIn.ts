import { apiFetchRaw } from '../../util/api.ts';
import { getStoredResponseSpeed } from '../../config/chatPreferences.ts';
import { notifySpeedFallbackOnce } from '../speedFallback.ts';
import { AI_MAX_ATTEMPTS, isUserAbort } from '../retryPolicy.ts';
import type { AIRequestOptions } from '../retryPolicy.ts';
import { buildChatRequestBody } from './requestBody.ts';
import type { ChatRequestMessage } from './requestBody.ts';
import type { ProviderConfig } from '../../config/providerConfig.types.ts';
import {
  attemptLimit,
  bindAbortSignal,
  errorMessage,
  isAbortError,
  makeAIError,
  monthlyLimitMessage,
  retryDecision,
  setLastCallError,
} from './shared.ts';
import type { ChatApiError } from './shared.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

/**
 * The built-in provider row carries no credential: the server holds the key
 * and authenticates the proxied hop itself, so `key` is absent here and the
 * Authorization header it would build is vestigial.
 */
export type BuiltInProvider = ProviderConfig & { key?: string };

interface ChatCompletion {
  choices: Array<{ message: { content: string } }>;
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

type BuiltInOutcome =
  | { kind: 'success'; content: string }
  /* `userCancelled` is absent on failures that never reached the transport
     (a malformed 200 body), which the retry loop treats as not-cancelled. */
  | { kind: 'failure'; error: ChatApiError; userCancelled?: boolean };

function asFailure(value: unknown): RequestFailure {
  return (value || {}) as RequestFailure;
}

async function readResponseText(response: Response): Promise<string> {
  try { return await response.text(); }
  catch (error) {
    reportSwallow(error, 'chat/api.builtIn.readResponse');
    return '';
  }
}

function parseResponseBody(text: string): unknown {
  try { return JSON.parse(text); }
  catch { return null; }
}

function isChatCompletion(body: unknown): body is ChatCompletion {
  const candidate = body as ChatCompletion | null;
  return !!(candidate && candidate.choices && candidate.choices[0]
    && candidate.choices[0].message && typeof candidate.choices[0].message.content === 'string');
}

function builtInResponseError(response: Response, text: string): ChatApiError {
  const body = parseResponseBody(text);
  return makeAIError(
    response.status + ' ' + (text || '').slice(0, 200),
    response.status,
    body as Record<string, unknown> | null,
  );
}

function interpretBuiltInResponse(response: Response, text: string): BuiltInOutcome {
  if (!response.ok) return { kind: 'failure', error: builtInResponseError(response, text) };

  const body = parseResponseBody(text);
  if (!isChatCompletion(body)) {
    return { kind: 'failure', error: makeAIError('malformed response') };
  }
  if (body.meta && body.meta.response_speed_applied === 'standard'
      && getStoredResponseSpeed() === 'fast') {
    notifySpeedFallbackOnce();
  }
  return { kind: 'success', content: body.choices[0].message.content };
}

function normalizeBuiltInFailure(
  caught: unknown,
  controller: AbortController,
  retryOptions: AIRequestOptions,
): BuiltInOutcome {
  const failure = asFailure(caught);
  const reason = String(controller.signal.reason || '');
  const aborted = isAbortError(caught);
  const message = aborted
    ? (isUserAbort(caught, controller.signal) ? 'request cancelled' : 'request interrupted')
    : String(failure.message || caught);
  const error = makeAIError(message, failure.status, failure.body);
  error.code = failure.code;
  error.reason = reason;
  return {
    kind: 'failure',
    error,
    userCancelled: isUserAbort(caught, retryOptions.signal) || isUserAbort(caught, controller.signal),
  };
}

async function runBuiltInAttempt(
  provider: BuiltInProvider,
  requestBody: ReturnType<typeof buildChatRequestBody>,
  retryOptions: AIRequestOptions,
): Promise<BuiltInOutcome> {
  const controller = new AbortController();
  const unbind = bindAbortSignal(retryOptions.signal, controller);
  try {
    const response = await apiFetchRaw('/api/v2/minimax/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + provider.key,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    return interpretBuiltInResponse(response, await readResponseText(response));
  } catch (caught) {
    return normalizeBuiltInFailure(caught, controller, retryOptions);
  } finally {
    if (unbind) unbind();
  }
}

/* Built-in Beagle bypasses the proxy for its provider hop, but keeps the
   shared retry, CSRF, auth-hook, and cancellation policies. */
export async function callBuiltInAPI(
  provider: BuiltInProvider,
  messages: ChatRequestMessage[],
  maxTokens: number,
  retryOptions: AIRequestOptions,
): Promise<unknown> {
  const requestBody = buildChatRequestBody(messages, maxTokens, 0.7);
  const maxAttempts = attemptLimit(retryOptions, AI_MAX_ATTEMPTS);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = await runBuiltInAttempt(provider, requestBody, retryOptions);
    if (outcome.kind === 'success') return outcome.content;
    lastError = outcome.error;

    const quotaMessage = monthlyLimitMessage(lastError);
    if (quotaMessage) {
      setLastCallError(quotaMessage);
      return null;
    }
    if (!outcome.userCancelled) {
      const decision = await retryDecision(attempt, lastError, retryOptions);
      if (decision.retry) continue;
      if (decision.error) lastError = decision.error;
    }
    const retryQuotaMessage = monthlyLimitMessage(lastError);
    if (retryQuotaMessage) {
      setLastCallError(retryQuotaMessage);
      return null;
    }
    setLastCallError(errorMessage(lastError, 'Beagle request failed'));
    return null;
  }

  setLastCallError(lastError || 'Beagle non-stream request failed');
  return null;
}
