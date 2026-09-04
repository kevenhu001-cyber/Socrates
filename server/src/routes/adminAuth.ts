/**
 * /api/admin-auth — independent password login for the /admin
 * operator console.
 *
 * POST /login  { password }  → { token, expiresAt }
 * POST /logout                → { ok: true }
 * GET  /status                → { configured: boolean } (no auth needed;
 *                               lets the login form tell the operator
 *                               whether ADMIN_PASSWORD is set at all)
 *
 * Rate limiting: loginLimiter (same budget the user login uses) so a
 * brute force on the admin password shares the same 10/15min budget
 * as a brute force on a user password.
 *
 * The token is returned in the JSON body and also set as an httpOnly
 * cookie — the SPA keeps it in memory (module-scoped variable), and
 * the cookie covers a reload of /admin without a re-login.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  verifyAdminPassword,
  adminPasswordConfigured,
  issueAdminSessionToken,
  verifyAdminSessionToken,
  ADMIN_SESSION_TTL_MS,
} from '../services/adminAuth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { BadRequest } from '../lib/errors.js';

const router = Router();

const ADMIN_COOKIE = 'socrates_admin_session';

const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

/* GET /status — public; tells the login form whether to render. */
router.get('/status', (_req, res) => {
  return res.json({ configured: adminPasswordConfigured() });
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    if (!adminPasswordConfigured()) {
      return res.status(503).json({
        error: 'admin_not_configured',
        message: 'ADMIN_PASSWORD is not set on the server — the admin console is disabled.',
      });
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequest('Invalid login body');
    }
    const ok = await verifyAdminPassword(parsed.data.password);
    if (!ok) {
      return res.status(401).json({ error: 'admin_bad_password', message: 'Incorrect admin password.' });
    }
    const token = issueAdminSessionToken();
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ADMIN_SESSION_TTL_MS,
      path: '/',
    });
    return res.json({ token, expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString() });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  return res.json({ ok: true });
});

/* GET /verify — used by the SPA on mount to check whether the stored
   token is still valid (avoids a pointless form when it is). */
router.get('/verify', (req, res) => {
  const header = req.headers['x-admin-token'];
  const cookie = typeof req.cookies?.[ADMIN_COOKIE] === 'string' ? req.cookies[ADMIN_COOKIE] : null;
  const token = typeof header === 'string' && header ? header : cookie;
  return res.json({ valid: verifyAdminSessionToken(token) });
});

export default router;
