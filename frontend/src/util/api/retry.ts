import type { ApiRequestOptions } from './request.ts';
import { abortableDelay, throwIfAborted } from '../abort.ts';

export interface RetryOptions {
  retries?: number;
  backoffMs?: number;
}

/** Shape the JSON client attaches to a failed request. */
interface RetryableError extends Error {
  status?: number;
  retried?: number;
}

function isRetryable(error: RetryableError): boolean {
  return !!error && (
    error.status === 0
    || error.status === 408
    || error.status === 429
    || (typeof error.status === 'number' && error.status >= 500 && error.status < 600)
  );
}

function retryDelay(backoffMs: number, attempt: number): number {
  /* Jitter spreads retries from parallel requests across a wider window. */
  return backoffMs * attempt + Math.floor(Math.random() * backoffMs);
}

export type RetryApiFetch<T> = (
  path: string,
  opts?: ApiRequestOptions,
  retryOpts?: RetryOptions,
) => Promise<T>;

/** Bind the configurable retry policy to the single JSON API client. */
export function createRetryApiFetch<T>(
  fetchJson: (path: string, opts?: ApiRequestOptions) => Promise<T>,
): RetryApiFetch<T> {
  return async function retryApiFetch(path, opts, retryOpts) {
    const options = retryOpts || {};
    const retries = typeof options.retries === 'number' ? options.retries : 2;
    const backoffMs = typeof options.backoffMs === 'number' ? options.backoffMs : 400;
    const userSignal = opts && opts.signal;
    let attempt = 0;

    while (true) {
      throwIfAborted(userSignal);
      try {
        return await fetchJson(path, opts);
      } catch (caught) {
        const error = caught as RetryableError;
        error.retried = attempt;
        if (!isRetryable(error) || attempt >= retries || (userSignal && userSignal.aborted)) throw error;
        attempt += 1;
        error.retried = attempt;
        await abortableDelay(retryDelay(backoffMs, attempt), userSignal);
      }
    }
  };
}
