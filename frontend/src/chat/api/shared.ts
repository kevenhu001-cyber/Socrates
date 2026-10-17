import { stateStore } from '../../state/store.js';
import { isUserAbort, waitForAIRetry } from '../retryPolicy.ts';
import type { AIRequestOptions } from '../retryPolicy.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

/** Error envelope the provider modules attach status/body details to. */
export interface ChatApiError extends Error {
  status?: number;
  body?: Record<string, unknown>;
  code?: string;
}

/** The abort surface a parent signal drives. */
export interface AbortableChild {
  abort(reason?: unknown): void;
}

export interface RetryDecision {
  retry: boolean;
  error: unknown;
}

export function setLastCallError(value: unknown): void {
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value });
}

export function makeAIError(message: unknown, status?: number | null, body?: Record<string, unknown> | null): ChatApiError {
  const error = new Error(String(message || 'model request failed')) as ChatApiError;
  if (status != null) error.status = Number(status);
  if (body != null) error.body = body;
  if (body && body.code) error.code = String(body.code);
  return error;
}

export function errorMessage(error: unknown, fallback?: string): string {
  const record = error as { message?: unknown } | null | undefined;
  return String(record && record.message || error || fallback || 'model request failed');
}

export function monthlyLimitMessage(error: unknown): string {
  const record = error as { code?: unknown; body?: { code?: unknown; message?: unknown } } | null | undefined;
  const body = record && record.body;
  const code = String(record && record.code || body && body.code || '').toUpperCase();
  if (code !== 'MONTHLY_LIMIT') return '';
  return 'Monthly Beagle usage limit reached. '
    + String(body && body.message || 'Upgrade your plan or wait until next month.');
}

export function bindAbortSignal(
  parent: AbortSignal | null | undefined,
  child: AbortableChild,
): (() => void) | null {
  if (!parent) return null;
  const onAbort = (): void => {
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

export async function waitForRetry(
  attempt: number,
  error: unknown,
  options?: AIRequestOptions,
): Promise<boolean> {
  try { return await waitForAIRetry(attempt, error, options); }
  catch (abortError) {
    if (isUserAbort(abortError, options && options.signal)) return false;
    throw abortError;
  }
}

export async function retryDecision(
  attempt: number,
  error: unknown,
  options?: AIRequestOptions,
): Promise<RetryDecision> {
  try { return { retry: await waitForRetry(attempt, error, options), error: null }; }
  catch (retryError) { return { retry: false, error: retryError }; }
}

export function isAbortError(error: unknown): boolean {
  const record = error as { name?: unknown; code?: unknown } | null | undefined;
  return !!(record && (record.name === 'AbortError' || record.code === 20));
}

export function attemptLimit(options: AIRequestOptions, defaultAttempts: number): number {
  return options.maxRetries == null
    ? defaultAttempts
    : Math.max(0, options.maxRetries) + 1;
}
