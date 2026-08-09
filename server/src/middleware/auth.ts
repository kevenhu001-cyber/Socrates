import type { Request, Response, NextFunction } from 'express';
import { Unauthorized } from '../lib/errors.js';
import { getDb } from '../db/index.js';
import { users, authSessions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyMobileAccessToken } from '../lib/mobileAuth.js';

function bearerToken(req: Request) {
  const value = req.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token || null;
}

async function loadUser(userId: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user || null;
}

/**
 * Middleware that validates the `sid` session cookie.
 *
 * On success, sets `req.userId` and `req.user` (the full user row).
 * On failure, throws Unauthorized — which the error middleware serialises.
 *
 * Route handlers can use `req.userId` to scope database queries.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const mobileToken = bearerToken(req);
  if (mobileToken) {
    try {
      const user = await verifyMobileAccessToken(mobileToken);
      if (!user) return next(new Unauthorized('Mobile access token expired'));
      req.userId = user.id;
      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  const sid = req.cookies?.sid;
  if (!sid) {
    return next(new Unauthorized('Not signed in'));
  }

  try {
    const db = getDb();

    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.token, sid))
      .limit(1);

    if (!session || session.expiresAt < new Date()) {
      return next(new Unauthorized('Session expired'));
    }

    // Fetch the user (could cache, but for MVP direct lookup is fine)
    const user = await loadUser(session.userId);

    if (!user) {
      return next(new Unauthorized('User not found'));
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    console.error('[auth] session lookup failed:', err);
    return next(new Unauthorized('Authentication error'));
  }
}

/**
 * Optional auth — sets req.userId / req.user if a valid sid cookie exists,
 * but does NOT fail if there's no session. Useful for endpoints that have
 * different behaviour for logged-in vs anonymous users.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const mobileToken = bearerToken(req);
  if (mobileToken) {
    try {
      const user = await verifyMobileAccessToken(mobileToken);
      req.userId = user?.id || null;
      req.user = user || null;
      return next();
    } catch {
      req.userId = null;
      req.user = null;
      return next();
    }
  }

  const sid = req.cookies?.sid;
  if (!sid) {
    req.userId = null;
    req.user = null;
    return next();
  }

  try {
    const db = getDb();

    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.token, sid))
      .limit(1);

    if (session && session.expiresAt >= new Date()) {
      const user = await loadUser(session.userId);
      if (user) {
        req.userId = user.id;
        req.user = user;
        return next();
      }
    }
  } catch (_) {
    // Silently degrade to unauthenticated
  }

  req.userId = null;
  req.user = null;
  next();
}
