import crypto from 'node:crypto';
import { Forbidden } from '../lib/errors.js';
import { shouldUseSharedDomain, SHARED_COOKIE_DOMAIN } from '../lib/cookieEnv.js';

/**
 * Returns cookie options for CSRF cookies.
 *
 * Domain is set when the request actually targets a topodrive.top host
 * so the cookie is shared across subdomains (app.topodrive.top +
 * topodrive.top). The `clearCsrfCookie` call before setting a new token
 * ensures no duplicate-cookie conflict.
 */
function getCsrfCookieOptions(req) {
  const isProd = shouldUseSharedDomain(req);
  const base = {
    httpOnly: false,      // Must be readable by front-end JS
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',  // 'none' allows cross-subdomain in production
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days — match session cookie lifetime
  };
  if (isProd) {
    return { ...base, domain: SHARED_COOKIE_DOMAIN };
  }
  return base;
}

/**
 * Clear ALL variants of the `csrf` cookie (host-only and domain) to prevent
 * duplicate-cookie conflicts. Called before setting a new CSRF token and
 * during logout.
 */
export function clearCsrfCookie(res, req) {
  res.clearCookie('csrf', { path: '/' });
  if (shouldUseSharedDomain(req)) {
    res.clearCookie('csrf', { path: '/', domain: SHARED_COOKIE_DOMAIN });
  }
}

/**
 * Set a fresh CSRF cookie on the response (without sending a response body).
 * Used by login/register endpoints that need to seed the CSRF cookie
 * alongside the session cookie so the first state-changing request
 * from the freshly signed-in SPA doesn't get a 403 CSRF error.
 */
export function setCsrfCookie(res, req) {
  clearCsrfCookie(res, req);
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf', token, getCsrfCookieOptions(req));
}

/**
 * GET /api/auth/csrf-token — set a fresh CSRF cookie.
 * The front-end calls this on boot and on 403 retry.
 */
export function setCsrfToken(req, res) {
  setCsrfCookie(res, req);
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
  const sidCookie = req.cookies?.sid;

  // Reject the dangerous case explicitly: an authenticated request
  // (sid cookie present) without a matching CSRF token pair is exactly
  // the cross-site forgery scenario the double-submit pattern exists to
  // prevent. Without this check, the original code would pass through
  // any state-changing request that happened to lack BOTH the header
  // and the csrf cookie — including forged requests from a malicious
  // origin that triggered a top-level navigation but never received
  // the csrf cookie (because it's set on .topodrive.top).
  if (sidCookie && (!headerToken || !cookieToken || headerToken !== cookieToken)) {
    return next(new Forbidden('CSRF_TOKEN_MISMATCH', 'CSRF token required for authenticated requests'));
  }

  // Unauthenticated requests (no sid cookie) and preflight-style probes
  // pass through to whatever auth middleware is mounted on the route.
  if (!headerToken && !cookieToken) {
    return next();
  }

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return next(new Forbidden('CSRF_TOKEN_MISMATCH', 'CSRF token mismatch'));
  }

  next();
}
