import type { Request, Response, NextFunction } from 'express';
import { Unauthorized } from '../lib/errors.js';
import { getDb } from '../db/index.js';
import { users, authSessions } from '../db/schema.js';
import { authCacheGet, authCacheSet } from '../lib/authCache.js';
import { isMobileAccessToken } from '../services/auth.js';
import { verifyAgentKey, AGENT_KEY_RE } from '../services/agentKeys.js';
import { verifyOAuthAccessToken, OAUTH_ACCESS_TOKEN_RE } from '../services/oauthTokens.js';
import { ALL_SCOPES_SET } from './scopes.js';
import { eq } from 'drizzle-orm';

/* Browser sessions and mobile credentials deliberately use different token
 * grammars.  A refresh/capability token must never authenticate an API call
 * merely because it is present in the shared auth_sessions table. */
const BROWSER_SESSION_RE = /^[a-f0-9]{64}$/;
const BEARER_RE = /^Bearer ([^\s,]+)$/i;

type RequestCredential =
  | { token: string; source: 'bearer' | 'cookie' | 'agent_key' | 'oauth_token' }
  | null;

/**
 * Select one accepted credential from a request.
 *
 * Authorization, when supplied, deliberately takes precedence over a cookie:
 * this keeps a stale WebView cookie from silently authenticating a mobile
 * request whose bearer token has expired. Accepted Authorization grammars:
 *   - `ma.*` mobile access tokens → 'bearer'
 *   - `ak_<id>.<secret>` scoped agent keys → 'agent_key'
 *   - `at_…` OAuth 2.0 access tokens (Phase D) → 'oauth_token'
 * Opaque refresh and one-time capability tokens cannot be escalated into
 * API credentials.
 */
export function requestCredential(req: Request): RequestCredential {
  const authorization = req.headers.authorization;
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') return null;
    const match = BEARER_RE.exec(authorization.trim());
    if (!match) return null;
    if (isMobileAccessToken(match[1])) return { token: match[1], source: 'bearer' };
    const bearerCandidate = `Bearer ${match[1]}`;
    if (AGENT_KEY_RE.test(bearerCandidate)) {
      return { token: match[1], source: 'agent_key' };
    }
    if (OAUTH_ACCESS_TOKEN_RE.test(bearerCandidate)) {
      return { token: match[1], source: 'oauth_token' };
    }
    return null;
  }

  const sid = req.cookies?.sid;
  if (typeof sid !== 'string' || !BROWSER_SESSION_RE.test(sid)) return null;
  return { token: sid, source: 'cookie' };
}

/* P1-auth-lookup — this used to resolve the cookie with two sequential
 * round-trips (auth_sessions, then users). A session switch is two requests,
 * so that was four RTTs of pure auth before any session data moved. One INNER
 * JOIN returns the same user row — `select({ user: users })` yields exactly the
 * shape the two queries used to produce, so nothing downstream changes — and
 * lib/authCache.ts removes the remaining round-trip for the bursts a single
 * page produces. The cache never holds one-time capabilities and is invalidated
 * at every revocation site; see that module for the full contract. */
async function findAuthenticatedUser(token: string) {
  const now = Date.now();
  const cached = authCacheGet(token, now);
  if (cached) return cached;

  const db = getDb();
  const [row] = await db
    .select({ user: users, sessionExpiresAt: authSessions.expiresAt })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.token, token))
    .limit(1);

  if (!row || row.sessionExpiresAt < new Date()) return null;

  authCacheSet(token, row.user, row.sessionExpiresAt, now);
  return row.user;
}

/**
 * Resolve any accepted credential into (user, scopes). Session cookies and
 * mobile bearers authenticate the account owner and receive every scope;
 * agent keys receive exactly the scopes minted onto the key.
 */
async function resolveAuthContext(req: Request): Promise<boolean> {
  const credential = requestCredential(req);
  if (!credential) return false;

  if (credential.source === 'agent_key') {
    const verified = await verifyAgentKey(credential.token);
    if (!verified) return false;
    req.userId = verified.user.id;
    req.user = verified.user;
    req.authScopes = new Set(verified.scopes);
    req.authKind = 'agent_key';
    return true;
  }

  if (credential.source === 'oauth_token') {
    const verified = await verifyOAuthAccessToken(credential.token);
    if (!verified) return false;
    req.userId = verified.user.id;
    req.user = verified.user;
    req.authScopes = new Set(verified.scopes);
    req.authKind = 'oauth_token';
    return true;
  }

  const user = await findAuthenticatedUser(credential.token);
  if (!user) return false;
  req.userId = user.id;
  req.user = user;
  req.authScopes = new Set(ALL_SCOPES_SET);
  req.authKind = credential.source === 'bearer' ? 'mobile_bearer' : 'session';
  return true;
}

/**
 * Middleware that validates either the `sid` session cookie, a mobile
 * `Authorization: Bearer ma.*` access credential, or a scoped agent API key.
 *
 * On success, sets `req.userId`, `req.user`, `req.authScopes`, and
 * `req.authKind`. Refresh tokens are only accepted by the dedicated refresh
 * endpoint and cannot pass this middleware.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const ok = await resolveAuthContext(req);
    if (!ok) return next(new Unauthorized('Not signed in'));
    next();
  } catch (err) {
    console.error('[auth] session lookup failed:', err);
    return next(new Unauthorized('Authentication error'));
  }
}

/** Require the explicit, non-ambient mobile bearer credential used to mint a
 * one-time WebView hand-off. Browser cookies may authenticate normal API
 * routes, but must not mint a URL capability intended for native storage.
 * Agent keys are also refused here — minting mobile hand-off capabilities is
 * an owner-only operation performed from a first-party client. */
export async function requireMobileBearer(req: Request, _res: Response, next: NextFunction) {
  const credential = requestCredential(req);
  if (!credential || credential.source !== 'bearer') {
    return next(new Unauthorized('Mobile access token required'));
  }

  try {
    const user = await findAuthenticatedUser(credential.token);
    if (!user) return next(new Unauthorized('Session expired'));
    req.userId = user.id;
    req.user = user;
    req.authScopes = new Set(ALL_SCOPES_SET);
    req.authKind = 'mobile_bearer';
    next();
  } catch (err) {
    console.error('[auth] mobile session lookup failed:', err);
    return next(new Unauthorized('Authentication error'));
  }
}

/**
 * Optional auth — sets req.userId / req.user / req.authScopes for a valid
 * cookie, mobile bearer access token, or scoped agent key, but degrades
 * safely to anonymous otherwise.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    if (await resolveAuthContext(req)) return next();
  } catch (_) {
    // Optional authentication must never turn a public route into a 500.
  }

  req.userId = null;
  req.user = null;
  req.authScopes = undefined;
  req.authKind = undefined;
  next();
}
