// @ts-check
/**
 * apiFetch + apiFetchRaw + retryApiFetch — the single point of
 * contact with the Socrates backend.
 *
 *  - Always includes credentials so the sid cookie travels.
 *  - Attaches X-CSRF-Token for state-changing requests.
 *  - Wraps fetch in an AbortController with a default 30 s timeout
 *    (overridable via opts.timeoutMs).
 *  - Normalises both `fetch()` throws (network / CORS / offline) and
 *    non-2xx responses into a single ApiError shape.
 *  - Exposes opts.signal so callers can chain their own AbortController.
 *
 * Returns parsed JSON on success, throws ApiError on failure.
 *
 * Auth-expiry / CSRF-replay behaviour is delegated through
 * `installAuthHooks({ on401, isInGraceWindow })` so this module
 * doesn't have a hard dependency on main.js's UI primitives
 * (showGate / showAuthSignin). The entry point calls the hook
 * function once at boot.
 */

let _on401 = null;
let _isInGraceWindow = () => false;

export function installAuthHooks({ on401, isInGraceWindow }) {
  if (on401) _on401 = on401;
  if (isInGraceWindow) _isInGraceWindow = isInGraceWindow;
}

/**
 * Unified ApiError shape — every apiFetch rejection is normalised
 * to this:
 *   { status, code, message, body, retried }
 *
 * `status` is 0 for network / abort; `code` is the server's
 * `code` field (e.g. "TOO_MANY_REQUESTS") when available.
 */
export function makeApiError(status, message, body, code, retried) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.body = body;
  err.retried = retried || 0;
  err.isApiError = true;
  return err;
}

function getCsrfToken() {
  const m = document.cookie.match(/\bcsrf=([^;]+)/);
  return m ? m[1] : null;
}

/**
 * Like apiFetch, but returns the raw Response so streaming callers
 * (SSE, chunked) can consume the body themselves. Adds the same
 * CSRF header, credentials, 401 → on401, and 403 → refresh+yield+
 * replay-once behaviour.
 *
 * Use this for /api/chat/stream, /api/agent/run, /api/search,
 * /api/fetch-batch. For ordinary JSON endpoints, use apiFetch.
 */
export async function apiFetchRaw(path, opts = {}) {
  opts.credentials = 'include';
  if (!opts.headers) opts.headers = {};
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const t = getCsrfToken();
    if (t) opts.headers['X-CSRF-Token'] = t;
  }
  const controller = new AbortController();
  const rawTimeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
  const tmo = setTimeout(() => { try { controller.abort(); } catch (_) {} }, rawTimeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) { try { controller.abort(); } catch (_) {} }
    else opts.signal.addEventListener('abort', () => { try { controller.abort(); } catch (_) {} });
  }
  let r;
  try {
    r = await fetch(path, Object.assign({}, opts, { signal: controller.signal }));
  } catch (e) {
    clearTimeout(tmo);
    throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
  }
  clearTimeout(tmo);
  if (!r.ok) {
    if (r.status === 401 && !opts._authEndpoint && !_isInGraceWindow()) {
      try { _on401 && _on401('apiFetchRaw:' + method + ' ' + path); } catch (_) {}
    } else if (r.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD') {
      try { await fetch('/api/auth/csrf-token', { credentials: 'include' }); } catch (_) {}
      await new Promise((res) => setTimeout(res, 0));
      return apiFetchRaw(path, Object.assign({}, opts, { _csrfRetried: true }));
    }
    let txt = '';
    try { txt = await r.text(); } catch (_) {}
    const msg = (txt || r.statusText || ('HTTP ' + r.status)).slice(0, 200);
    throw makeApiError(r.status, msg, null, null, 0);
  }
  return r;
}

export async function apiFetch(path, opts = {}) {
  opts.credentials = 'include';
  if (!opts.headers) opts.headers = {};
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const token = getCsrfToken();
    if (token) opts.headers['X-CSRF-Token'] = token;
  }
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
  const userSignal = opts.signal || null;
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs);
  if (userSignal) {
    if (userSignal.aborted) { try { controller.abort(); } catch (_) {} }
    else userSignal.addEventListener('abort', () => { try { controller.abort(); } catch (_) {} });
  }
  let r;
  try {
    r = await fetch(path, Object.assign({}, opts, { signal: controller.signal }));
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && (e.name === 'AbortError' || controller.signal.aborted);
    throw makeApiError(
      0,
      aborted ? '请求被取消' : '网络异常，请检查连接后重试',
      null,
      aborted ? 'ABORTED' : 'NETWORK',
      0
    );
  } finally {
    clearTimeout(timer);
  }
  let text;
  try { text = await r.text(); } catch (e) {
    throw makeApiError(r.status || 0, '响应读取失败', null, 'READ_BODY', 0);
  }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) {
    const msg = (json && (json.detail || json.title || json.error)) || ('HTTP ' + r.status);
    const err = makeApiError(r.status, msg, json, json && json.code, 0);
    if (r.status === 401 && !opts._authEndpoint && !_isInGraceWindow()) {
      try { _on401 && _on401('apiFetch:' + method + ' ' + path); } catch (_) {}
    } else if (r.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD') {
      try { await fetch('/api/auth/csrf-token', { credentials: 'include', signal: controller.signal }); } catch (_) {}
      await new Promise((res) => setTimeout(res, 0));
      return apiFetch(path, Object.assign({}, opts, { _csrfRetried: true }));
    }
    throw err;
  }
  return json;
}

/**
 * Retry wrapper. Retries on:
 *   - status 0 (network / abort)
 *   - status 408 / 429 / 5xx
 * Linear backoff with light jitter. Aborted requests are NOT
 * retried. Caller can override retries (default 2) and
 * backoffMs (default 400).
 */
export async function retryApiFetch(path, opts, retryOpts) {
  retryOpts = retryOpts || {};
  const retries = typeof retryOpts.retries === 'number' ? retryOpts.retries : 2;
  const backoffMs = typeof retryOpts.backoffMs === 'number' ? retryOpts.backoffMs : 400;
  const userSignal = opts && opts.signal;
  let attempt = 0;
  while (true) {
    try {
      return await apiFetch(path, opts);
    } catch (e) {
      const retryable = e && (
        e.status === 0 || e.status === 408 || e.status === 429 ||
        (e.status >= 500 && e.status < 600)
      );
      if (!retryable || attempt >= retries) throw e;
      if (userSignal && userSignal.aborted) throw e;
      attempt++;
      e.retried = attempt;
      const wait = backoffMs * attempt + Math.floor(Math.random() * 80);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}
