import { Router } from 'express';
import type { Request, Response, CookieOptions } from 'express';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { setCsrfToken, setCsrfCookie, clearCsrfCookie } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, codeLoginLimiter, resetLimiter } from '../middleware/rateLimit.js';
import * as authService from '../services/auth.js';
import { audit, recordAudit } from '../middleware/audit.js';
import { shouldUseSharedDomain, SHARED_COOKIE_DOMAIN } from '../lib/cookieEnv.js';
import { generateSessionToken } from '../lib/crypto.js';

/* HMAC key for signing OAuth state parameters — derived from
   SESSION_SECRET so it stays consistent across restarts without
   introducing a separate env var. */
const OAUTH_STATE_KEY = process.env.SESSION_SECRET || 'dev-secret';
function signOAuthState(payload: unknown) {
  const nonce = randomBytes(16).toString('hex');
  const full = { ...(typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}), nonce };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = createHmac('sha256', OAUTH_STATE_KEY).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}
function verifyOAuthState(state: unknown): { returnTo?: string; nonce?: string } | null {
  if (typeof state !== 'string') return null;
  const dot = state.lastIndexOf('.');
  if (dot < 0) return null;
  const encoded = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', OAUTH_STATE_KEY).update(encoded).digest('base64url');
  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expected.length) return null;
  const valid = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch { return null; }
}

const router = Router();

/**
 * Returns cookie options for session cookies.
 *
 * We set `domain: '.topodrive.top'` in production so the cookie is shared
 * across *.topodrive.top subdomains — the SPA (app.topodrive.top) and the
 * marketing site (topodrive.top) both need to read the session for pages
 * like /account and /profile.
 *
 * SameSite stays at `lax` (not `strict`) because OAuth callbacks arrive as
 * cross-site top-level navigations (github.com → app.topodrive.top/.../callback)
 * and would not carry the session cookie under `strict`. Combined with the
 * cookie's HttpOnly flag and the CSRF double-submit middleware, `lax` is
 * the strongest setting that still allows the OAuth flow to function.
 *
 * The potential conflict with a host-only cookie is handled by always
 * calling `clearSidCookie(res)` BEFORE setting a new one, which deletes
 * BOTH the host-only and domain variants. This ensures there is never
 * more than one `sid` cookie in the browser at any time.
 */
function getSessionCookieOptions(req: Request): CookieOptions {
  const isProd = shouldUseSharedDomain(req);
  const base: CookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
  if (isProd) {
    return { ...base, domain: SHARED_COOKIE_DOMAIN };
  }
  return base;
}

/**
 * Clear ALL variants of the `sid` cookie (host-only and domain) so there's
 * never a duplicate-cookie conflict. Browser cookie-parser uses the first
 * value when multiple cookies with the same name exist.
 */
function clearSidCookie(res: Response, req: Request) {
  res.clearCookie('sid', { path: '/' });
  // Clear the domain variant from previous code versions that used
  // `domain: '.topodrive.top'` — it may still persist in user browsers.
  if (shouldUseSharedDomain(req)) {
    res.clearCookie('sid', { path: '/', domain: SHARED_COOKIE_DOMAIN });
  }
}

router.get('/csrf-token', setCsrfToken);

router.post('/register', authLimiter, audit('register'), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.register(email, password);
    return res.json(result);
  } catch (err) { next(err); }
});

/* ─── Resend verification email (no password required) ─── */
router.post('/resend-verification', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await authService.resendVerification(email);
    return res.json(result);
  } catch (err) { next(err); }
});

/* ─── Login ─── */
router.post('/login', authLimiter, audit('login', (req) => ({ email: req.body?.email })), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    // Clear any stale cookie variants first to avoid duplicate-cookie conflicts
    clearSidCookie(res, req);
    res.cookie('sid', result.sid, getSessionCookieOptions(req));
    // Seed the CSRF cookie so the first state-changing request after login
    // doesn't fail with "CSRF token required".
    setCsrfCookie(res, req);
    return res.json({ user: result.user });
  } catch (err) { next(err); }
});

/* ─── Me (authenticated) ─── */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.userId!);
    return res.json({ user });
  } catch (err) { next(err); }
});

