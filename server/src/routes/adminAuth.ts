/**
 * /api/admin-auth — independent password login for the /admin
 * operator console.
 *
 * POST /login  { password }  → { token, expiresAt }
 * POST /logout                → { ok: true }
 * GET  /status                → { configured, ipAllowed } (no auth —
 *                               the login form needs to know whether to
 *                               render at all; it never reveals whether
 *                               a password guess was close)
 * GET  /verify                → { valid } (token check for the SPA)
 *
 * Defence layers in application order (details in services/adminAuth.ts):
 *   0. adminLoginLimiter — dedicated 5-attempts/15min/IP budget, tighter
 *      than the shared authLimiter so admin brute force does not share
 *      (or consume) the user-login budget.
 *   1. IP allowlist — ADMIN_IP_ALLOWLIST; non-listed IPs get an
 *      identical 403 before any credential work.
 *   2. Per-IP lockout — DB-backed login_failures under `admin-ip:<ip>`
 *      (process-global across workers), threshold 3 / 15 min.
 *   3. bcrypt (cost 12) verification — slow-hash brute-force resistance.
 *
 * The token is returned in the JSON body and also set as an httpOnly
 * cookie — the SPA keeps it in sessionStorage, and the cookie covers a
 * reload of /admin without a re-login.
 */
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  verifyAdminPassword,
  adminPasswordConfigured,
  issueAdminSessionToken,
  verifyAdminSessionToken,
  isAdminIpAllowed,
  adminLockoutKey,
  ADMIN_SESSION_TTL_MS,
} from '../services/adminAuth.js';
import { checkLockout, recordFailure, recordSuccess } from '../services/loginLockout.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { BadRequest } from '../lib/errors.js';

const router = Router();

const ADMIN_COOKIE = 'socrates_admin_session';

/* Dedicated admin-login budget: tighter than the shared authLimiter
   (10/15min) because the admin password is the single credential
   guarding the provider configs. Keyed on IP only — there is no
   username field to combine. */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `admin-login:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many admin login attempts; try again later.' },
});

const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

/* GET /status — public. `configured` tells the form whether to render
   the password field at all; `ipAllowed` tells the operator (or a
   blocked client) whether the allowlist is what's stopping them, so a
   legitimate admin behind a new office IP gets an actionable message
   instead of a silent 403. Neither field leaks credential state. */
router.get('/status', (req, res) => {
  return res.json({
    configured: adminPasswordConfigured(),
    ipAllowed: isAdminIpAllowed(req.ip),
  });
});

router.post('/login', authLimiter, adminLoginLimiter, async (req, res, next) => {
  try {
    /* Layer 1 — IP allowlist. Identical 403 for allowlisted=false
       whether or not ADMIN_PASSWORD is set, so the endpoint does not
       reveal configuration state to a blocked client. */
    if (!isAdminIpAllowed(req.ip)) {
      return res.status(403).json({
        error: 'admin_ip_not_allowed',
        message: 'This client IP is not permitted to reach the admin console.',
      });
    }
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
    /* Layer 2 — per-IP lockout. Checked BEFORE the bcrypt compare so
       a locked-out attacker never gets another slow-hash attempt. */
    const lockKey = adminLockoutKey(req.ip);
    if (lockKey) await checkLockout(lockKey, 3);

    const ok = await verifyAdminPassword(parsed.data.password);
    if (!ok) {
      /* Layer 2 bookkeeping — count the miss (threshold 3). The
         failure recording is awaited so a concurrent burst cannot
         race past the threshold; a recording error still returns the
         generic 401 (the lockout is best-effort hardening on top of
         the limiters, never a way to turn a wrong password into a
         500). */
      if (lockKey) {
        try { await recordFailure(lockKey, 3); } catch (err) {
          console.warn('[adminAuth] lockout record failed:', (err as Error).message);
        }
      }
      return res.status(401).json({ error: 'admin_bad_password', message: 'Incorrect admin password.' });
    }
    /* Successful login clears the failure counter so a legit operator
       who mistyped twice is not locked out on the next miss. */
    if (lockKey) await recordSuccess(lockKey);

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
   token is still valid (avoids a pointless form when it is). The
   allowlist is enforced here too: a token stolen from a
   non-allowlisted IP is worthless. */
router.get('/verify', (req, res) => {
  if (!isAdminIpAllowed(req.ip)) {
    return res.json({ valid: false });
  }
  const header = req.headers['x-admin-token'];
  const cookie = typeof req.cookies?.[ADMIN_COOKIE] === 'string' ? req.cookies[ADMIN_COOKIE] : null;
  const token = typeof header === 'string' && header ? header : cookie;
  return res.json({ valid: verifyAdminSessionToken(token) });
});

export default router;
