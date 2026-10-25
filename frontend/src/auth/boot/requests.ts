import { apiFetch, makeApiError } from '../../util/api.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

/** The shape index.html's <head> prefetch resolves to. */
export interface BootPreflightResponse {
  failed?: boolean;
  status: number;
  json?: unknown;
}

export interface BootPreflight {
  csrf?: Promise<unknown>;
  me?: Promise<BootPreflightResponse>;
  config?: Promise<BootPreflightResponse>;
}

interface BootLegacyWindow extends Window {
  __bootApi?: BootPreflight | null;
  isInAuthGraceWindow?: () => boolean;
}

/** Read the optional <head> prefetch installed by index.html. */
export function readBootPreflight(): BootPreflight | null {
  try { return (window as BootLegacyWindow).__bootApi || null; }
  catch { return null; }
}

/** Start CSRF warming immediately, even when a later URL route exits early. */
export function startCsrfBootstrap(preflight: BootPreflight | null): Promise<unknown> {
  return (preflight && preflight.csrf)
    || fetch('/api/v2/auth/csrf-token', { credentials: 'include' })
      .catch((error) => reportSwallow(error, 'auth/boot.csrfPreflight'));
}

/** A promise that does not start its work until something awaits it. */
export interface LazyCsrfBootstrap extends PromiseLike<unknown> {
  catch(onRejected?: (reason: unknown) => unknown): Promise<unknown>;
  finally(onFinally?: () => void): Promise<unknown>;
}

/** Same warm-up, deferred until something actually awaits it.
 *
 * A public share reader is anonymous and no share path awaits the CSRF prime,
 * so priming it unconditionally spends a request the view can never use. The
 * normal boot, local-dev and email verification all await it, and start it on
 * first use; every await after that shares the same promise, so the request
 * still overlaps the rest of startup exactly as before. */
export function lazyCsrfBootstrap(preflight: BootPreflight | null): LazyCsrfBootstrap {
  let started: Promise<unknown> | null = null;
  const start = () => { started ||= startCsrfBootstrap(preflight); return started; };
  return {
    then(onFulfilled, onRejected) { return start().then(onFulfilled, onRejected); },
    catch(onRejected) { return start().catch(onRejected); },
    finally(onFinally) { return start().finally(onFinally); },
  };
}

/** Convert the early raw fetch result into the apiFetch error contract. */
export function adoptPreflight(promise: Promise<BootPreflightResponse>, label: string): Promise<unknown> {
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

/** Either the /me value or the error, so the retry loop can inspect both. */
export interface AuthMeResult {
  value?: unknown;
  error?: unknown;
}

export interface AuthRequests {
  meRequest: Promise<AuthMeResult>;
  configRequest: Promise<unknown>;
}

/** Start /me and public config requests together after URL-only routes. */
export function startAuthRequests(preflight: BootPreflight | null): AuthRequests {
  const meRequest: Promise<unknown> = preflight && preflight.me
    ? adoptPreflight(preflight.me, '/api/auth/me')
    : apiFetch('/api/auth/me', { _authEndpoint: true });
  const settled: Promise<AuthMeResult> = meRequest.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );

  const configRequest: Promise<unknown> = preflight && preflight.config
    ? Promise.resolve(preflight.config).then((response) => (
      response && !response.failed && response.json ? response.json : {}
    ))
    : fetch('/api/v2/config', { credentials: 'include' })
      .then((response) => response.json())
      .catch(() => ({}));

  return { meRequest: settled, configRequest };
}

export function shouldGateForInitialUnauthorized(initialMe: AuthMeResult, isInGraceWindow: () => boolean): boolean {
  const error = initialMe.error as { status?: number } | null | undefined;
  return !!(error
    && error.status === 401
    && !isInGraceWindow());
}

export type AuthMeOutcome =
  | { kind: 'resolved'; me: unknown }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' };

export interface RetryAuthMeOptions {
  fetchMe?: () => Promise<unknown>;
  isInGraceWindow?: () => boolean | undefined;
  wait?: (milliseconds: number) => Promise<unknown>;
}

/** Retry transient /me failures without turning network outages into logout. */
export async function retryAuthMe(initialMe: AuthMeResult, options: RetryAuthMeOptions = {}): Promise<AuthMeOutcome> {
  const fetchMe = options.fetchMe || (() => apiFetch('/api/auth/me', { _authEndpoint: true }));
  const isInGraceWindow = options.isInGraceWindow
    || (() => (window as BootLegacyWindow).isInAuthGraceWindow?.());
  const wait = options.wait || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let me: unknown;
      if (attempt === 1) {
        if (initialMe.error) throw initialMe.error;
        me = initialMe.value;
      } else {
        me = await fetchMe();
      }
      return { kind: 'resolved', me };
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (error && status === 401) {
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
