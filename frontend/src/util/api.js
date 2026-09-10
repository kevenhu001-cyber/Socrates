// @ts-nocheck
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

/* P_cdn-bypass — the CDN (Tencent EdgeOne) has cached stale responses
 * for /api/ paths and ignores Cache-Control headers. Use /api/v2/ prefix
 * which the CDN has never seen, so every request hits the origin fresh.
 * Nginx rewrites /api/v2/* → /api/* before proxying to the backend. */
const API_PREFIX = '/api/v2';

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

export function getCsrfToken() {
  const m = document.cookie.match(/\bcsrf=([^;]+)/);
  return m ? m[1] : null;
}

/**
 * Like apiFetch, but returns the raw Response so streaming callers
 * (SSE, chunked) can consume the body themselves. Adds the same
 * CSRF header, credentials, 401 → on401, and 403 → refresh+yield+
 * replay-once behaviour.
 *
 * Use this for /api/chat/stream, /api/search, /api/fetch-batch.
 * For ordinary JSON endpoints, use apiFetch.
 */
export async function apiFetchRaw(path, opts = {}) {
  /* P_cdn-bypass — prepend /api/v2 prefix to bypass stale CDN cache.
     Idempotent: if the path is already /api/v2/* (or starts with the
     prefix from a wrapper), don't double-prepend into /api/v2/v2/*. */
  if (!path.startsWith(API_PREFIX + '/')) path = path.replace(/^\/api\//, API_PREFIX + '/');
  opts.credentials = 'include';
  if (!opts.headers) opts.headers = {};
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
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
  /* P_abort_listener_cleanup — the listener we add to opts.signal
     captures `controller`. After the fetch returns the listener is
     dead weight; in the streaming path the caller's signal is a
     per-call ac that goes out of scope, but in apiFetch / retryApiFetch
     callers can re-use a long-lived signal and the listener chain
     grows. Track the listener so we can detach it once the call ends. */
  let onCallerAbort = null;
  if (opts.signal) {
    if (opts.signal.aborted) { try { controller.abort(); } catch (_) {} }
    else {
      onCallerAbort = () => { try { controller.abort(); } catch (_) {} };
      opts.signal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }
  let r;
  try {
    r = await fetch(path, Object.assign({}, opts, { signal: controller.signal }));
  } catch {
    clearTimeout(tmo);
    if (opts.signal && onCallerAbort) {
      try { opts.signal.removeEventListener('abort', onCallerAbort); } catch (_) {}
    }
    throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
  }
  clearTimeout(tmo);
  if (opts.signal && onCallerAbort) {
    try { opts.signal.removeEventListener('abort', onCallerAbort); } catch (_) {}
  }
  if (!r.ok) {
    if (r.status === 401 && !opts._authEndpoint && !_isInGraceWindow()) {
      try { _on401 && _on401('apiFetchRaw:' + method + ' ' + path); } catch (_) {}
    } else if (r.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD') {
      try { await fetch('/api/v2/auth/csrf-token', { credentials: 'include' }); } catch (_) {}
      await new Promise((res) => setTimeout(res, 0));
      return apiFetchRaw(path, Object.assign({}, opts, { _csrfRetried: true }));
    }
    let txt = '';
    let parsedBody = null;
    try { txt = await r.text(); } catch (_) {}
    try { if (txt) parsedBody = JSON.parse(txt); } catch (_) {}
    const msg = (parsedBody && parsedBody.message) || (parsedBody && parsedBody.detail) || (parsedBody && parsedBody.error) || txt || r.statusText || ('HTTP ' + r.status);
    throw makeApiError(r.status, String(msg).slice(0, 200), parsedBody, (parsedBody && parsedBody.code) || null, 0);
  }
  return r;
}

export async function apiFetch(path, opts = {}) {
  /* P_cdn-bypass — prepend /api/v2 prefix to bypass stale CDN cache.
     Idempotent: see apiFetchRaw. */
  if (!path.startsWith(API_PREFIX + '/')) path = path.replace(/^\/api\//, API_PREFIX + '/');
  opts.credentials = 'include';
  if (!opts.headers) opts.headers = {};
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const token = getCsrfToken();
    if (token) opts.headers['X-CSRF-Token'] = token;
  }
  /* P_cache-busting — append a cache nonce to GET requests so CDN
   * edge caches (e.g. Tencent EdgeOne) always fetch fresh content
   * from the origin. Without this, a CDN that cached an early
   * empty response from /api/sessions will keep serving it even
   * after the backend has real data, because the CDN doesn't
   * re-validate until the cached entry's TTL expires. The server
   * now sets Cache-Control: no-cache but the old cached entry
   * persists in the CDN until purged. A unique query param makes
   * every URL a new cache key, bypassing the stale entry.
   * The server ignores the `cb` param (no signing covers query).
   *
   * NOTE: Use `cb=` (not `_t=`) to avoid Chromium's Tracking
   * Prevention, which blocks requests with timestamp-like query
   * parameters (e.g. `_t=`, `_ts=`, `timestamp=`) as suspected
   * fingerprinting vectors. */
  if (method === 'GET') {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    path = path + sep + 'cb=' + Date.now();
    opts.cache = 'no-store';
    opts.headers['Cache-Control'] = 'no-store';
    opts.headers['Pragma'] = 'no-cache';
  }
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
  const userSignal = opts.signal || null;
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs);
  // Track the abort listener so we can detach it after the call completes,
  // preventing listener accumulation when a long-lived signal is reused.
  let onUserAbort = null;
  if (userSignal) {
    if (userSignal.aborted) { try { controller.abort(); } catch (_) {} }
    else {
      onUserAbort = () => { try { controller.abort(); } catch (_) {} };
      userSignal.addEventListener('abort', onUserAbort, { once: true });
    }
  }
  let r;
  try {
    r = await fetch(path, Object.assign({}, opts, { signal: controller.signal }));
  } catch (e) {
    clearTimeout(timer);
    if (userSignal && onUserAbort) {
      try { userSignal.removeEventListener('abort', onUserAbort); } catch (_) {}
    }
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
    if (userSignal && onUserAbort) {
      try { userSignal.removeEventListener('abort', onUserAbort); } catch (_) {}
    }
  }
  let text;
  try { text = await r.text(); } catch {
    throw makeApiError(r.status || 0, '响应读取失败', null, 'READ_BODY', 0);
  }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) {
    /* M3 — surface the server's message/code. The validation error shape
       is {code:'VALIDATION_ERROR', message:'Request validation failed'} —
       the old lookup (detail/title/error only) discarded `message` and
       every 400 rendered as the opaque 'HTTP 400'. */
    const msg = (json && (json.message || json.detail || json.title || json.error)) || ('HTTP ' + r.status);
    const err = makeApiError(r.status, typeof msg === 'string' ? msg : ('HTTP ' + r.status), json, json && json.code, 0);
    try {
      const rid = r.headers && typeof r.headers.get === 'function' ? r.headers.get('X-Request-Id') : null;
      if (rid) err.requestId = rid;
    } catch (_) {}
    if (r.status === 401 && !opts._authEndpoint && !_isInGraceWindow()) {
      try { _on401 && _on401('apiFetch:' + method + ' ' + path); } catch (_) {}
    } else if (r.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD') {
      // Use a fresh AbortController for the CSRF refresh — the original
      // controller may already be aborted (timeout / user abort), which
      // would silently fail the CSRF token fetch and leave the retry
      // without a valid token, causing a permanent 403 loop.
      const csrfController = new AbortController();
      const csrfTimer = setTimeout(() => { try { csrfController.abort(); } catch (_) {} }, 5000);
      try { await fetch('/api/v2/auth/csrf-token', { credentials: 'include', signal: csrfController.signal }); } catch (_) {}
      clearTimeout(csrfTimer);
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
      /* P_retry-jitter — the previous jitter of ±40ms was too small
         to spread concurrent retries from parallel requests (Bug 13).
         With jitter proportional to backoffMs, N requests that fail
         simultaneously spread their retries over a wider window. */
      const wait = backoffMs * attempt + Math.floor(Math.random() * backoffMs);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}
