import { apiFetch, makeApiError } from '../../util/api.js';
import { reportSwallow } from '../../util/reportSwallow.ts';

/** Read the optional <head> prefetch installed by index.html. */
export function readBootPreflight() {
  try { return window.__bootApi || null; }
  catch (_) { return null; }
}

/** Start CSRF warming immediately, even when a later URL route exits early. */
export function startCsrfBootstrap(preflight) {
  return (preflight && preflight.csrf)
    || fetch('/api/v2/auth/csrf-token', { credentials: 'include' })
      .catch((error) => reportSwallow(error, 'auth/boot.csrfPreflight'));
}

/** Convert the early raw fetch result into the apiFetch error contract. */
export function adoptPreflight(promise, label) {
  return Promise.resolve(promise).then((response) => {
    if (!response || response.failed) {
      throw makeApiError(0, '网络异常，请检查连接后重试', null, 'NETWORK', 0);
    }
    if (response.status === 401) {
      throw makeApiError(401, 'Unauthorized', null, 'UNAUTHORIZED', 0);
    }
    if (response.status < 200 || response.status >= 300) {
      throw makeApiError(response.status, 'request failed: ' + label, null, 'HTTP_' + response.status, 0);
    }
    return response.json;
  });
}

/** Start /me and public config requests together after URL-only routes. */
export function startAuthRequests(preflight) {
  let meRequest = preflight && preflight.me
    ? adoptPreflight(preflight.me, '/api/auth/me')
    : apiFetch('/api/auth/me', { _authEndpoint: true });
  meRequest = meRequest.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );

  const configRequest = preflight && preflight.config
    ? Promise.resolve(preflight.config).then((response) => (
      response && !response.failed && response.json ? response.json : {}
    ))
    : fetch('/api/v2/config', { credentials: 'include' })
      .then((response) => response.json())
      .catch(() => ({}));

  return { meRequest, configRequest };
}

export function shouldGateForInitialUnauthorized(initialMe, isInGraceWindow) {
  return !!(initialMe.error
    && initialMe.error.status === 401
    && !isInGraceWindow());
}

/** Retry transient /me failures without turning network outages into logout. */
export async function retryAuthMe(initialMe, options = {}) {
  const fetchMe = options.fetchMe || (() => apiFetch('/api/auth/me', { _authEndpoint: true }));
  const isInGraceWindow = options.isInGraceWindow || (() => window.isInAuthGraceWindow?.());
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let me;
      if (attempt === 1) {
        if (initialMe.error) throw initialMe.error;
        me = initialMe.value;
      } else {
        me = await fetchMe();
      }
      return { kind: 'resolved', me };
    } catch (error) {
      if (error && error.status === 401) {
        if (attempt < 3 && isInGraceWindow()) {
          await wait(500);
          continue;
        }
        return { kind: 'unauthorized' };
      }
      if (attempt < 3) await wait(500);
    }
  }
  return { kind: 'unavailable' };
}
