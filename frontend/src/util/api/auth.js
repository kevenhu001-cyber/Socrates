import { reportSwallow } from '../reportSwallow.ts';

let onUnauthorized = null;
let isInGraceWindow = () => false;

export function installAuthHooks({ on401, isInGraceWindow: graceWindowCheck }) {
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

function prewarmAuthCache() {
  if (typeof fetch !== 'function') return;
  try {
    void fetch('/api/auth/me', { credentials: 'include', method: 'GET' })
      .catch((error) => { reportSwallow(error, 'util/api.prewarmAuthCache'); });
  } catch (error) { reportSwallow(error, 'util/api.prewarmAuthCache.invoke'); }
}

export function authExpiryIsSuppressed() {
  return isInGraceWindow();
}

export function notifyUnauthorized(source, method, path) {
  try {
    if (onUnauthorized) onUnauthorized(source + ':' + method + ' ' + path);
  }
  catch (error) { reportSwallow(error, 'util/api.notifyUnauthorized'); }
}

/** Refresh CSRF state and yield once before the caller replays its request. */
export async function refreshCsrfToken(signal, source) {
  const options = { credentials: 'include' };
  if (signal) options.signal = signal;
  try { await fetch('/api/v2/auth/csrf-token', options); }
  catch (error) { reportSwallow(error, source + '.csrfRefresh'); }
  await new Promise((resolve) => setTimeout(resolve, 0));
}
