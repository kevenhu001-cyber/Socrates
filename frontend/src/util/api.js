import { reportSwallow } from '../util/reportSwallow.ts';
import { authExpiryIsSuppressed, notifyUnauthorized, refreshCsrfToken } from './api/auth.js';
import { createRetryApiFetch } from './api/retry.js';
import { linkAbortSignal, prepareApiRequest } from './api/request.js';

export { installAuthHooks } from './api/auth.js';
export { getCsrfToken } from './api/request.js';

/**
 * ApiError shape shared by JSON and streaming calls:
 * { status, code, message, body, retried }
 *
 * The API client keeps request normalization, auth recovery, response
 * parsing, and retry policy in focused modules while preserving these
 * stable public entry points.
 */
export function makeApiError(status, message, body, code, retried) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.body = body;
  error.retried = retried || 0;
  error.isApiError = true;
  return error;
}

function isEventStreamResponse(response) {
  try {
    const type = response && response.headers && typeof response.headers.get === 'function'
      ? String(response.headers.get('content-type') || '')
      : '';
    return /text\/event-stream/i.test(type);
  } catch (_) {
    return false;
  }
}

async function throwRawResponseError(response) {
  let text = '';
  let body = null;
  try { text = await response.text(); }
  catch (error) { reportSwallow(error, 'util/api.rawError.readBody'); }
  try { if (text) body = JSON.parse(text); }
  catch (error) { reportSwallow(error, 'util/api.rawError.parseBody'); }
  const message = (body && body.message)
    || (body && body.detail)
    || (body && body.error)
    || text
    || response.statusText
    || ('HTTP ' + response.status);
  throw makeApiError(response.status, String(message).slice(0, 200), body, (body && body.code) || null, 0);
}

function makeJsonResponseError(response, body) {
  const message = (body && (body.message || body.detail || body.title || body.error)) || ('HTTP ' + response.status);
  const error = makeApiError(
    response.status,
    typeof message === 'string' ? message : ('HTTP ' + response.status),
    body,
    body && body.code,
    0,
  );
  try {
    const requestId = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('X-Request-Id')
      : null;
    if (requestId) error.requestId = requestId;
  } catch (caught) { reportSwallow(caught, 'util/api.jsonError.requestId'); }
  return error;
}

/** Return a raw Response for SSE and other incrementally-read bodies. */
export async function apiFetchRaw(path, opts = {}) {
  const request = prepareApiRequest(path, opts);
  const linkedSignal = linkAbortSignal(opts.signal, 'util/api.apiFetchRaw');
  let response;
  try {
    response = await fetch(request.path, Object.assign({}, request.opts, {
      signal: linkedSignal.controller.signal,
    }));
  } catch (_) {
    linkedSignal.detach();
    throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
  }

  /* Keep the caller listener attached while an SSE body is being consumed;
     for every other response the fetch is complete and cleanup is safe. */
  if (!(response.ok && isEventStreamResponse(response))) linkedSignal.detach();

  if (!response.ok) {
    if (response.status === 401 && !opts._authEndpoint && !authExpiryIsSuppressed()) {
      notifyUnauthorized('apiFetchRaw', request.method, request.path);
    } else if (shouldRefreshCsrf(response, opts, request.method)) {
      await refreshCsrfToken(undefined, 'util/api.apiFetchRaw');
      return apiFetchRaw(request.path, Object.assign({}, opts, { _csrfRetried: true }));
    }
    await throwRawResponseError(response);
  }
  return response;
}

/** Fetch and parse a JSON API response. */
export async function apiFetch(path, opts = {}) {
  const request = prepareApiRequest(path, opts, { cacheBustGet: true });
  const userSignal = opts.signal || null;
  const linkedSignal = linkAbortSignal(userSignal, 'util/api.apiFetch');
  let response;
  try {
    response = await fetch(request.path, Object.assign({}, request.opts, {
      signal: linkedSignal.controller.signal,
    }));
  } catch (caught) {
    const aborted = caught && (caught.name === 'AbortError' || linkedSignal.controller.signal.aborted);
    throw makeApiError(
      0,
      aborted ? '请求被取消' : '网络异常，请检查连接后重试',
      null,
      aborted ? 'ABORTED' : 'NETWORK',
      0,
    );
  } finally {
    linkedSignal.detach();
  }

  const body = await readJsonBody(response);
  if (response.ok) return body;

  const error = makeJsonResponseError(response, body);
  if (response.status === 401 && !opts._authEndpoint && !authExpiryIsSuppressed()) {
    notifyUnauthorized('apiFetch', request.method, request.path);
  } else if (shouldRefreshCsrf(response, opts, request.method)) {
    /* Use a fresh signal so a user stop on the original request cannot
       prevent CSRF refresh and turn the replay into another 403. */
    const refreshController = new AbortController();
    await refreshCsrfToken(refreshController.signal, 'util/api.apiFetch');
    return apiFetch(request.path, Object.assign({}, opts, { _csrfRetried: true }));
  }
  throw error;
}

function shouldRefreshCsrf(response, opts, method) {
  return response.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD';
}

async function readJsonBody(response) {
  let text;
  try { text = await response.text(); }
  catch (_) { throw makeApiError(response.status || 0, '响应读取失败', null, 'READ_BODY', 0); }
  try { return text ? JSON.parse(text) : null; }
  catch (error) {
    reportSwallow(error, 'util/api.jsonResponse.parseBody');
    return null;
  }
}

export const retryApiFetch = createRetryApiFetch(apiFetch);
