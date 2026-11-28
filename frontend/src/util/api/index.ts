import { reportSwallow } from '../reportSwallow.ts';
import { authExpiryIsSuppressed, notifyUnauthorized, refreshCsrfToken } from './auth.ts';
import { createRetryApiFetch } from './retry.ts';
import { linkAbortSignal, prepareApiRequest, type ApiRequestOptions } from './request.ts';

export { installAuthHooks } from './auth.ts';
export { getCsrfToken } from './request.ts';
export type { ApiRequestOptions } from './request.ts';

/**
 * ApiError shape shared by JSON and streaming calls:
 * { status, code, message, body, retried }
 *
 * The API client keeps request normalization, auth recovery, response
 * parsing, and retry policy in focused modules while preserving these
 * stable public entry points.
 */
export interface ApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;
  retried: number;
  isApiError: true;
  requestId?: string;
}

export function makeApiError(
  status: number,
  message: string,
  body: unknown,
  code: string | null,
  retried: number,
): ApiError {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.code = code;
  error.body = body;
  error.retried = retried || 0;
  error.isApiError = true;
  return error;
}

function bodyField(body: unknown, key: string): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
}

function isEventStreamResponse(response: Response): boolean {
  try {
    const type =
      typeof response?.headers?.get === 'function'
        ? String(response.headers.get('content-type') || '')
        : '';
    return /text\/event-stream/i.test(type);
  } catch {
    /* empty-catch: intentional — header access cannot fail the request */ return false;
  }
}

async function throwRawResponseError(response: Response): Promise<never> {
  let text = '';
  let body: unknown = null;
  try {
    text = await response.text();
  } catch (error) {
    reportSwallow(error, 'util/api.rawError.readBody');
  }
  try {
    if (text) body = JSON.parse(text);
  } catch (error) {
    reportSwallow(error, 'util/api.rawError.parseBody');
  }
  const message =
    bodyField(body, 'message') ||
    bodyField(body, 'detail') ||
    bodyField(body, 'error') ||
    text ||
    response.statusText ||
    'HTTP ' + response.status;
  const code = bodyField(body, 'code');
  throw makeApiError(
    response.status,
    String(message).slice(0, 200),
    body,
    typeof code === 'string' ? code : null,
    0,
  );
}

function makeJsonResponseError(response: Response, body: unknown): ApiError {
  const raw =
    bodyField(body, 'message') ||
    bodyField(body, 'detail') ||
    bodyField(body, 'title') ||
    bodyField(body, 'error');
  const message = raw || 'HTTP ' + response.status;
  const code = bodyField(body, 'code');
  const error = makeApiError(
    response.status,
    typeof message === 'string' ? message : 'HTTP ' + response.status,
    body,
    typeof code === 'string' ? code : null,
    0,
  );
  try {
    const requestId =
      response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('X-Request-Id')
        : null;
    if (requestId) error.requestId = requestId;
  } catch (error_) {
    reportSwallow(error_, 'util/api.jsonError.requestId');
  }
  return error;
}

/** Return a raw Response for SSE and other incrementally-read bodies. */
export async function apiFetchRaw(path: string, opts: ApiRequestOptions = {}): Promise<Response> {
  const request = prepareApiRequest(path, opts);
  const linkedSignal = linkAbortSignal(opts.signal, 'util/api.apiFetchRaw');
  let response: Response;
  try {
    response = await fetch(request.path, {
      ...request.opts,
      signal: linkedSignal.controller.signal,
    } as RequestInit);
  } catch (error_) {
    linkedSignal.detach();
    const failure = error_ as { name?: string } | null;
    if (failure?.name === 'AbortError' || linkedSignal.controller.signal.aborted) {
      throw abortedRequestError();
    }
    throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
  }

  /* Keep the caller listener attached while an SSE body is being consumed;
     for every other response the fetch is complete and cleanup is safe. */
  if (!(response.ok && isEventStreamResponse(response))) linkedSignal.detach();

  if (!response.ok) {
    if (response.status === 401 && !opts._authEndpoint && !authExpiryIsSuppressed()) {
      notifyUnauthorized('apiFetchRaw', request.method, request.path);
    } else if (shouldRefreshCsrf(response, opts, request.method)) {
      if (response.body && typeof response.body.cancel === 'function') {
        await response.body.cancel().catch(() => {});
      }
      const refreshController = new AbortController();
      await refreshCsrfToken(refreshController.signal, 'util/api.apiFetchRaw');
      return apiFetchRaw(request.path, { ...opts, _csrfRetried: true });
    }
    await throwRawResponseError(response);
  }
  return response;
}

/**
 * Fetch and parse a JSON API response.
 *
 * The body is unknown by default. Callers that consume fields must declare
 * the response shape they expect or narrow the value at the API boundary.
 */
export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiRequestOptions = {},
): Promise<T> {
  const request = prepareApiRequest(path, opts, { cacheBustGet: true });
  const userSignal = opts.signal || null;
  const linkedSignal = linkAbortSignal(userSignal, 'util/api.apiFetch');
  let response: Response;
  let body: unknown;
  try {
    try {
      response = await fetch(request.path, {
        ...request.opts,
        signal: linkedSignal.controller.signal,
      } as RequestInit);
    } catch (error_) {
      const failure = error_ as { name?: string } | null;
      if (failure?.name === 'AbortError' || linkedSignal.controller.signal.aborted)
        throw abortedRequestError();
      throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
    }
    body = await readJsonBody(response, linkedSignal.controller.signal);
  } finally {
    linkedSignal.detach();
  }

  if (response.ok) return body as T;

  const error = makeJsonResponseError(response, body);
  if (response.status === 401 && !opts._authEndpoint && !authExpiryIsSuppressed()) {
    notifyUnauthorized('apiFetch', request.method, request.path);
  } else if (shouldRefreshCsrf(response, opts, request.method)) {
    /* Use a fresh signal so a user stop on the original request cannot
       prevent CSRF refresh and turn the replay into another 403. */
    const refreshController = new AbortController();
    await refreshCsrfToken(refreshController.signal, 'util/api.apiFetch');
    return apiFetch<T>(request.path, { ...opts, _csrfRetried: true });
  }
  throw error;
}

function shouldRefreshCsrf(response: Response, opts: ApiRequestOptions, method: string): boolean {
  return response.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD';
}

function abortedRequestError() {
  const error = makeApiError(0, '请求被取消', null, 'ABORTED', 0);
  error.name = 'AbortError';
  return error;
}

async function readJsonBody(response: Response, signal: AbortSignal): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    if (signal.aborted) throw abortedRequestError();
    throw makeApiError(response.status || 0, '响应读取失败', null, 'READ_BODY', 0);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    reportSwallow(error, 'util/api.jsonResponse.parseBody');
    return null;
  }
}

export const retryApiFetch = createRetryApiFetch(apiFetch);
