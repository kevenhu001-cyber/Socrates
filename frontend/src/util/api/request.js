import { reportSwallow } from '../reportSwallow.ts';

const API_PREFIX = '/api/v2';

export function getCsrfToken() {
  const match = document.cookie.match(/\bcsrf=([^;]+)/);
  return match ? match[1] : null;
}

/** Apply shared URL, credentials, body, and CSRF rules to an API request. */
export function prepareApiRequest(path, opts, { cacheBustGet = false } = {}) {
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

/** Link a caller's signal to fetch and expose idempotent listener cleanup. */
export function linkAbortSignal(signal, source) {
  const controller = new AbortController();
  let onAbort = null;
  if (signal) {
    if (signal.aborted) {
      try { controller.abort(); }
      catch (error) { reportSwallow(error, source + '.abort'); }
    } else {
      onAbort = () => {
        try { controller.abort(); }
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