/* ─── Logout ─── */
router.post('/logout', audit('logout'), async (req, res, next) => {
  try {
    const sid = req.cookies?.sid;
    await authService.logout(sid);
    // Clear ALL cookie variants so there's no stale state in the browser
    clearSidCookie(res, req);
    clearCsrfCookie(res, req);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Verify email ─── */
router.get('/verify', async (req, res, next) => {
  try {
    const { token } = req.query;
    const result = await authService.verifyEmail(token as string);
    if (result && result.sid) {
      clearSidCookie(res, req);
      res.cookie('sid', result.sid, getSessionCookieOptions(req));
      setCsrfCookie(res, req);
    }
    return res.json(result);
  } catch (err) { next(err); }
});

/* ─── Send login code ─── */
router.post('/send-code', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    await authService.sendCode(email);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Login with code ─── */
router.post('/login-with-code', codeLoginLimiter, async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await authService.loginWithCode(email, code);
    clearSidCookie(res, req);
    res.cookie('sid', result.sid, getSessionCookieOptions(req));
    setCsrfCookie(res, req);
    return res.json({ user: result.user });
  } catch (err) { next(err); }
});

/* ─── Forgot password ─── */
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Reset info ─── */
router.get('/reset-info', async (req, res, next) => {
  try {
    const { token } = req.query;
    const info = await authService.getResetInfo(token as string);
    return res.json(info);
  } catch (err) { next(err); }
});

/* ─── Reset password ─── */
router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Change password (authenticated) ─── */
router.post('/password', requireAuth, authLimiter, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    // Pass the caller's sid so the service can keep THIS session
    // alive while invalidating every other device/browser for the
    // user. If the sid is missing for any reason we drop them all.
    await authService.changePassword(req.userId!, oldPassword, newPassword, req.cookies?.sid);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Delete account ─── */
router.delete('/account', requireAuth, authLimiter, async (req, res, next) => {
  try {
    await authService.deleteAccount(req.userId!, req.user?.email);
    clearSidCookie(res, req);
    clearCsrfCookie(res, req);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── OAuth GitHub start ─── */
/* P_oauth-returnTo-strict-whitelist — M5 audit fix. The previous
 * safeReturnTo accepted any same-origin path. That still allows
 * a crafted OAuth flow to bounce the user into sensitive internal
 * routes (e.g. `/api/account/export`, `/oauth/github/start` again,
 * `/api/auth/logout` as a forced logout, etc). Restrict the
 * redirect target to a small allow-list of SPA-facing prefixes
 * the front-end actually uses. Anything else falls back to '/'. */
const RETURN_TO_ALLOWLIST = [
  '/',
  '/app',
  '/chat',
  '/projects',
  '/shares',
  '/settings',
  '/exam',
  '/tutor',
  '/account',
];
function safeReturnTo(input: unknown) {
  if (typeof input !== 'string') return '/';
  if (input.length > 512) return '/';
  // Reject protocol-relative / backslash / absolute / non-path.
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//') || input.startsWith('/\\')) return '/';
  // Reject any path that contains a backslash anywhere (some
  // browsers interpret `\` as `/` in URL parsing, so this is a
  // common bypass for naive `startsWith('/')` checks).
  if (input.includes('\\')) return '/';
  // Reject control characters and CR/LF (header injection guard).
  if (/[\x00-\x1f]/.test(input)) return '/';
  // Strip trailing slash and `?...` fragment for prefix matching,
  // but keep the original for redirect.
  const [pathOnly] = input.split('?');
  const [pathNoHash] = pathOnly.split('#');
  const norm = pathNoHash.length > 1 && pathNoHash.endsWith('/')
    ? pathNoHash.slice(0, -1)
    : pathNoHash;
  // Allow exact match for '/' (home) and prefix match for the rest.
  for (const allowed of RETURN_TO_ALLOWLIST) {
    if (norm === allowed) return input;
    if (allowed !== '/' && norm.startsWith(allowed + '/')) return input;
  }
  return '/';
}

router.get('/oauth/github/start', (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect('/?oauth_error=' + encodeURIComponent('github_not_configured'));
  }
  const cbUrl = process.env.GITHUB_CALLBACK_URL || '';
  const returnTo = safeReturnTo(_req.query.return_to);
  const state = signOAuthState({ returnTo });
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(cbUrl)}&state=${state}&scope=user:email`;
  return res.redirect(url);
});

/* ─── OAuth GitHub callback ───
 * GitHub redirects the browser here after the user authorises the app.
 * We exchange the `code` for an access token, fetch the user's primary
 * email, find-or-create the matching user, and sign them in.
 */
router.get('/oauth/github/callback', async (req, res, next) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect('/?oauth_error=' + encodeURIComponent(String(error)));
  }
  if (!code) {
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'Missing code' });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(501).json({ code: 'NOT_CONFIGURED', message: 'GitHub OAuth is not configured' });
  }

  let returnTo = '/';
  if (state) {
    const parsed = verifyOAuthState(state);
    if (parsed && parsed.returnTo) returnTo = safeReturnTo(parsed.returnTo);
  }

  try {
    // 1) Exchange code for access_token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: String(code) }),
    });
    const tokenJson = await tokenRes.json() as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return res.redirect('/?oauth_error=' + encodeURIComponent('no_access_token'));
    }

    // 2) Fetch the user's profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Socrates/1.0' },
    });
    const ghUser = await userRes.json() as { email?: string | null; name?: string | null; login?: string | null };
    let email = ghUser.email;
    if (!email) {
      // 3) Fall back to the primary verified email
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Socrates/1.0' },
      });
      const emails = await emailsRes.json();
      const primary = Array.isArray(emails) ? emails.find(e => e.primary && e.verified) : null;
      email = primary?.email;
    }
    if (!email) {
      return res.redirect('/?oauth_error=' + encodeURIComponent('no_email'));
    }
    const normalizedEmail = email.toLowerCase().trim();

    // 4) Find or create the user, then start a session
    const { getDb } = await import('../db/index.js');
    const { users, authSessions } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const db = getDb();
    let [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (!user) {
      const randomPassHash = await (await import('../lib/crypto.js')).hashPassword(
        randomBytes(32).toString('hex')
      );
      [user] = await db.insert(users).values({
        email: normalizedEmail,
        passwordHash: randomPassHash,
        displayName: ghUser.name || ghUser.login || null,
        verifiedAt: new Date(),
      }).returning();
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(authSessions).values({ token, userId: user.id, expiresAt });

    clearSidCookie(res, req);
    res.cookie('sid', token, getSessionCookieOptions(req));
    return res.redirect(returnTo);
  } catch (err) {
    console.error('[auth] OAuth callback failed:', err);
    return res.redirect('/?oauth_error=' + encodeURIComponent('callback_failed'));
  }
});

export default router;
