import { getStoredResponseSpeed } from '../../config/chatPreferences.ts';
import { notifySpeedFallbackOnce } from '../speedFallback.js';
import { AI_MAX_ATTEMPTS, isUserAbort } from '../retryPolicy.ts';
import { buildChatRequestBody } from './requestBody.js';
import {
  attemptLimit,
  bindAbortSignal,
  errorMessage,
  makeAIError,
  monthlyLimitMessage,
  retryDecision,
  setLastCallError,
} from './shared.js';

function interpretCustomResponse(response) {
  if (!response || typeof response.content !== 'string') {
    return { kind: 'failure', error: makeAIError('malformed response'), userCancelled: false, cause: null };
  }
  if (response.meta && response.meta.response_speed_applied === 'standard'
      && getStoredResponseSpeed() === 'fast') {
    notifySpeedFallbackOnce();
  }
  return { kind: 'success', content: response.content };
}

function normalizeCustomFailure(caught, controller, retryOptions) {
  const reason = String(controller.signal.reason || '');
  const aborted = !!(caught && (caught.name === 'AbortError' || controller.signal.aborted));
  const status = caught && caught.status;
  const message = aborted
    ? (isUserAbort(caught, controller.signal) ? 'request cancelled' : 'request interrupted')
    : (status ? status + ' ' : 'network: ') + (caught && caught.message || caught);
  const error = makeAIError(message, status, caught && caught.body);
  error.code = caught && caught.code;
  error.reason = reason;
  return {
    kind: 'failure',
    error,
    userCancelled: isUserAbort(caught, retryOptions.signal) || isUserAbort(caught, controller.signal),
    cause: caught,
  };
}

async function runCustomAttempt(apiFetch, messages, maxTokens, retryOptions) {
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
export async function callCustomAPI(apiFetch, messages, maxTokens, retryOptions) {
  const maxAttempts = attemptLimit(retryOptions, AI_MAX_ATTEMPTS);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const outcome = await runCustomAttempt(apiFetch, messages, maxTokens, retryOptions);
    if (outcome.kind === 'success') return outcome.content;
    lastError = outcome.error;

    const quotaMessage = monthlyLimitMessage(lastError);
    if (quotaMessage) {
      setLastCallError(quotaMessage);
      return null;
    }
    let retryFailure = null;
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
