import crypto from 'node:crypto';
import { Forbidden } from '../lib/errors.js';

const COOKIE_OPTIONS = {
  httpOnly: false,      // Must be readable by front-end JS
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days — match session cookie lifetime
};

/**
 * GET /api/auth/csrf-token — set a fresh CSRF cookie.
 * The front-end calls this on boot and on 403 retry.
 */
export function setCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf', token, COOKIE_OPTIONS);
  return res.json({ ok: true });
}

/**
 * Middleware that validates the X-CSRF-Token header against the csrf cookie
 * on state-changing requests (POST, PUT, PATCH, DELETE).
 *
 * This is the "double-submit cookie" pattern:
 *   1. Server sets csrf cookie (readable by JS)
 *   2. Front-end reads cookie and sends same value as X-CSRF-Token header
 *   3. Server compares header === cookie value
 *
 * Safe methods (GET, HEAD, OPTIONS) are skipped.
 */
export function csrfProtection(req, res, next) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for the CSRF token endpoint itself (chicken-and-egg).
  // Use originalUrl because req.path is relative to the mount point
  // (so under /api/auth it's just /csrf-token, not the full path).
  if (req.originalUrl.startsWith('/api/auth/csrf-token')) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.csrf;

  // If the request doesn't carry a CSRF token AND doesn't have a session
  // cookie, it may be a preflight or unauthenticated request — let auth
  // middleware handle it.
  if (!headerToken && !cookieToken) {
    return next();
  }

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return next(new Forbidden('CSRF_TOKEN_MISMATCH', 'CSRF token mismatch'));
  }

  next();
}
