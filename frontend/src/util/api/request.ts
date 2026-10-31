import { reportSwallow } from '../reportSwallow.ts';
import { getCurrentLanguage } from '../../i18n/languageState.ts';

const API_PREFIX = '/api/v2';

/**
 * Options bag accepted by `apiFetch` / `apiFetchRaw`.
 *
 * Deliberately permissive: the two underscore flags are internal retry
 * markers, and the index signature keeps call sites that forward a whole
 * `RequestInit` (keepalive, mode, …) compiling. `body` is widened beyond
 * `BodyInit` because callers hand over plain objects, which the request
 * preparation serialises to JSON.
 */
export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | Record<string, unknown> | null;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  signal?: AbortSignal | null;
  _authEndpoint?: boolean;
  _csrfRetried?: boolean;
  [key: string]: unknown;
}

export interface PreparedRequest {
  path: string;
  opts: ApiRequestOptions;
  method: string;
}

export function getCsrfToken(): string | null {
  const match = document.cookie.match(/\bcsrf=([^;]+)/);
  return match ? match[1] : null;
}

/** Apply shared URL, credentials, body, and CSRF rules to an API request. */
export function prepareApiRequest(
  path: string,
  opts: ApiRequestOptions,
  { cacheBustGet = false }: { cacheBustGet?: boolean } = {},
): PreparedRequest {
  if (!path.startsWith(API_PREFIX + '/')) path = path.replace(/^\/api\//, API_PREFIX + '/');
  opts.credentials = 'include';
  if (!opts.headers) opts.headers = {};
  /* The server renders its error copy in the language the user picked.
   * `Accept-Language` only carries the OS locale, which does not follow an
   * in-app language switch, so the app states its own locale explicitly.
   * The server falls back to `Accept-Language` for every other client. */
  opts.headers['X-Socrates-Locale'] = getCurrentLanguage();
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }

  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const token = getCsrfToken();
    if (token) opts.headers['X-CSRF-Token'] = token;
  }

  if (cacheBustGet && method === 'GET') {
    /* `cb` avoids Chromium's Tracking Prevention for timestamp-like keys. */
    const separator = path.indexOf('?') >= 0 ? '&' : '?';
    path = path + separator + 'cb=' + Date.now();
    opts.cache = 'no-store';
    opts.headers['Cache-Control'] = 'no-store';
    opts.headers.Pragma = 'no-cache';
  }
  return { path, opts, method };
}

export interface LinkedSignal {
  controller: AbortController;
  detach: () => void;
}

/** Link a caller's signal to fetch and expose idempotent listener cleanup. */
export function linkAbortSignal(signal: AbortSignal | null | undefined, source: string): LinkedSignal {
  const controller = new AbortController();
  let onAbort: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      try { controller.abort(signal.reason); }
      catch (error) { reportSwallow(error, source + '.abort'); }
    } else {
      onAbort = () => {
        try { controller.abort(signal.reason); }
        catch (error) { reportSwallow(error, source + '.abort'); }
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  return {
    controller,
    detach() {
      if (!signal || !onAbort) return;
      try { signal.removeEventListener('abort', onAbort); }
      catch (error) { reportSwallow(error, source + '.cleanup'); }
      onAbort = null;
    },
  };
}
