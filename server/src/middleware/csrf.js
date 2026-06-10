import crypto from 'node:crypto';
import { Forbidden } from '../lib/errors.js';

/**
 * Returns cookie options for CSRF cookies.
 *
 * Domain is set in production so the cookie is shared across subdomains
 * (app.topodrive.top + topodrive.top). The `clearCsrfCookie` call before
 * setting a new token ensures no duplicate-cookie conflict.
 */
function getCsrfCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const base = {
    httpOnly: false,      // Must be readable by front-end JS
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',  // 'none' allows cross-subdomain in production
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days — match session cookie lifetime
  };
  if (isProd) {
    return { ...base, domain: '.topodrive.top' };
  }
  return base;
}

/**
 * Clear ALL variants of the `csrf` cookie (host-only and domain) to prevent
 * duplicate-cookie conflicts. Called before setting a new CSRF token and
 * during logout.
 */
export function clearCsrfCookie(res) {
  res.clearCookie('csrf', { path: '/' });
  if (process.env.NODE_ENV === 'production') {
    res.clearCookie('csrf', { path: '/', domain: '.topodrive.top' });
  }
}

/**
 * GET /api/auth/csrf-token — set a fresh CSRF cookie.
 * The front-end calls this on boot and on 403 retry.
 */
export function setCsrfToken(req, res) {
  clearCsrfCookie(res);
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf', token, getCsrfCookieOptions());
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
  // Compare against the *exact* path. Use baseUrl+path rather than
  // originalUrl.startsWith(...) so that paths like
  // `/api/auth/csrf-token-foo` are NOT treated as the csrf endpoint
  // and would still require a valid token.
  if (req.baseUrl === '/api/auth' && req.path === '/csrf-token') {
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
