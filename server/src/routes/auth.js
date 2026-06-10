import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { setCsrfToken } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import * as authService from '../services/auth.js';

const router = Router();

router.get('/csrf-token', setCsrfToken);

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, captchaToken, captchaAnswer } = req.body;
    const result = await authService.register(email, password, captchaToken, captchaAnswer);
    return res.json(result);
  } catch (err) { next(err); }
});

/* ─── Login ─── */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, captchaToken, captchaAnswer } = req.body;
    const result = await authService.login(email, password, captchaToken, captchaAnswer);
    res.cookie('sid', result.sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ user: result.user });
  } catch (err) { next(err); }
});

/* ─── Me (authenticated) ─── */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.userId);
    return res.json({ user });
  } catch (err) { next(err); }
});

/* ─── Logout ─── */
router.post('/logout', async (req, res, next) => {
  try {
    const sid = req.cookies?.sid;
    await authService.logout(sid);
    res.clearCookie('sid', { path: '/' });
    res.clearCookie('csrf', { path: '/' });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Verify email ─── */
router.get('/verify', async (req, res, next) => {
  try {
    const { token } = req.query;
    const result = await authService.verifyEmail(token);
    if (result && result.sid) {
      res.cookie('sid', result.sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    return res.json(result);
  } catch (err) { next(err); }
});

/* ─── Send login code ─── */
router.post('/send-code', async (req, res, next) => {
  try {
    const { email, captchaToken, captchaAnswer } = req.body;
    await authService.sendCode(email, captchaToken, captchaAnswer);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Guest login ─── */
router.post('/guest', async (_req, res, next) => {
  try {
    const result = await authService.loginAsGuest();
    res.cookie('sid', result.sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.status(201).json({ user: result.user });
  } catch (err) { next(err); }
});

/* ─── Login with code ─── */
router.post('/login-with-code', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await authService.loginWithCode(email, code);
    res.cookie('sid', result.sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ user: result.user });
  } catch (err) { next(err); }
});

/* ─── Forgot password ─── */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, captchaToken, captchaAnswer } = req.body;
    await authService.forgotPassword(email, captchaToken, captchaAnswer);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Reset info ─── */
router.get('/reset-info', async (req, res, next) => {
  try {
    const { token } = req.query;
    const info = await authService.getResetInfo(token);
    return res.json(info);
  } catch (err) { next(err); }
});

/* ─── Reset password ─── */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── Delete account ─── */
router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    await authService.deleteAccount(req.userId);
    res.clearCookie('sid', { path: '/' });
    res.clearCookie('csrf', { path: '/' });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─── OAuth GitHub start ─── */
router.get('/oauth/github/start', (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect('/?oauth_error=' + encodeURIComponent('github_not_configured'));
  }
  const returnTo = _req.query.return_to || '/';
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(process.env.GITHUB_CALLBACK_URL || '')}&state=${state}&scope=user:email`;
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
    try { returnTo = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8')).returnTo || '/'; }
    catch { /* ignore malformed state */ }
  }

  try {
    // 1) Exchange code for access_token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: String(code) }),
    });
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return res.redirect('/?oauth_error=' + encodeURIComponent('no_access_token'));
    }

    // 2) Fetch the user's profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Socrates/1.0' },
    });
    const ghUser = await userRes.json();
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

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(authSessions).values({ token, userId: user.id, expiresAt });

    res.cookie('sid', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.redirect(returnTo);
  } catch (err) {
    console.error('[auth] OAuth callback failed:', err);
    return res.redirect('/?oauth_error=' + encodeURIComponent('callback_failed'));
  }
});

export default router;
