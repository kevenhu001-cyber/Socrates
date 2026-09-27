/**
 * Per-token cache for the browser-session → user resolution that every
 * authenticated request performs.
 *
 * P1-auth-lookup — `requireAuth` ran on every API call and resolved the `sid`
 * cookie with two sequential round-trips (auth_sessions, then users). The
 * session switch is two requests — the detail fetch plus the list refresh — so
 * opening a conversation cost four RTTs of pure authentication before any
 * session data moved. This collapses that to one indexed JOIN, and this cache
 * removes the remaining round-trip for the bursts a single page produces
 * (open → list → send → save).
 *
 * The cache is deliberately conservative, because a stale entry here is an
 * authentication decision, not a display:
 *
 *   • one-time capabilities are NEVER cached — `mw.*` (WebView hand-off) and
 *     `mo.*` (OAuth exchange) rows are DELETEd by the very exchange that reads
 *     them, so a cached resolution would let a spent capability authenticate a
 *     second time;
 *   • an entry never outlives its own session's `expires_at`;
 *   • every revocation site in services/auth.ts calls `invalidateAuthCache`
 *     or `invalidateAuthCacheForUser` — the auth route layer does not depend
 *     on this module, so there is exactly one place to audit;
 *   • entries are capped, and the TTL is short enough that a missed
 *     invalidation cannot outlive 30 seconds.
 *
 * It lives in its own module rather than in middleware/auth.ts because
 * services/auth.ts has to call the invalidators, and middleware/auth.ts already
 * imports services/auth.ts — putting this there would close the cycle.
 */

import type { users } from '../db/schema.js';

/** Exactly the row `select().from(users)` used to produce, so nothing
 * downstream that reads `req.user` changes shape. */
export type AuthUserRow = typeof users.$inferSelect;

const _cache = new Map<string, { user: AuthUserRow; expiresAt: number }>();

/** Long enough to absorb a page's burst of API calls, short enough that a
 * revocation which somehow missed an invalidation cannot outlive it. */
export const AUTH_CACHE_TTL_MS = 30_000;
export const AUTH_CACHE_MAX_ENTRIES = 5_000;

/** Drop one cached resolution (the caller knows the exact token it revoked). */
export function invalidateAuthCache(token?: string | null): void {
  if (token) _cache.delete(token);
  else _cache.clear();
}

/** Drop every cached resolution for one user — for the revocation paths that
 * delete by `user_id` and do not enumerate the tokens they removed. */
export function invalidateAuthCacheForUser(userId?: string | null): void {
  if (!userId) return;
  for (const [token, entry] of _cache) {
    if (entry.user.id === userId) _cache.delete(token);
  }
}

/** One-time, single-use credentials. Always read-through to the database. */
const ONE_TIME_TOKEN_RE = /^(mw|mo)\./;

export function isOneTimeAuthToken(token: string): boolean {
  return ONE_TIME_TOKEN_RE.test(token);
}

export function authCacheGet(token: string, now: number): AuthUserRow | null {
  if (ONE_TIME_TOKEN_RE.test(token)) return null;
  const hit = _cache.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    _cache.delete(token);
    return null;
  }
  return hit.user;
}

export function authCacheSet(
  token: string,
  user: AuthUserRow,
  sessionExpiresAt: Date,
  now: number,
): void {
  if (ONE_TIME_TOKEN_RE.test(token)) return;
  /* Never outlive the credential itself. */
  const ttl = Math.min(AUTH_CACHE_TTL_MS, sessionExpiresAt.getTime() - now);
  if (ttl <= 0) return;
  if (_cache.size >= AUTH_CACHE_MAX_ENTRIES) {
    const oldest = _cache.keys().next();
    if (!oldest.done) _cache.delete(oldest.value);
  }
  _cache.set(token, { user, expiresAt: now + ttl });
}

/** Test seam — the module holds process-lifetime state. */
export function _resetAuthCache(): void {
  _cache.clear();
}
