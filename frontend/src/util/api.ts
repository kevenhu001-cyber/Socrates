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

/* ─── Types ─── */

export interface AuthHooks {
  on401?: (source: string) => void;
  isInGraceWindow?: () => boolean;
}

export interface ApiError extends Error {
  status: number;
  code: string | null;
  body: unknown | null;
  retried: number;
  isApiError: true;
}

export interface ApiFetchOpts extends RequestInit {
  timeoutMs?: number;
  signal?: AbortSignal;
  _authEndpoint?: boolean;
  _csrfRetried?: boolean;
}

export interface RetryOpts {
  retries?: number;
  backoffMs?: number;
}

/* ─── State ─── */

let _on401: ((source: string) => void) | null = null;
let _isInGraceWindow: () => boolean = () => false;

export function installAuthHooks({ on401, isInGraceWindow }: AuthHooks): void {
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
export function makeApiError(
  status: number,
  message: string,
  body: unknown,
  code: string | null,
  retried: number
): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.code = code;
  err.body = body;
  err.retried = retried || 0;
  err.isApiError = true;
  return err;
}

export function getCsrfToken(): string | null {
  const m = document.cookie.match(/\bcsrf=([^;]+)/);
  return m ? m[1] : null;
}

/**
 * Prepends /api/v2/ prefix to bypass stale CDN cache.
 * Idempotent: if the path is already /api/v2/..., don't double-prepend.
 */
