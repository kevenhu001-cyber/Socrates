import { reportSwallow } from '../reportSwallow.ts';
import { selectAuthUrlRoute } from '../../auth/boot/routeSelector.ts';
import { bootedRouteKind } from '../../auth/boot/routeState.ts';

export interface AuthHooks {
  on401?: (detail: string) => void;
  isInGraceWindow?: () => boolean;
}

let onUnauthorized: ((detail: string) => void) | null = null;
let isInGraceWindow: () => boolean = () => false;

export function installAuthHooks({ on401, isInGraceWindow: graceWindowCheck }: AuthHooks): void {
  if (on401) onUnauthorized = on401;
  if (graceWindowCheck) isInGraceWindow = graceWindowCheck;
  /* P_ttfb-auth-prewarm — fire-and-forget /me on install so the
     server's per-token auth cache (lib/authCache.ts) is warm before
     the first chat send. The full /me response is dropped; the only
     side effect we want is the requireAuth → findAuthenticatedUser
     path populating the cache entry, so the first /api/chat/stream
     request lands on a cache hit instead of paying a DB JOIN for
     `auth_sessions ⋈ users`. Subsequent /me calls in the boot flow
     (auth/boot/requests.js) hit the warm cache and the response is
     identical. The prewarm is a single HEAD-style request and is
     intentionally NOT awaited — it is allowed to race with anything
     else that needs the auth state. */
  prewarmAuthCache();
}

/** Every URL-only route returns from authBoot before startAuthRequests, so
 * none of them runs the /me probe this prewarm exists to warm. A public share
 * reader is anonymous — spending a request on auth state the view can never
 * use is a wasted round trip, and the share boot path deliberately never
 * touches /api/auth/me.
 *
 * Prefer the route the boot path recorded: those handlers clear the query with
 * history.replaceState() before they await, so `location.search` is already
 * empty by the time this runs. Fall back to the live URL only when boot has
 * not classified the document yet. */
function runsNormalAuthProbe(): boolean {
  try {
    const recorded = bootedRouteKind();
    if (recorded) return recorded === 'continue';
    if (typeof location === 'undefined') return true;
    return selectAuthUrlRoute(new URLSearchParams(location.search), location.hostname).kind === 'continue';
  } catch (error) { reportSwallow(error, 'util/api.prewarmAuthCache.urlRoute'); return true; }
}

function prewarmAuthCache(): void {
  if (typeof fetch !== 'function') return;
  if (!runsNormalAuthProbe()) return;
  try {
    void fetch('/api/auth/me', { credentials: 'include', method: 'GET' })
      .catch((error) => { reportSwallow(error, 'util/api.prewarmAuthCache'); });
  } catch (error) { reportSwallow(error, 'util/api.prewarmAuthCache.invoke'); }
}

export function authExpiryIsSuppressed(): boolean {
  return isInGraceWindow();
}

export function notifyUnauthorized(source: string, method: string, path: string): void {
  try {
    if (onUnauthorized) onUnauthorized(source + ':' + method + ' ' + path);
  }
  catch (error) { reportSwallow(error, 'util/api.notifyUnauthorized'); }
}

/** Refresh CSRF state and yield once before the caller replays its request. */
export async function refreshCsrfToken(
  signal: AbortSignal | null | undefined,
  source: string,
): Promise<void> {
  const options: RequestInit = { credentials: 'include' };
  if (signal) options.signal = signal;
  try { await fetch('/api/v2/auth/csrf-token', options); }
  catch (error) { reportSwallow(error, source + '.csrfRefresh'); }
  await new Promise((resolve) => setTimeout(resolve, 0));
}
