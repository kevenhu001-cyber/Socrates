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

/* P_mcp-discovery — Model Context Protocol clients are not browsers. They
 * speak JSON-RPC 2.0 over Streamable HTTP, they authenticate out of band
 * (or not at all on the discovery surface we expose here), and they have
 * no business carrying an ambient sid cookie. Skip the double-submit
 * check so a stray csrf cookie cannot turn their POST into a 403. */
const MCP_PATHS = new Set([
  '/api/mcp',
  '/api/mcp/',
  '/api/mcp/docs',
  '/api/mcp/docs/',
]);

/* P_oauth-token-endpoints — RFC 6749 §4.1.3 token / §2.1 revoke requests
 * authenticate with client_secret (Basic or POST body) and carry no ambient
 * sid cookie. The double-submit check would only see a stale browser csrf
 * cookie and 403 a perfectly authenticated non-browser client.
 *
 * The consent decision (POST /api/oauth/authorize) rides the sid cookie, so
 * it is ALSO listed here — but it does not rely on the blanket both-missing
 * passthrough: routes/oauth.ts re-enforces the double-submit itself by
 * comparing the form's hidden csrf_token field against the cookie, because a
 * plain HTML form cannot send X-CSRF-Token headers. Removing the route-level
 * check while keeping this exemption would drop CSRF protection entirely.
 * req.path at app level is the full path; both trailing-slash variants are
 * listed because Express keeps the slash when the router base matches with
 * one. */
const OAUTH_TOKEN_PATHS = new Set([
  '/api/oauth/authorize',
  '/api/oauth/authorize/',
  '/api/oauth/token',
  '/api/oauth/token/',
  '/api/oauth/revoke',
  '/api/oauth/revoke/',
]);

/* P_admin-auth — the operator login/logout endpoints authenticate with
 * an explicit body credential (ADMIN_PASSWORD) and never read an
 * ambient browser cookie as authority, so the double-submit check
 * adds no protection here — it only 403s a legitimate operator whose
 * browser happens to carry a stale `csrf` cookie from normal app use
 * (cookie-only partial pair). The admin CONFIG routes
 * (/api/system-models, /api/embedding-config) ride the admin httpOnly
 * session cookie and intentionally stay behind the check. */
const ADMIN_AUTH_PATHS = new Set([
  '/api/admin-auth/login',
  '/api/admin-auth/login/',
  '/api/admin-auth/logout',
  '/api/admin-auth/logout/',
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
 * Mint a fresh double-submit pair AND return the new token so server-rendered
 * no-JS forms (the OAuth consent screen) can embed it as a hidden field while
 * the matching half lands in the cookie. Unlike setCsrfCookie, the caller
 * learns the value — res.cookie() alone never populates req.cookies.
 */
export function rotateCsrfToken(res: Response, req: Request): string {
  const token = crypto.randomBytes(32).toString('hex');
  clearCsrfCookie(res, req);
  res.cookie('csrf', token, getCsrfCookieOptions(req));
  return token;
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

  if (MCP_PATHS.has(req.path)) return next();

  if (OAUTH_TOKEN_PATHS.has(req.path)) return next();

  if (ADMIN_AUTH_PATHS.has(req.path)) return next();

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
