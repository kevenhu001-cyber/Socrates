import crypto from 'node:crypto';
import type { Request, Response, NextFunction, CookieOptions } from 'express';
import { Forbidden } from '../lib/errors.js';
import { shouldUseSharedDomain, SHARED_COOKIE_DOMAIN } from '../lib/cookieEnv.js';
import { isMobileAccessToken } from '../services/auth.js';

/* These routes authenticate with an explicit body credential and never read
 * the ambient browser sid. Exempting them avoids a stale WebView csrf cookie
 * blocking React Native refresh/login requests, without weakening a
 * cookie-authenticated browser action. */
const MOBILE_CREDENTIAL_PATHS = new Set([
  '/api/auth/mobile/login',
  '/api/auth/mobile/refresh',
  '/api/auth/mobile/login-with-code',
  '/api/auth/mobile/logout',
  '/api/auth/mobile/oauth/exchange',
]);

function timingSafeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Returns cookie options for CSRF cookies.
 *
 * Domain is set when the request actually targets a topodrive.top host
 * so the cookie is shared across subdomains (app.topodrive.top +
 * topodrive.top). The `clearCsrfCookie` call before setting a new token
 * ensures no duplicate-cookie conflict.
 */
function getCsrfCookieOptions(req: Request): CookieOptions {
  const isProd = shouldUseSharedDomain(req);
  const base: CookieOptions = {
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
export function clearCsrfCookie(res: Response, req: Request) {
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
export function setCsrfCookie(res: Response, req: Request) {
  clearCsrfCookie(res, req);
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf', token, getCsrfCookieOptions(req));
}

/**
 * GET /api/auth/csrf-token — set a fresh CSRF cookie.
 * The front-end calls this on boot and on 403 retry.
 */
export function setCsrfToken(req: Request, res: Response) {
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
 *
 * SECURITY MODEL — IMPORTANT (do not change without auditing):
 *
 *   The double-submit check is the SECOND line of defence. The PRIMARY
 *   defence against CSRF is the `sid` session cookie's attributes —
 *   `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'`
 *   (set in routes/auth.js#getSessionCookieOptions). SameSite=Lax
 *   blocks cross-origin POSTs from carrying the sid cookie, so an
 *   attacker cannot ride on a victim's authenticated session from a
 *   malicious origin. Verify those settings before changing any
 *   branch of this middleware.
 *
 *   Within that envelope, the rules are:
 *
 *   (a) BOTH header and cookie present → require them to match
 *       (double-submit cookie pattern).
 *
 *   (b) Both missing → pass through. Either anonymous (downstream
 *       `requireAuth` rejects protected routes) OR privacy features
 *       cleared the CSRF cookie while leaving the session intact
 *       (legitimate user path). The Primary defence above still
 *       blocks cross-origin attacks even in the second case, since
 *       an attacker would also need to obtain the sid cookie.
 *
 *   (c) Exactly one of header/cookie present → REJECT. A clean
 *       browser always has both (typical flow) or neither (privacy-
 *       cleared). Seeing exactly one half on its own is anomalous.
 *       The header comes from JavaScript on the same origin (the
 *       csrf cookie is not HttpOnly, so JS can read it); a header
 *       without a matching cookie implies an attacker read the
 *       cookie value via XSS or browser extension and tried to
 *       replay it cross-origin. The cookie-without-header case can
 *       only arise if an attacker injects a csrf cookie via Set-
 *       Cookie — which a same-origin XSS could already leverage for
 *       much worse, so we treat that as a forced sign to investigate.
 *
 *   (d) A syntactically valid `Authorization: Bearer ma.*` mobile access
 *       credential bypasses this check. Bearer values are explicitly supplied
 *       by the caller rather than ambient browser credentials, so CSRF does
 *       not apply. Refresh and one-time capability tokens do not qualify.
 *
 *   (e) Public mobile credential-exchange routes are also skipped. They do
 *       not use the ambient browser sid; their supplied password, email code,
 *       refresh token, or OAuth capability is the credential instead.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for the CSRF token endpoint itself (chicken-and-egg).
  if (req.baseUrl === '/api/auth' && req.path === '/csrf-token') {
    return next();
  }

  // Skip for public status API (status.topodrive.top subscribe/confirm).
  // This middleware runs at the app level, so the path is the full
  // request path (/api/status/subscribe), not the router-relative one.
  if (req.path === '/api/status/subscribe' || req.path === '/api/status/confirm') {
    return next();
  }

  if (MOBILE_CREDENTIAL_PATHS.has(req.path)) return next();

  // A React Native request may coexist with an old WebView csrf cookie. Its
  // explicit access bearer remains safe without a double-submit header; do
  // not let a stale ambient cookie turn that valid request into a 403.
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const bearer = /^Bearer ([^\s,]+)$/i.exec(authorization.trim());
    if (bearer && isMobileAccessToken(bearer[1])) return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.csrf;

  // Path (a) — both present, must match.
  if (headerToken && cookieToken) {
    if (!timingSafeEqual(headerToken, cookieToken)) {
      return next(new Forbidden('CSRF_TOKEN_MISMATCH', 'CSRF token mismatch'));
    }
    return next();
  }

  // Path (b) — both missing. Pass through; downstream auth/permissions
  // gates handle rejection. Covered above by the SECURITY MODEL.
  if (!headerToken && !cookieToken) {
    return next();
  }

  // Path (c) — exactly one present without the other. Reject as a
  // likely forgery: a clean browser has both (typical) or neither
  // (when privacy features stripped the csrf cookie). Surfacing a
  // 403 lets us observe this in logs/metrics and avoids letting an
  // attacker ride on whichever token they happened to obtain.
  const which = headerToken ? 'header-only' : 'cookie-only';
  return next(new Forbidden(
    'CSRF_TOKEN_PARTIAL',
    `Partial CSRF token pair (${which}); refusing as a likely forgery`,
  ));
}
