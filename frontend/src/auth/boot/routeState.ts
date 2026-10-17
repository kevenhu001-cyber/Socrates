/** Which URL-only auth route this document booted as.
 *
 * `auth/boot/routes.js` clears the query with `history.replaceState()` before
 * it awaits the share/verify payload, so by the time later top-level code runs
 * (installAuthHooks → prewarmAuthCache) `location.search` no longer says which
 * route this is. Recording the kind here — inside the route handler, before
 * that rewrite — keeps the decision available to consumers that run later.
 *
 * Kept separate from routeSelector.ts because that module is deliberately
 * pure ("without browser effects") and is covered as such. */
import type { AuthUrlRouteKind } from './routeSelector.ts';

let bootedKind: AuthUrlRouteKind | null = null;

export function recordBootedRouteKind(kind: AuthUrlRouteKind): void {
  bootedKind = kind;
}

export function bootedRouteKind(): AuthUrlRouteKind | null {
  return bootedKind;
}
