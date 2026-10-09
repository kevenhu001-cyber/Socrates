import { stateStore } from '../../state/store.js';
import { isUserAbort, waitForAIRetry } from '../retryPolicy.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

export function setLastCallError(value) {
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value });
}

export function makeAIError(message, status, body) {
  const error = new Error(String(message || 'model request failed'));
  if (status != null) error.status = Number(status);
  if (body != null) error.body = body;
  if (body && body.code) error.code = body.code;
  return error;
}

export function errorMessage(error, fallback) {
  return String(error && error.message || error || fallback || 'model request failed');
}

export function monthlyLimitMessage(error) {
  const body = error && error.body;
  const code = String(error && error.code || body && body.code || '').toUpperCase();
  if (code !== 'MONTHLY_LIMIT') return '';
  return 'Monthly Beagle usage limit reached. '
    + String(body && body.message || 'Upgrade your plan or wait until next month.');
}

export function bindAbortSignal(parent, child) {
  if (!parent) return null;
  const onAbort = () => {
    try { child.abort(parent.reason || 'aborted'); }
    catch (error) { reportSwallow(error, 'chat/api.bindAbortSignal.abort'); }
  };
  if (parent.aborted) onAbort();
  else parent.addEventListener('abort', onAbort, { once: true });
  return () => {
    try { parent.removeEventListener('abort', onAbort); }
    catch (error) { reportSwallow(error, 'chat/api.bindAbortSignal.cleanup'); }
  };
}

export async function waitForRetry(attempt, error, options) {
  try { return await waitForAIRetry(attempt, error, options); }
  catch (abortError) {
    if (isUserAbort(abortError, options && options.signal)) return false;
    throw abortError;
  }
}

export async function retryDecision(attempt, error, options) {
  try { return { retry: await waitForRetry(attempt, error, options), error: null }; }
  catch (retryError) { return { retry: false, error: retryError }; }
}

export function isAbortError(error) {
  return !!(error && (error.name === 'AbortError' || error.code === 20));
}

export function attemptLimit(options, defaultAttempts) {
  return options.maxRetries == null
    ? defaultAttempts
    : Math.max(0, options.maxRetries) + 1;
}
