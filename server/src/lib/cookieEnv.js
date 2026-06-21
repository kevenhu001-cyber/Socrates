/**
 * Shared helpers for cookie configuration.
 *
 * The cookie's `domain` attribute should only be set when the request is
 * actually going to (or proxied from) a topodrive.top host. If the
 * browser sees `Domain=.topodrive.top` on a request originating from
 * localhost or 127.0.0.1, it silently rejects the cookie — the user can
 * never authenticate, even though the API call itself returned 200/201.
 *
 * The previous implementation keyed off `NODE_ENV === 'production'`,
 * but a single .env file is shared between dev (`vite dev` → proxied to
 * the API) and the live deployment. The server is therefore running
 * with `NODE_ENV=production` even when accessed on `127.0.0.1`, which
 * means *every* dev-mode cookie gets a domain the browser refuses.
 *
 * `shouldUseSharedDomain(req)` inspects the actual `Host` header so
 * the cookie configuration follows the request, not the env.
 */

/** Hosts that should get the shared `.topodrive.top` cookie domain. */
const SHARED_DOMAIN_HOSTS = new Set([
  'app.topodrive.top',
  'topodrive.top',
  'www.topodrive.top',
]);

/** The shared cookie domain. Exported for tests + clearCookie symmetry. */
export const SHARED_COOKIE_DOMAIN = '.topodrive.top';

/**
 * Decide whether the current request should receive the
 * `.topodrive.top` cookie domain. Returns true ONLY for actual
 * production hosts; localhost / 127.0.0.1 / LAN IPs return false
 * so the browser will accept the cookie.
 */
export function shouldUseSharedDomain(req) {
  const host = (req?.headers?.host || '').toLowerCase().split(':')[0];
  return SHARED_DOMAIN_HOSTS.has(host);
}