function withV2Prefix(path: string): string {
  if (!/^\/api\/v2\//.test(path)) {
    return path.replace(/^\/api\//, '/api/v2/');
  }
  return path;
}

/**
 * Attaches CSRF token for non-GET/HEAD requests.
 */
function attachCsrf(headers: Record<string, string>, method: string): void {
  const methodU = method.toUpperCase();
  if (methodU !== 'GET' && methodU !== 'HEAD') {
    const t = getCsrfToken();
    if (t) headers['X-CSRF-Token'] = t;
  }
}

/**
 * Serializes body to JSON if it's a plain object (not FormData, not string).
 */
function prepareBody(
  opts: ApiFetchOpts
): { body: BodyInit | undefined; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  if (opts.headers) {
    Object.assign(headers, opts.headers);
  }
  if (opts.body != null && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    return { body: JSON.stringify(opts.body), headers };
  }
  return { body: opts.body as BodyInit | undefined, headers };
}

/**
 * Creates an AbortController that respects both a timeout and an optional
 * user-supplied signal. Returns the controller plus a cleanup function.
 */
function makeController(
  timeoutMs: number,
  userSignal?: AbortSignal
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => { try { controller.abort(); } catch (_) { /* ignore */ } }, timeoutMs);

  let onUserAbort: (() => void) | null = null;
  if (userSignal) {
    if (userSignal.aborted) {
      try { controller.abort(); } catch (_) { /* ignore */ }
    } else {
      onUserAbort = () => { try { controller.abort(); } catch (_) { /* ignore */ } };
      userSignal.addEventListener('abort', onUserAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (userSignal && onUserAbort) {
      try { userSignal.removeEventListener('abort', onUserAbort); } catch (_) { /* ignore */ }
    }
  };

  return { controller, cleanup };
}

/**
 * Handles 401 → on401 hook and 403 → CSRF refresh + retry.
 * Returns true if the caller should retry (403 case), false otherwise.
 */
async function handleHttpError(
  r: Response,
  method: string,
  path: string,
  opts: ApiFetchOpts,
  fetchFn: typeof apiFetchRaw
): Promise<boolean> {
  if (r.status === 401 && !opts._authEndpoint && !_isInGraceWindow()) {
    try { _on401 && _on401('apiFetchRaw:' + method + ' ' + path); } catch (_) { /* ignore */ }
  } else if (r.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD') {
    const csrfController = new AbortController();
    const csrfTimer = setTimeout(() => { try { csrfController.abort(); } catch (_) { /* ignore */ } }, 5000);
    try { await fetch('/api/v2/auth/csrf-token', { credentials: 'include', signal: csrfController.signal }); } catch (_) { /* ignore */ }
    clearTimeout(csrfTimer);
    await new Promise(res => setTimeout(res, 0));
    // The retried call will throw its own error if it fails again.
    return true; // signal retry
  }
  return false;
}

/**
 * Extracts error body from a Response.
 * Returns { text, parsedBody }.
 */
async function extractErrorBody(r: Response): Promise<{ text: string; parsedBody: Record<string, unknown> | null }> {
  let txt = '';
  let parsedBody: Record<string, unknown> | null = null;
  try { txt = await r.text(); } catch (_) { /* ignore */ }
  try { if (txt) parsedBody = JSON.parse(txt); } catch (_) { /* ignore */ }
  return { text: txt, parsedBody };
}

/**
 * Builds an error message from the parsed response body.
 */
function buildErrorMessage(parsedBody: Record<string, unknown> | null, txt: string, r: Response): string {
  return (
    (parsedBody && (parsedBody.message as string)) ||
    (parsedBody && (parsedBody.detail as string)) ||
    (parsedBody && (parsedBody.error as string)) ||
    txt ||
    r.statusText ||
    'HTTP ' + r.status
  );
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
export async function apiFetchRaw(path: string, opts: ApiFetchOpts = {}): Promise<Response> {
  path = withV2Prefix(path);
  opts.credentials = 'include';

  const { body, headers } = prepareBody(opts);
  opts.body = body;
  opts.headers = headers as Record<string, string>;
  const method = (opts.method || 'GET').toUpperCase();
  attachCsrf(headers, method);

  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
  const { controller, cleanup } = makeController(timeoutMs, opts.signal);

  let r: Response;
  try {
    r = await fetch(path, { ...opts, signal: controller.signal });
  } catch (e) {
    cleanup();
    throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
  }
  cleanup();

  if (!r.ok) {
    const shouldRetry = await handleHttpError(r, method, path, opts, apiFetchRaw);
    if (shouldRetry) {
      return apiFetchRaw(path, { ...opts, _csrfRetried: true });
    }

    const { text: txt, parsedBody } = await extractErrorBody(r);
    const msg = buildErrorMessage(parsedBody, txt, r);
    const code = (parsedBody && (parsedBody.code as string)) || null;
    throw makeApiError(r.status, String(msg).slice(0, 200), parsedBody, code, 0);
  }
  return r;
}

export async function apiFetch(path: string, opts: ApiFetchOpts = {}): Promise<unknown> {
  path = withV2Prefix(path);
  opts.credentials = 'include';

  const { body, headers } = prepareBody(opts);
  opts.body = body;
  opts.headers = headers as Record<string, string>;
  const method = (opts.method || 'GET').toUpperCase();
  attachCsrf(headers, method);

  /* P_cache-busting — append a cache nonce to GET requests so CDN
   * edge caches (e.g. Tencent EdgeOne) always fetch fresh content
   * from the origin. */
  if (method === 'GET') {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    path = path + sep + 'cb=' + Date.now();
  }

  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
  const userSignal = opts.signal || null;
  const { controller, cleanup } = makeController(timeoutMs, userSignal ?? undefined);

  let r: Response;
  try {
    r = await fetch(path, { ...opts, signal: controller.signal });
  } catch (e) {
    cleanup();
    const aborted = e && ((e as Error).name === 'AbortError' || controller.signal.aborted);
    throw makeApiError(
      0,
      aborted ? '请求被取消' : '网络异常，请检查连接后重试',
      null,
      aborted ? 'ABORTED' : 'NETWORK',
      0
    );
  }
  cleanup();

  let text: string;
  try { text = await r.text(); } catch (e) {
    throw makeApiError(r.status || 0, '响应读取失败', null, 'READ_BODY', 0);
  }

  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }

  if (!r.ok) {
    const jsonObj = json as Record<string, string> | null;
    const msg = (jsonObj && (jsonObj.detail || jsonObj.title || jsonObj.error)) || ('HTTP ' + r.status);
    const err = makeApiError(r.status, msg, json, (jsonObj && jsonObj.code) || null, 0);

    if (r.status === 401 && !opts._authEndpoint && !_isInGraceWindow()) {
      try { _on401 && _on401('apiFetch:' + method + ' ' + path); } catch (_) { /* ignore */ }
    } else if (r.status === 403 && !opts._csrfRetried && method !== 'GET' && method !== 'HEAD') {
      const csrfController = new AbortController();
      const csrfTimer = setTimeout(() => { try { csrfController.abort(); } catch (_) { /* ignore */ } }, 5000);
      try { await fetch('/api/v2/auth/csrf-token', { credentials: 'include', signal: csrfController.signal }); } catch (_) { /* ignore */ }
      clearTimeout(csrfTimer);
      await new Promise(res => setTimeout(res, 0));
      return apiFetch(path, { ...opts, _csrfRetried: true });
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
export async function retryApiFetch(
  path: string,
  opts?: ApiFetchOpts,
  retryOpts?: RetryOpts
): Promise<unknown> {
  retryOpts = retryOpts || {};
  const retries = typeof retryOpts.retries === 'number' ? retryOpts.retries : 2;
  const backoffMs = typeof retryOpts.backoffMs === 'number' ? retryOpts.backoffMs : 400;
  const userSignal = opts && opts.signal;
  let attempt = 0;
  while (true) {
    try {
      return await apiFetch(path, opts);
    } catch (e) {
      const apiErr = e as ApiError;
      const retryable = apiErr && (
        apiErr.status === 0 || apiErr.status === 408 || apiErr.status === 429 ||
        (apiErr.status >= 500 && apiErr.status < 600)
      );
      if (!retryable || attempt >= retries) throw e;
      if (userSignal && userSignal.aborted) throw e;
      attempt++;
      apiErr.retried = attempt;
      const wait = backoffMs * attempt + Math.floor(Math.random() * 80);
      await new Promise(res => setTimeout(res, wait));
    }
  }
}
