/*
 * Most mobile API requests may transparently rotate an expired access token.
 * Credential-issuing endpoints are intentionally excluded: retrying a failed
 * sign-in, code exchange, or refresh request with a stale existing token is
 * surprising and can hide the real error.  The WebView hand-off is the one
 * exception because it explicitly requires the short-lived access bearer.
 */
const MOBILE_AUTH_PREFIX = '/auth/mobile/';
const MOBILE_BEARER_ENDPOINTS = new Set([
  '/auth/mobile/web-session',
]);

export function shouldRefreshAfterUnauthorized(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return !pathname.startsWith(MOBILE_AUTH_PREFIX) || MOBILE_BEARER_ENDPOINTS.has(pathname);
}
