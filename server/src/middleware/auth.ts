import type { Request, Response, NextFunction } from 'express';
import { Unauthorized } from '../lib/errors.js';
import { getDb } from '../db/index.js';
import { users, authSessions } from '../db/schema.js';
import { isMobileAccessToken } from '../services/auth.js';
import { eq } from 'drizzle-orm';

/* Browser sessions and mobile credentials deliberately use different token
 * grammars.  A refresh/capability token must never authenticate an API call
 * merely because it is present in the shared auth_sessions table. */
const BROWSER_SESSION_RE = /^[a-f0-9]{64}$/;
const BEARER_RE = /^Bearer ([^\s,]+)$/i;

type RequestCredential = { token: string; source: 'bearer' | 'cookie' } | null;

/**
 * Select one accepted credential from a request.
 *
 * Authorization, when supplied, deliberately takes precedence over a cookie:
 * this keeps a stale WebView cookie from silently authenticating a mobile
 * request whose bearer token has expired.  Only `ma.*` access tokens are
 * accepted in Authorization; opaque refresh and one-time capability tokens
 * cannot be escalated into API credentials.
 */
export function requestCredential(req: Request): RequestCredential {
  const authorization = req.headers.authorization;
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') return null;
    const match = BEARER_RE.exec(authorization.trim());
    if (!match || !isMobileAccessToken(match[1])) return null;
    return { token: match[1], source: 'bearer' };
  }

  const sid = req.cookies?.sid;
  if (typeof sid !== 'string' || !BROWSER_SESSION_RE.test(sid)) return null;
  return { token: sid, source: 'cookie' };
}

async function findAuthenticatedUser(token: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.token, token))
    .limit(1);

  if (!session || session.expiresAt < new Date()) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  return user ?? null;
}

/**
 * Middleware that validates either the `sid` session cookie or a mobile
 * `Authorization: Bearer ma.*` access credential.
 *
 * On success, sets `req.userId` and `req.user` (the full user row).  Refresh
 * tokens are only accepted by the dedicated refresh endpoint and cannot pass
 * this middleware.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const credential = requestCredential(req);
  if (!credential) return next(new Unauthorized('Not signed in'));

  try {
    const user = await findAuthenticatedUser(credential.token);
    if (!user) return next(new Unauthorized('Session expired'));
    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    console.error('[auth] session lookup failed:', err);
    return next(new Unauthorized('Authentication error'));
  }
}

/** Require the explicit, non-ambient mobile bearer credential used to mint a
 * one-time WebView hand-off. Browser cookies may authenticate normal API
 * routes, but must not mint a URL capability intended for native storage. */
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
    next();
  } catch (err) {
    console.error('[auth] mobile session lookup failed:', err);
    return next(new Unauthorized('Authentication error'));
  }
}

/**
 * Optional auth — sets req.userId / req.user for a valid cookie or mobile
 * bearer access token, but degrades safely to anonymous otherwise.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const credential = requestCredential(req);
  if (!credential) {
    req.userId = null;
    req.user = null;
    return next();
  }

  try {
    const user = await findAuthenticatedUser(credential.token);
    if (user) {
      req.userId = user.id;
      req.user = user;
      return next();
    }
  } catch (_) {
    // Optional authentication must never turn a public route into a 500.
  }

  req.userId = null;
  req.user = null;
  next();
}
