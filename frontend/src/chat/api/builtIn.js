import { apiFetchRaw } from '../../util/api.js';
import { getStoredResponseSpeed } from '../../config/chatPreferences.ts';
import { notifySpeedFallbackOnce } from '../speedFallback.js';
import {
  AI_MAX_ATTEMPTS,
  isUserAbort,
} from '../retryPolicy.ts';
import { buildChatRequestBody } from './requestBody.js';
import {
  attemptLimit,
  bindAbortSignal,
  errorMessage,
  isAbortError,
  makeAIError,
  monthlyLimitMessage,
  retryDecision,
  setLastCallError,
} from './shared.js';
import { reportSwallow } from '../../util/reportSwallow.ts';

async function readResponseText(response) {
  try { return await response.text(); }
  catch (error) {
    reportSwallow(error, 'chat/api.builtIn.readResponse');
    return '';
  }
}

function parseResponseBody(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function isChatCompletion(body) {
  return !!(body && body.choices && body.choices[0]
    && body.choices[0].message && typeof body.choices[0].message.content === 'string');
}

function builtInResponseError(response, text) {
  const body = parseResponseBody(text);
  return makeAIError(response.status + ' ' + (text || '').slice(0, 200), response.status, body);
}

function interpretBuiltInResponse(response, text) {
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

function normalizeBuiltInFailure(caught, controller, retryOptions) {
  const reason = String(controller.signal.reason || '');
  const aborted = isAbortError(caught);
  const message = aborted
    ? (isUserAbort(caught, controller.signal) ? 'request cancelled' : 'request interrupted')
    : String(caught && caught.message || caught);
  const error = makeAIError(message, caught && caught.status, caught && caught.body);
  error.code = caught && caught.code;
  error.reason = reason;
  return {
    kind: 'failure',
    error,
    userCancelled: isUserAbort(caught, retryOptions.signal) || isUserAbort(caught, controller.signal),
  };
}

async function runBuiltInAttempt(provider, requestBody, retryOptions) {
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
export async function callBuiltInAPI(provider, messages, maxTokens, retryOptions) {
  const requestBody = buildChatRequestBody(messages, maxTokens, 0.7);
  const maxAttempts = attemptLimit(retryOptions, AI_MAX_ATTEMPTS);
  let lastError = null;

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
